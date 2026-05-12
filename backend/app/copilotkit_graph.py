"""LangGraph wrapper around AgentService.respond for CopilotKit / AG-UI.

gpt-oss-20b's vLLM serving config does not emit OpenAI-format `tool_calls`
(it routes tool intents into a `reasoning` channel instead — see the long-
standing workaround in `llm_client.chat_completion_json`). That makes the
standard CopilotKit "bind_tools + ToolNode" path unusable.

Instead we wrap our existing hand-rolled `agent_service.respond()` inside a
single LangGraph node and surface its output (cards, audio, visemes,
translation) via custom state fields. The frontend reads them through
`useCoAgent`. The legacy `/api/agent-respond-elevenlabs` endpoint stays
mounted as a runtime-toggleable fallback.
"""

import asyncio
import base64
import io
import logging
import os
import wave
from typing import Annotated, Optional, TypedDict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level lazy imports for LangGraph
# ---------------------------------------------------------------------------
# These are guarded so the module stays importable when CopilotKit deps
# aren't installed — main.py wraps build_agent() in its own try/except and
# falls back to the legacy /api/agent-respond-elevenlabs endpoint.

try:
    from langgraph.graph.message import add_messages  # type: ignore
    _HAS_LANGGRAPH = True
except ImportError:  # pragma: no cover
    add_messages = None  # type: ignore
    _HAS_LANGGRAPH = False


# ---------------------------------------------------------------------------
# State schema (defined at module scope so typing.get_type_hints can resolve
# `add_messages` via module globals during StateGraph construction).
# ---------------------------------------------------------------------------

class ConciergeState(TypedDict, total=False):
    """LangGraph state shape for the Carnival concierge.

    `messages` is the AG-UI canonical list — CopilotKit pushes user messages
    here and reads assistant replies from the same list. Every other field
    is custom and surfaced to the frontend via `useCoAgent`.
    """
    messages: Annotated[list, add_messages]
    cruise: Optional[dict]
    guest: Optional[dict]
    language: str
    folio_balance: Optional[float]
    image_prop_id: Optional[str]
    image_prompt_hint: Optional[str]
    compute_visemes: bool
    # Output fields populated by the concierge node:
    audio_b64: Optional[str]
    mime: Optional[str]
    visemes: Optional[list]
    card_payload: Optional[dict]
    spoken_text: Optional[str]
    vision_unavailable: Optional[bool]


# ---------------------------------------------------------------------------
# The single graph node
# ---------------------------------------------------------------------------

async def _concierge_node(state: ConciergeState) -> dict:
    """Run one agent turn. Pulls services lazily to avoid import-time dep issues."""
    from langchain_core.messages import AIMessage, HumanMessage

    from app.services import config_store, ship_data, translate_service, vision_service
    from app.services.agent_service import AgentService

    agent = AgentService()

    # Convert LangGraph/LangChain messages into the dict shape AgentService expects.
    msgs_for_agent: list[dict] = []
    for m in state.get("messages", []):
        role = (
            "user" if isinstance(m, HumanMessage)
            else "assistant" if isinstance(m, AIMessage)
            else getattr(m, "type", "user")
        )
        # type for HumanMessage is "human", for AIMessage is "ai" — normalize.
        if role == "human":
            role = "user"
        elif role == "ai":
            role = "assistant"
        content = getattr(m, "content", None) or (m if isinstance(m, str) else "")
        if content:
            msgs_for_agent.append({"role": role, "content": content})

    if not msgs_for_agent:
        return {"messages": [AIMessage(content="How can I help, Mr. Garcia?")]}

    # Optional vision prelude (mirrors /api/agent-respond-elevenlabs path).
    vision_unavailable = False
    image_prop_id = state.get("image_prop_id")
    image_prompt_hint = state.get("image_prompt_hint")
    if image_prop_id:
        prop_path = os.path.join(
            os.path.dirname(__file__), "data", "demo_props", f"{image_prop_id}.jpg"
        )
        description = None
        prompt_for_vision = image_prompt_hint or (
            "You are an onboard cruise concierge. Read all text on this image "
            "and summarise the key facts (date, time, location, names, prices) "
            "in one short paragraph."
        )
        if os.path.exists(prop_path):
            with open(prop_path, "rb") as f:
                img_bytes = f.read()
            description = await asyncio.to_thread(
                vision_service.describe_image,
                image_bytes=img_bytes,
                prompt=prompt_for_vision,
            )
        if description:
            msgs_for_agent.append({
                "role": "user",
                "content": (
                    f"[Guest is showing you something. Image content (transcribed): {description}]\n"
                    f"{prompt_for_vision}"
                ),
            })
        else:
            vision_unavailable = True

    # Run the existing agent loop (LLM tool dispatch + finalize).
    agent_result = await agent.respond("copilotkit", msgs_for_agent)
    bot_text = agent_result.get("bot_text") or "How can I help?"
    card = agent_result.get("card_payload")

    # Optional translation pass (Gemma).
    spoken_text = bot_text
    language = (state.get("language") or "en").lower()
    if language and language != "en":
        translated = await asyncio.to_thread(
            translate_service.translate, bot_text, language
        )
        if translated:
            spoken_text = translated
            if card is not None:
                card = {**card, "translated_caption": translated}

    # TTS leg (lazy-imported services from main).
    audio_b64 = ""
    mime = "audio/mpeg"
    visemes: list = []
    try:
        # Imports here so the graph file itself doesn't pull these at module load.
        from app.main import elevenlabs_service, kokoro_service

        compute_visemes = bool(state.get("compute_visemes", True))
        tts_provider = config_store.get_tts_provider()

        if tts_provider == "kokoro" and kokoro_service:
            audio_bytes = await kokoro_service.text_to_speech_fast(text=spoken_text)
            mime = "audio/wav"
            if compute_visemes and elevenlabs_service:
                with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                    duration_ms = wf.getnframes() / float(wf.getframerate()) * 1000.0
                visemes = elevenlabs_service.fallback_visemes_from_text(
                    spoken_text, duration_ms
                )
        else:
            if not elevenlabs_service:
                raise RuntimeError("ElevenLabs service not available")
            voice_id = config_store.get_voice_id()
            if compute_visemes:
                audio_bytes, alignment = await elevenlabs_service.text_to_speech_with_alignment(
                    text=spoken_text, voice_id=voice_id
                )
                duration_ms = len(audio_bytes) / 16
                visemes = elevenlabs_service.alignment_to_visemes(alignment, duration_ms)
                if not visemes:
                    visemes = elevenlabs_service.fallback_visemes_from_text(
                        spoken_text, duration_ms
                    )
            else:
                audio_bytes = await elevenlabs_service.text_to_speech_fast(
                    text=spoken_text, voice_id=voice_id
                )
            mime = "audio/mpeg"
        audio_b64 = base64.b64encode(audio_bytes).decode()
    except Exception as e:
        logger.warning("CopilotKit graph: TTS failed (%s) — returning text only", e)

    # Build the AI message that CopilotKit's chat UI will render.
    ai_msg = AIMessage(content=bot_text)

    return {
        "messages": [ai_msg],
        "audio_b64": audio_b64,
        "mime": mime,
        "visemes": visemes,
        "card_payload": card,
        "spoken_text": spoken_text,
        "vision_unavailable": vision_unavailable,
    }


# ---------------------------------------------------------------------------
# Compile + agent factory
# ---------------------------------------------------------------------------

def build_graph():
    """Compile the LangGraph. Raises ImportError if LangGraph deps are missing.

    AG-UI's `LangGraphAgent.run()` calls `graph.aget_state()` which requires
    a checkpointer; without one we get `ValueError: No checkpointer set`.
    InMemorySaver is fine for the demo (state resets when uvicorn restarts —
    matches the existing in-memory folio behaviour).
    """
    if not _HAS_LANGGRAPH:
        raise ImportError("LangGraph not installed; cannot build CopilotKit graph")
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import START, END, StateGraph

    graph = StateGraph(ConciergeState)
    graph.add_node("concierge", _concierge_node)
    graph.add_edge(START, "concierge")
    graph.add_edge("concierge", END)
    return graph.compile(checkpointer=InMemorySaver())


def build_agent():
    """Wrap the compiled graph in a LangGraphAgent ready for the AG-UI mount."""
    from ag_ui_langgraph import LangGraphAgent
    return LangGraphAgent(
        name="marina",
        description=(
            "Carnival Cruise Line onboard concierge. Books dining and shows, "
            "explains shore excursions, looks up your folio, and upgrades drink "
            "packages. Speaks 8 languages."
        ),
        graph=build_graph(),
    )
