from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi import WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import os
import asyncio
import json
import httpx
from dotenv import load_dotenv

# Load environment variables BEFORE importing app.services.* — asr_service
# reads STT_API_URL at module-level (not inside a method), so it'd see an
# empty value if load_dotenv runs after the import. The same load_dotenv
# call is otherwise idempotent.
load_dotenv()

from app.services.asr_service import ASRService
from app.services.rag_service import RAGService
from app.services.elevenlabs_service import ElevenLabsService
from app.services.agent_service import AgentService
from app.services import config_store
from app.services import ship_data
import io
import logging
import uuid
import wave
import base64

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Auto-bake ElevenLabs filler audio for all configured voices (first boot only).
    await _ensure_elevenlabs_fillers_baked()
    yield


app = FastAPI(title="Avatar Conversation API", lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed admin config defaults (idempotent — safe to call every startup)
try:
    config_store.seed_defaults()
    logger.info("Admin config store seeded")
except Exception as e:
    logger.warning(f"Admin config store seed failed (MongoDB may not be ready): {e}")

# Initialize services
asr_service = ASRService()
try:
    rag_service = RAGService()
    logger.info("RAG service initialized")
except Exception as e:
    logger.warning(f"RAG service not available (not needed for Carnival demo): {e}")
    rag_service = None

# Onboard concierge agent (Carnival demo).
# Uses gpt-oss-20b in JSON-output mode for tool dispatch — see agent_service.py.
try:
    agent_service = AgentService()
    logger.info("Onboard concierge agent initialized")
except Exception as e:
    logger.warning(f"Agent service not available: {e}")
    agent_service = None

# ElevenLabs and HeyGen services
try:
    elevenlabs_service = ElevenLabsService()
    logger.info("ElevenLabs service initialized")
except Exception as e:
    logger.warning(f"ElevenLabs service not available: {e}")
    elevenlabs_service = None

# LiveAvatar service for WebRTC streaming
try:
    from app.services.liveavatar_service import LiveAvatarService
    liveavatar_service = LiveAvatarService()
    logger.info("LiveAvatar service initialized")
except Exception as e:
    logger.warning(f"LiveAvatar service not available: {e}")
    liveavatar_service = None

# Temporary storage
TEMP_DIR = "temp_files"
os.makedirs(TEMP_DIR, exist_ok=True)

# Store conversation UUIDs per session (in production, use Redis or database)
conversation_sessions = {}

# Track the last LiveAvatar session so we can stop it before creating a new one.
# HeyGen enforces a 1-concurrent-session limit per API key; failing to stop the
# previous session before starting a new one returns HTTP 400.
_liveavatar_session_id: str | None = None

# Map session_id → actual LiveKit cloud URL.
# Populated when we intercept /v1/sessions/start and rewrite livekit_url to our proxy.
# Used by the /ws/livekit/{path} WebSocket proxy endpoint.
_livekit_session_urls: dict[str, str] = {}

# Test mode configuration
ENABLE_TEST_MODE = os.getenv("ENABLE_TEST_MODE", "false").lower() == "true"
TEST_FALLBACK_MESSAGE = os.getenv("TEST_FALLBACK_MESSAGE", "I am Bryan, AI Assistant")

if ENABLE_TEST_MODE:
    logger.warning("TEST MODE ENABLED - Audio errors will use fallback message")
    logger.warning(f"   Fallback message: {TEST_FALLBACK_MESSAGE}")

@app.post("/api/transcribe")
async def transcribe_audio_only(audio: UploadFile = File(...)):
    """
    Quick endpoint: Just transcribe audio to text (ASR only)
    Returns immediately after transcription (~2-3 seconds)
    """
    try:
        logger.info("Transcribing audio...")

        # Save uploaded audio temporarily
        audio_path = os.path.join(TEMP_DIR, f"input_{uuid.uuid4()}_{audio.filename}")
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        # ASR only — returns (text, detected_language_code)
        transcribed_text, detected_language = await asr_service.transcribe_audio(audio_path)
        logger.info(f"Transcription [{detected_language}]: {transcribed_text}")

        # Clean up
        if os.path.exists(audio_path):
            os.remove(audio_path)

        return {"text": transcribed_text, "detected_language": detected_language}

    except Exception as e:
        logger.error(f"Error transcribing: {str(e)}")
        
        # Test mode: Return fallback instead of error
        if ENABLE_TEST_MODE:
            logger.warning("TEST MODE: Using fallback text due to transcription error")
            return {"text": "Hello", "warning": "Transcription failed, using test fallback"}
        
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/video/{filename}")
async def get_video(filename: str):
    """Serve generated video files with optimized streaming and Range support"""
    video_path = os.path.join(TEMP_DIR, filename)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")

    # Use FileResponse with headers to enable progressive playback
    headers = {
        "Accept-Ranges": "bytes",  # ENABLE range requests for progressive loading
        "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
    }
    return FileResponse(
        video_path,
        media_type="video/mp4",
        headers=headers
    )

@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    """Serve generated audio files"""
    audio_path = os.path.join(TEMP_DIR, filename)
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(audio_path, media_type="audio/wav")

@app.post("/api/rag-only")
async def rag_only(request: dict):
    """
    RAG-only endpoint for 2D Avatar mode.
    Accepts conversation history and returns AI response text without TTS or video.

    Request format:
    {
        "uuid": "conversation-uuid",
        "messages": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"}
        ]
    }
    """
    try:
        conversation_uuid = request.get("uuid") or str(uuid.uuid4())
        messages = request.get("messages", [])

        logger.info(f"RAG-only request with UUID: {conversation_uuid}")
        logger.info(f"Message history: {len(messages)} messages")

        # Generate response from RAG with conversation history
        try:
            response_text = await rag_service.generate_response_with_history(conversation_uuid, messages)
        except Exception as rag_err:
            logger.warning(f"RAG error: {rag_err}")
            
            # Test mode fallback
            if ENABLE_TEST_MODE:
                logger.warning(f"TEST MODE: Using fallback message")
                response_text = TEST_FALLBACK_MESSAGE
            else:
                raise rag_err
        
        logger.info(f"RAG response: {response_text}")

        return {"bot_text": response_text}
    except Exception as e:
        logger.error(f"RAG error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/elevenlabs-tts")
async def elevenlabs_tts(text: str = Form(...), voice_id: str = Form(None)):
    """
    ElevenLabs TTS with character alignment for 2D Avatar mode

    Returns audio + visemes derived from character timing
    """
    if not elevenlabs_service:
        raise HTTPException(status_code=503, detail="ElevenLabs service not available")

    try:
        logger.info(f"ElevenLabs TTS request")

        # Generate speech with alignment
        audio_bytes, alignment = await elevenlabs_service.text_to_speech_with_alignment(
            text=text,
            voice_id=voice_id
        )

        # Calculate audio duration (for MP3, estimate based on file size)
        # For more accuracy, use pydub or other audio library
        estimated_duration_ms = len(audio_bytes) / 16  # Rough estimate for MP3

        # Convert alignment to visemes and fallback if missing
        visemes = elevenlabs_service.alignment_to_visemes(alignment, estimated_duration_ms)
        if not visemes:
            # Fallback: evenly distribute visemes across the text
            visemes = elevenlabs_service.fallback_visemes_from_text(text, estimated_duration_ms)

        # Encode audio to base64
        audio_b64 = base64.b64encode(audio_bytes).decode()

        logger.info(f"ElevenLabs TTS: {len(audio_bytes)} bytes, {len(visemes)} visemes")

        return {
            "audio_b64": audio_b64,
            "mime": "audio/mpeg",  # ElevenLabs returns MP3
            "visemes": visemes
        }

    except Exception as e:
        logger.error(f"ElevenLabs TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-response-elevenlabs")
async def generate_response_elevenlabs(request: dict):
    """
    Full pipeline for 2D Avatar mode with ElevenLabs:
    RAG → ElevenLabs TTS (with visemes)

    Request format:
    {
        "uuid": "conversation-uuid",
        "messages": [conversation history],
        "mode": "2d_avatar"
    }
    """
    import time

    conversation_uuid = request.get("uuid") or str(uuid.uuid4())
    messages = request.get("messages", [])

    start_time = time.time()
    timings = {}

    try:
        logger.info(f"Generating 2D response")
        logger.info(f"UUID: {conversation_uuid}")
        logger.info(f"History: {len(messages)} messages")

        # Step 1: RAG
        step_start = time.time()
        try:
            response_text = await rag_service.generate_response_with_history(conversation_uuid, messages)
        except Exception as rag_err:
            logger.warning(f"RAG with history failed: {rag_err}")

            # Test mode fallback
            if ENABLE_TEST_MODE:
                logger.warning(f"TEST MODE: Using fallback message")
                response_text = TEST_FALLBACK_MESSAGE
            else:
                # Try single message fallback
                logger.warning("Attempting single message fallback...")
                last_user = None
                for m in reversed(messages):
                    if m.get("role") == "user" and m.get("content"):
                        last_user = m.get("content")
                        break
                if not last_user:
                    raise rag_err
                response_text = await rag_service.generate_response(last_user, conversation_uuid)

        timings['rag'] = time.time() - step_start
        logger.info(f"RAG: {timings['rag']:.2f}s")

        # Step 2: TTS (ElevenLabs)
        step_start = time.time()
        if not elevenlabs_service:
            raise HTTPException(status_code=503, detail="ElevenLabs service not available")
        active_voice_id = config_store.get_voice_id()
        audio_bytes = await elevenlabs_service.text_to_speech_fast(text=response_text, voice_id=active_voice_id)
        mime = "audio/mpeg"

        audio_b64 = base64.b64encode(audio_bytes).decode()
        timings['tts'] = time.time() - step_start
        logger.info(f"TTS (elevenlabs, fast): {timings['tts']:.2f}s")

        total_time = time.time() - start_time
        logger.info(f"Total: {total_time:.2f}s")

        return {
            "bot_text": response_text,
            "audio_b64": audio_b64,
            "mime": mime,
            "visemes": []
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-respond-elevenlabs")
async def agent_respond_elevenlabs(request: dict):
    """Onboard concierge pipeline (Carnival demo).

    Optional fields beyond uuid/messages:
      - image_prop_id : id of a pre-loaded prop image to "show" to the avatar.
                        Backend resolves to backend/app/data/demo_props/<id>.jpg,
                        runs Qwen Omni, and prepends a synthetic user turn.
      - language      : ISO-639 target for the spoken reply (en/es/fr/de/it/ja/zh/ar).
                        English passes through; everything else routes through
                        Gemma Translate before TTS.
    """
    import time

    if not agent_service:
        raise HTTPException(status_code=503, detail="Agent service not available")

    conversation_uuid = request.get("uuid") or str(uuid.uuid4())
    messages = list(request.get("messages") or [])
    image_prop_id = request.get("image_prop_id")
    image_prompt_hint = request.get("image_prompt_hint")  # per-prop guidance from frontend
    language = (request.get("language") or "en").lower()
    # 2D Zippy/Marina avatar relies on visemes for mouth animation.
    # 3D HeyGen does its own lipsync over WebRTC and never needs them.
    compute_visemes = bool(request.get("compute_visemes", False))
    vision_unavailable = False  # surfaced to frontend when Qwen Omni is down

    start_time = time.time()
    timings = {}

    try:
        logger.info(
            f"Agent respond (2D): UUID={conversation_uuid} history={len(messages)} "
            f"prop={image_prop_id} lang={language}"
        )

        # --- Optional vision prelude: read the prop image and inject as context ---
        if image_prop_id:
            step_start = time.time()
            from app.services import vision_service
            prop_path = os.path.join(
                os.path.dirname(__file__), "data", "demo_props", f"{image_prop_id}.jpg"
            )
            description = None
            vision_prompt = image_prompt_hint or (
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
                    prompt=vision_prompt,
                )
            else:
                logger.warning(f"Vision prop not found on disk: {prop_path}")
            timings["vision"] = time.time() - step_start
            logger.info(f"Vision: {timings['vision']:.2f}s · description_len={len(description or '')}")

            if description:
                messages = messages + [
                    {
                        "role": "user",
                        "content": (
                            f"[Guest is showing you something. Image content (transcribed): {description}]\n"
                            f"{vision_prompt}"
                        ),
                    }
                ]
            else:
                # Qwen down or prop missing — flag it so the frontend can render
                # a visible "Couldn't read that image right now" note instead of
                # silently letting the agent answer without context.
                vision_unavailable = True
                messages = messages + [
                    {
                        "role": "user",
                        "content": (
                            f"[Guest tried to show you a {image_prop_id.replace('-', ' ')} "
                            "but vision is unavailable. Acknowledge briefly and offer to help "
                            "from what they've already told you.]"
                        ),
                    }
                ]

        # --- Agent turn ---
        step_start = time.time()
        try:
            agent_result = await agent_service.respond(conversation_uuid, messages)
        except Exception as agent_err:
            logger.warning(f"Agent failed: {agent_err}")
            if ENABLE_TEST_MODE:
                agent_result = {"bot_text": TEST_FALLBACK_MESSAGE, "card_payload": None}
            else:
                raise

        bot_text = agent_result.get("bot_text") or "How can I help?"
        card_payload = agent_result.get("card_payload")
        folio_balance = agent_result.get("folio_balance")
        suggestions = agent_result.get("suggestions") or []
        timings["agent"] = time.time() - step_start
        _cp = card_payload[0] if isinstance(card_payload, list) else card_payload
        logger.info(f"Agent: {timings['agent']:.2f}s · card={_cp.get('card') or _cp.get('topic') or 'none' if _cp else 'none'}")

        # --- Optional translation pass ---
        spoken_text = bot_text
        if language and language != "en":
            step_start = time.time()
            from app.services import translate_service
            translated = await asyncio.to_thread(translate_service.translate, bot_text, language)
            timings["translate"] = time.time() - step_start
            if translated:
                spoken_text = translated
                if card_payload is not None and not isinstance(card_payload, list):
                    card_payload = {**card_payload, "translated_caption": translated}
                logger.info(f"Translate: {timings['translate']:.2f}s")
            else:
                logger.warning("Translation returned None; speaking English fallback")

        step_start = time.time()
        visemes: list = []

        if not elevenlabs_service:
            raise HTTPException(status_code=503, detail="ElevenLabs service not available")
        active_voice_id = config_store.get_voice_id()
        if compute_visemes:
            audio_bytes, alignment = await elevenlabs_service.text_to_speech_with_alignment(
                text=spoken_text, voice_id=active_voice_id
            )
            duration_ms = len(audio_bytes) / 16
            visemes = elevenlabs_service.alignment_to_visemes(alignment, duration_ms)
            if not visemes:
                visemes = elevenlabs_service.fallback_visemes_from_text(spoken_text, duration_ms)
        else:
            audio_bytes = await elevenlabs_service.text_to_speech_fast(
                text=spoken_text, voice_id=active_voice_id, language=language if language != "en" else None
            )
        mime = "audio/mpeg"

        audio_b64 = base64.b64encode(audio_bytes).decode()
        timings["tts"] = time.time() - step_start
        logger.info(f"TTS (elevenlabs): {timings['tts']:.2f}s · visemes={len(visemes)}")

        total = time.time() - start_time
        logger.info(f"Total agent pipeline: {total:.2f}s")

        return {
            "bot_text": bot_text,         # original English — shown in transcript
            "spoken_text": spoken_text,   # what the avatar actually voiced (en or translated)
            "language": language,
            "audio_b64": audio_b64,
            "mime": mime,
            "visemes": visemes,
            "card_payload": card_payload,
            "folio_balance": folio_balance,
            "suggestions": suggestions,
            "vision_unavailable": vision_unavailable,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Agent endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-respond-stream")
async def agent_respond_stream(request: dict):
    """SSE streaming endpoint for the Carnival concierge.

    Yields server-sent events:
      data: {"type": "text_delta", "text": "..."}   — streamed reply tokens
      data: {"type": "done", "card_payload": ..., "folio_balance": ...,
             "suggestions": [...], "audio_b64": ..., "mime": "audio/mpeg"}
      data: [DONE]
    """
    if not agent_service:
        raise HTTPException(status_code=503, detail="Agent service not available")

    conversation_uuid = request.get("uuid") or str(uuid.uuid4())
    messages = list(request.get("messages") or [])
    language = (request.get("language") or "en").lower()

    async def event_stream():
        full_text = ""
        done_event = None

        try:
            async for event in agent_service.respond_stream(conversation_uuid, messages):
                if event["type"] == "text_delta":
                    full_text += event.get("text", "")
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "done":
                    done_event = event
        except Exception as e:
            logger.error("SSE stream error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'text_delta', 'text': 'Something went wrong — please try again.'})}\n\n"

        # After text is fully streamed, run TTS then send done event
        audio_b64 = None
        mime = "audio/mpeg"
        if full_text.strip() and elevenlabs_service:
            try:
                speak_text = full_text
                if language and language != "en":
                    from app.services import translate_service
                    translated = await asyncio.to_thread(translate_service.translate, full_text, language)
                    if translated:
                        speak_text = translated
                active_voice_id = config_store.get_voice_id()
                audio_bytes = await elevenlabs_service.text_to_speech_fast(
                    text=speak_text, voice_id=active_voice_id
                )
                audio_b64 = base64.b64encode(audio_bytes).decode()
            except Exception as e:
                logger.warning("SSE TTS failed: %s", e)

        if done_event is None:
            done_event = {"type": "done", "card_payload": None, "folio_balance": None, "suggestions": []}

        done_event["audio_b64"] = audio_b64
        done_event["mime"] = mime
        yield f"data: {json.dumps(done_event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/generate-response-liveavatar")
async def generate_response_liveavatar(request: dict):
    """
    Full pipeline for LiveAvatar 3D mode:
    RAG → ElevenLabs TTS → Convert MP3 to PCM 24kHz for LiveAvatar

    Request format:
    {
        "uuid": "conversation-uuid",
        "messages": [conversation history]
    }
    
    Returns:
    {
        "bot_text": "...",
        "audio_b64": "base64-encoded PCM 24kHz audio",
        "mime": "audio/pcm"
    }
    """
    import time

    conversation_uuid = request.get("uuid") or str(uuid.uuid4())
    messages = request.get("messages", [])

    start_time = time.time()
    timings = {}

    try:
        logger.info(f"Generating LiveAvatar response")
        logger.info(f"UUID: {conversation_uuid}")
        logger.info(f"History: {len(messages)} messages")

        # Step 1: RAG
        step_start = time.time()
        try:
            response_text = await rag_service.generate_response_with_history(conversation_uuid, messages)
        except Exception as rag_err:
            logger.warning(f"RAG with history failed: {rag_err}")

            # Test mode fallback
            if ENABLE_TEST_MODE:
                logger.warning(f"TEST MODE: Using fallback message")
                response_text = TEST_FALLBACK_MESSAGE
            else:
                # Try single message fallback
                logger.warning("Attempting single message fallback...")
                last_user = None
                for m in reversed(messages):
                    if m.get("role") == "user" and m.get("content"):
                        last_user = m.get("content")
                        break
                if not last_user:
                    raise rag_err
                response_text = await rag_service.generate_response(last_user, conversation_uuid)

        timings['rag'] = time.time() - step_start
        logger.info(f"RAG: {timings['rag']:.2f}s")

        # Step 2: TTS → PCM 24kHz mono s16le for HeyGen repeatAudio()
        step_start = time.time()
        if not elevenlabs_service:
            raise HTTPException(status_code=503, detail="ElevenLabs service not available")
        active_voice_id = config_store.get_voice_id()
        mp3_bytes = await elevenlabs_service.text_to_speech_fast(text=response_text, voice_id=active_voice_id)
        timings['tts'] = time.time() - step_start
        logger.info(f"ElevenLabs TTS: {timings['tts']:.2f}s, voice={active_voice_id}, size: {len(mp3_bytes)} bytes")

        # Convert MP3 → raw PCM 24kHz via FFmpeg
        step_start = time.time()
        from app.utils.audio_converter import convert_mp3_to_pcm_24khz
        pcm_bytes = convert_mp3_to_pcm_24khz(mp3_bytes)
        timings['pcm_convert'] = time.time() - step_start
        logger.info(f"PCM convert: {timings['pcm_convert']:.2f}s, size: {len(pcm_bytes)} bytes")

        audio_b64 = base64.b64encode(pcm_bytes).decode()

        total_time = time.time() - start_time
        logger.info(f"Total: {total_time:.2f}s, PCM size: {len(pcm_bytes)} bytes, base64: {len(audio_b64)} bytes")

        return {
            "bot_text": response_text,
            "audio_b64": audio_b64,
            "mime": "audio/pcm"
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "healthy", "services": {
        "asr": os.getenv("ASR_SERVICE_URL"),
        "rag": os.getenv("RAG_SERVICE_URL"),
        "elevenlabs": "configured" if elevenlabs_service else "unavailable",
        "liveavatar": "configured" if liveavatar_service else "unavailable",
        "copilotkit": "mounted" if _COPILOTKIT_MOUNTED else "not_mounted",
    }}


# ---------------------------------------------------------------------------
# CopilotKit / AG-UI mount (Iteration 4)
#
# Mounted only when the `copilotkit` + `ag_ui_langgraph` packages are available.
# Frontend toggles between this and the legacy /api/agent-respond-elevenlabs via
# branding.useCopilotKit. Failure to mount is non-fatal — legacy path keeps working.
# ---------------------------------------------------------------------------

_COPILOTKIT_MOUNTED = False
try:
    from ag_ui_langgraph import add_langgraph_fastapi_endpoint as _add_aguilg
    from app.copilotkit_graph import build_agent as _build_concierge_agent
    _add_aguilg(app, _build_concierge_agent(), path="/api/copilotkit")
    _COPILOTKIT_MOUNTED = True
    logger.info("CopilotKit / AG-UI endpoint mounted at /api/copilotkit")
except ImportError as _e:
    logger.warning(
        f"CopilotKit deps not installed — /api/copilotkit not mounted ({_e}). "
        "Legacy /api/agent-respond-elevenlabs path remains operational."
    )
except Exception as _e:
    logger.warning(f"CopilotKit mount failed ({_e}); legacy path still available")


# --- Filler Audio (ElevenLabs only, two language caches loaded from disk at startup) ---
_filler_cache_en = []
_filler_cache_es = []

_FILLER_TEXTS = {
    "en": [
        {"id": 1, "text": "Sure, give me just a moment."},
        {"id": 2, "text": "One moment please."},
        {"id": 3, "text": "Let me pull that up for you."},
        {"id": 4, "text": "Of course, just a second."},
        {"id": 5, "text": "Alright, let me check on that."},
        {"id": 6, "text": "Absolutely, one moment."},
    ],
    "es": [
        {"id": 1, "text": "Claro, dame un momento."},
        {"id": 2, "text": "Un momento por favor."},
        {"id": 3, "text": "Déjame verificar eso para ti."},
        {"id": 4, "text": "Por supuesto, un segundo."},
        {"id": 5, "text": "Bien, déjame revisar eso."},
        {"id": 6, "text": "Absolutamente, un momento."},
    ],
}

_FILLER_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'filler_audio')


def _is_mp3_data(data: bytes) -> bool:
    """Check if raw bytes look like MP3 data (not raw PCM)."""
    if len(data) < 4:
        return False
    if data[:3] == b'ID3':
        return True
    if data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return True
    return False


def _load_filler_lang(voice_id: str, lang: str) -> list:
    """Load one language's filler PCMs into a cache list. Returns [] on miss."""
    from app.utils.audio_converter import convert_mp3_to_pcm_24khz

    # New layout: {voice_id}/{lang}/fillers.json
    lang_dir = os.path.join(_FILLER_BASE_DIR, voice_id, lang)
    manifest_path = os.path.join(lang_dir, 'fillers.json')

    if not os.path.exists(manifest_path):
        # Legacy flat layout fallback (English only)
        if lang == "en":
            flat_manifest = os.path.join(_FILLER_BASE_DIR, 'fillers.json')
            flat_dir = _FILLER_BASE_DIR
            if os.path.exists(flat_manifest):
                lang_dir = flat_dir
                manifest_path = flat_manifest
            else:
                return []
        else:
            return []

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    cache = []
    for entry in manifest:
        pcm_path = os.path.join(lang_dir, entry['filename'])
        if not os.path.exists(pcm_path):
            continue
        with open(pcm_path, 'rb') as f:
            raw_bytes = f.read()
        if _is_mp3_data(raw_bytes):
            try:
                pcm_bytes = convert_mp3_to_pcm_24khz(raw_bytes)
            except Exception as e:
                logger.error(f"Failed to convert {entry['filename']}: {e}")
                continue
        else:
            pcm_bytes = raw_bytes
        cache.append({
            "id": entry['id'],
            "text": entry['text'],
            "audio_b64": base64.b64encode(pcm_bytes).decode(),
        })
    return cache


def _load_filler_audio(voice_id: str = None):
    """Load both language filler caches for the given voice."""
    global _filler_cache_en, _filler_cache_es

    if voice_id is None:
        try:
            voice_id = config_store.get_voice_id()
        except Exception:
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")

    _filler_cache_en = _load_filler_lang(voice_id, "en")
    _filler_cache_es = _load_filler_lang(voice_id, "es")
    logger.info(f"Filler cache loaded for voice {voice_id}: en={len(_filler_cache_en)}, es={len(_filler_cache_es)}")


async def _ensure_elevenlabs_fillers_baked():
    """At startup, bake filler PCMs for every configured ElevenLabs voice if not already on disk.

    Runs synchronously (awaited in lifespan) so fillers are ready before first request.
    Skips gracefully if ELEVEN_LABS_API_KEY is missing.
    """
    api_key = os.getenv("ELEVEN_LABS_API_KEY")
    if not api_key:
        logger.warning("ELEVEN_LABS_API_KEY not set — skipping filler audio pre-bake")
        return

    try:
        from scripts.generate_fillers import generate_filler_audio
        from pathlib import Path
        tts_cfg = config_store.get_tts()
        voices = tts_cfg.get("AVAILABLE_VOICES", [])
        for voice in voices:
            vid = voice["id"]
            label = voice.get("label", vid)
            for lang in ("en", "es"):
                lang_manifest = os.path.join(_FILLER_BASE_DIR, vid, lang, 'fillers.json')
                if os.path.exists(lang_manifest):
                    logger.info(f"Filler audio for {label} [{lang}] already present, skipping")
                    continue
                logger.info(f"Pre-baking filler audio for {label} [{lang}] (first boot)...")
                try:
                    await generate_filler_audio(
                        voice_id=vid, lang=lang,
                        out_dir=Path(_FILLER_BASE_DIR), api_key=api_key,
                    )
                    logger.info(f"Filler audio for {label} [{lang}] ready")
                except Exception as e:
                    logger.warning(f"Failed to pre-bake fillers for {label} [{lang}]: {e}")
    except Exception as e:
        logger.warning(f"Filler audio pre-bake error: {e}")


_load_filler_audio()


@app.get("/api/filler-audio")
async def get_filler_audio(lang: str = "en"):
    """Return ElevenLabs filler audio for the requested language.

    lang: "en" (default) or "es" — frontend passes this based on detected user input language.
    Falls back to English fillers if Spanish are not yet baked.
    """
    fillers = _filler_cache_es if (lang == "es" and _filler_cache_es) else _filler_cache_en
    if not fillers:
        raise HTTPException(status_code=404, detail="No filler audio files found. Run: python -m scripts.generate_fillers")
    return {"fillers": fillers}

@app.delete("/api/cleanup")
async def cleanup_temp_files():
    """Clean up old temporary files"""
    try:
        import time
        current_time = time.time()
        deleted_count = 0

        for filename in os.listdir(TEMP_DIR):
            file_path = os.path.join(TEMP_DIR, filename)
            # Delete files older than 1 hour
            if os.path.isfile(file_path) and current_time - os.path.getmtime(file_path) > 3600:
                os.remove(file_path)
                deleted_count += 1

        return {"deleted_files": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# LiveAvatar Custom Mode Endpoints
# ============================================================================

@app.post("/api/liveavatar/session")
async def create_liveavatar_session(request: dict):
    """
    Create a LiveAvatar session token for WebRTC streaming.
    Stops any existing session first — HeyGen enforces 1 concurrent session per API key.
    """
    global _liveavatar_session_id

    if not liveavatar_service:
        raise HTTPException(status_code=503, detail="LiveAvatar service not available")

    try:
        # Stop the previous session before creating a new one to avoid 400 conflicts.
        if _liveavatar_session_id:
            logger.info(f"Stopping previous LiveAvatar session: {_liveavatar_session_id}")
            await liveavatar_service.stop_session(_liveavatar_session_id)
            _liveavatar_session_id = None

        avatar_id = request.get("avatar_id")
        mode = request.get("mode", "LITE")

        logger.info(f"Creating LiveAvatar session: avatar={avatar_id}, mode={mode}")

        session_data = await liveavatar_service.create_session_token(
            avatar_id=avatar_id,
            mode=mode
        )

        _liveavatar_session_id = session_data.get("session_id")
        return session_data

    except Exception as e:
        logger.error(f"LiveAvatar session creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/liveavatar/session/stop")
async def stop_liveavatar_session(request: dict):
    """
    Explicitly stop a LiveAvatar session. Called by the frontend on component unmount
    so the server-side session ID is cleared and the next session start succeeds.
    """
    global _liveavatar_session_id

    session_id = request.get("session_id") or _liveavatar_session_id
    if not session_id:
        return {"stopped": False, "reason": "no active session"}

    if liveavatar_service:
        await liveavatar_service.stop_session(session_id)

    if _liveavatar_session_id == session_id:
        _liveavatar_session_id = None

    return {"stopped": True, "session_id": session_id}


@app.get("/api/liveavatar/avatars")
async def get_liveavatar_avatars():
    """
    Get list of available LiveAvatar avatars

    Response:
    {
        "avatars": [
            {
                "id": "...",
                "name": "...",
                "preview_url": "...",
                ...
            }
        ]
    }
    """
    if not liveavatar_service:
        raise HTTPException(status_code=503, detail="LiveAvatar service not available")

    try:
        avatars = await liveavatar_service.get_available_avatars()
        return {"avatars": avatars}

    except Exception as e:
        logger.error(f"Failed to fetch LiveAvatar avatars: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==============================================================================
# LiveKit WebSocket proxy — routes browser LiveKit connections through the server
# so Zscaler (or any corporate proxy) never sees direct browser→*.livekit.cloud traffic.
#
# How it works:
#   1. /v1/sessions/start intercepts HeyGen's start response, stores the real
#      livekit_url, and returns our proxy URL instead.
#   2. The SDK's room.connect() therefore targets our /ws/livekit/<session_id>
#      endpoint (same-origin, trusted by Zscaler).
#   3. Our backend opens the actual LiveKit WebSocket server-side and relays
#      all frames bidirectionally.
#   4. The frontend also force-enables TURN relay (iceTransportPolicy='relay')
#      so that WebRTC media uses LiveKit's TURN servers over TCP/443 rather than
#      blocked UDP paths.
# ==============================================================================

@app.post("/v1/sessions/start")
async def proxy_livekit_sessions_start(request: Request):
    """
    Intercept HeyGen's /v1/sessions/start response to replace livekit_url
    with our server-side WebSocket proxy URL.  Required when Zscaler blocks
    direct browser → *.livekit.cloud WebSocket connections.
    """
    auth = request.headers.get("Authorization", "")
    body = await request.body()
    verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
    logger.info(f"HeyGen /v1/sessions/start: auth={auth[:40]}... body={body[:200] if body else b'(empty)'}")

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=verify_ssl) as client:
            resp = await client.post(
                "https://api.liveavatar.com/v1/sessions/start",
                headers={"Authorization": auth, "Content-Type": "application/json"},
                content=body,
            )
            logger.info(f"HeyGen /v1/sessions/start status: {resp.status_code}")
            if resp.status_code >= 400:
                logger.warning(f"HeyGen /v1/sessions/start error body: {resp.text[:500]}")
            try:
                data = resp.json()
            except Exception:
                logger.error(f"HeyGen non-JSON response: {resp.text[:500]}")
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.HTTPError as e:
        logger.error(f"HeyGen /v1/sessions/start network error: {e}")
        raise HTTPException(status_code=502, detail=f"HeyGen unreachable: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"HeyGen /v1/sessions/start unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Pass HeyGen error responses (non-1000 code) straight to SDK — it handles them
    session_data = data.get("data") or {}
    livekit_url = session_data.get("livekit_url", "")
    session_id = session_data.get("session_id", "")

    if livekit_url and session_id:
        _livekit_session_urls[session_id] = livekit_url
        logger.info(f"LiveKit proxy: stored {session_id} → {livekit_url}")
        # LIVEAVATAR_PUBLIC_HOST overrides auto-detection (set to e.g. "10.14.116.61:3050").
        # Nginx passes $http_host (with port) for /v1/ so auto-detection works without the var.
        public_host = os.getenv("LIVEAVATAR_PUBLIC_HOST", "")
        host = public_host if public_host else request.headers.get("host", "localhost")
        proxy_url = f"wss://{host}/ws/livekit/{session_id}"
        data["data"]["livekit_url"] = proxy_url
        logger.info(f"LiveKit proxy: replaced livekit_url with {proxy_url}")
    else:
        logger.warning(f"LiveKit proxy: no livekit_url/session_id in HeyGen response (code={data.get('code')}): {data}")

    return JSONResponse(content=data)


@app.post("/v1/sessions/stop")
async def proxy_livekit_sessions_stop(request: Request):
    """Proxy SDK /v1/sessions/stop to HeyGen."""
    auth = request.headers.get("Authorization", "")
    body = await request.body()
    verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
    async with httpx.AsyncClient(timeout=15.0, verify=verify_ssl) as client:
        resp = await client.post(
            "https://api.liveavatar.com/v1/sessions/stop",
            headers={"Authorization": auth, "Content-Type": "application/json"},
            content=body,
        )
    try:
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except Exception:
        return JSONResponse(content={}, status_code=resp.status_code)


@app.post("/v1/sessions/keep-alive")
async def proxy_livekit_sessions_keep_alive(request: Request):
    """Proxy SDK /v1/sessions/keep-alive to HeyGen."""
    auth = request.headers.get("Authorization", "")
    body = await request.body()
    verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
    async with httpx.AsyncClient(timeout=15.0, verify=verify_ssl) as client:
        resp = await client.post(
            "https://api.liveavatar.com/v1/sessions/keep-alive",
            headers={"Authorization": auth, "Content-Type": "application/json"},
            content=body,
        )
    try:
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except Exception:
        return JSONResponse(content={}, status_code=resp.status_code)


@app.websocket("/ws/livekit/{path:path}")
async def websocket_livekit_proxy(websocket: WebSocket, path: str):
    """
    Proxy the LiveKit RTC WebSocket through our server.
    Path format: <session_id>[/rtc]  — SDK appends /rtc?access_token=...
    We look up the real LiveKit cloud URL by session_id and relay all frames.

    The URL mapping is NOT cleaned up on disconnect so that the SDK's built-in
    reconnect logic can re-open the signaling WebSocket through the same proxy
    path.  Cleanup happens in /v1/sessions/start (new session overwrites) and
    /api/liveavatar/session/stop (explicit stop).
    """
    import websockets as _ws
    import ssl as _ssl

    parts = path.split("/", 1)
    session_id = parts[0]
    rest_path = parts[1] if len(parts) > 1 else ""

    actual_livekit_base = _livekit_session_urls.get(session_id)
    if not actual_livekit_base:
        logger.warning(f"LiveKit proxy: unknown session_id {session_id}")
        # Must accept before closing so the browser gets a proper WS close frame,
        # not an HTTP error that Firefox reports as "connection refused".
        await websocket.accept()
        await websocket.close(code=1008, reason="Unknown session_id")
        return

    query = websocket.url.query
    target_url = actual_livekit_base.rstrip("/")
    if rest_path:
        target_url = f"{target_url}/{rest_path}"
    if query:
        target_url = f"{target_url}?{query}"

    logger.info(f"LiveKit proxy WS: {session_id} → {target_url[:80]}...")
    await websocket.accept()

    # Disable SSL verification for backend→LiveKit if the corporate proxy
    # intercepts TLS (same flag as LIVEAVATAR_VERIFY_SSL for httpx calls).
    verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
    if not verify_ssl:
        ssl_ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_CLIENT)
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ssl_ctx = True  # websockets default: verify using system trust store

    try:
        async with _ws.connect(
            target_url,
            ssl=ssl_ctx,
            max_size=10_000_000,
            additional_headers={"User-Agent": "Mozilla/5.0 (LiveKit-Proxy/1.0)"},
        ) as lk_ws:
            logger.info(f"LiveKit proxy WS: upstream connected [{session_id}]")

            async def browser_to_livekit():
                try:
                    while True:
                        data = await websocket.receive()
                        if data.get("bytes"):
                            await lk_ws.send(data["bytes"])
                        elif data.get("text"):
                            await lk_ws.send(data["text"])
                        elif data.get("type") == "websocket.disconnect":
                            break
                except Exception:
                    pass

            async def livekit_to_browser():
                try:
                    async for msg in lk_ws:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(browser_to_livekit(), livekit_to_browser())
            logger.info(f"LiveKit proxy WS: relay ended [{session_id}]")

    except Exception as e:
        logger.error(f"LiveKit proxy WS error [{session_id}]: {e}")
        try:
            await websocket.close(code=1011, reason="Upstream error")
        except Exception:
            pass
    # NOTE: intentionally no finally pop — keep mapping for SDK reconnect attempts.


@app.get("/ws/livekit/{path:path}")
async def livekit_validate_proxy(path: str, request: Request):
    """
    LiveKit SDK hits GET .../rtc/validate?... before reconnecting the WebSocket.
    Proxy this to the real LiveKit server so it gets a valid response.
    """
    session_id = path.split("/", 1)[0]
    actual_livekit_base = _livekit_session_urls.get(session_id)
    if not actual_livekit_base:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    rest = path[len(session_id):]  # e.g. "/rtc/validate"
    query = request.url.query
    target = actual_livekit_base.rstrip("/") + rest
    if query:
        target = f"{target}?{query}"

    verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=verify_ssl) as client:
            resp = await client.get(target)
            return JSONResponse(content=resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}, status_code=resp.status_code)
    except Exception as e:
        logger.warning(f"LiveKit validate proxy error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


# WebSocket proxy to relay browser <-> LiveAvatar (HeyGen) signaling
# Use this when the client's network blocks direct WebSocket connections
@app.websocket("/ws/liveavatar/{session_path:path}")
async def websocket_liveavatar_proxy(websocket: WebSocket, session_path: str):
    """Proxy a browser WebSocket connection to the LiveAvatar (HeyGen) signaling server.

    Browser connects to: ws://<backend>/ws/liveavatar/v2-alpha/interactive-avatar/session/<session_id>
    Backend will open a wss connection to: wss://webrtc-signaling.heygen.io/v2-alpha/interactive-avatar/session/<session_id>
    """
    import websockets

    await websocket.accept()
    heygen_base = "wss://webrtc-signaling.heygen.io"
    target_url = f"{heygen_base}/{session_path}"

    try:
        # Connect to HeyGen signaling server
        async with websockets.connect(
            target_url,
            extra_headers={
                "Origin": "https://app.heygen.com",
                "User-Agent": "Mozilla/5.0 (WebRTC Proxy)"
            },
            max_size=10_000_000
        ) as heygen_ws:

            async def to_heygen():
                try:
                    while True:
                        msg = await websocket.receive_text()
                        await heygen_ws.send(msg)
                except Exception:
                    return

            async def from_heygen():
                try:
                    async for msg in heygen_ws:
                        # msg can be bytes or str; FastAPI websocket expects text or bytes
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    return

            await asyncio.gather(to_heygen(), from_heygen())

    except websockets.exceptions.InvalidStatusCode as e:
        # Forward error to client
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": f"Upstream WS failed: {e.status_code}"}))
        except Exception:
            pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": f"Proxy error: {str(e)}"}))
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass



# ==============================================================================
# Admin Panel Proxy Routes
# ==============================================================================
# These endpoints proxy admin configuration requests to the guardrails service
# (port 10390) and content management service (port 9000).

import hashlib
import secrets

# Admin configuration
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
USER_ACCESS_CODE = os.getenv("USER_ACCESS_CODE", "")
CONTENT_MANAGER_URL = os.getenv("CONTENT_MANAGER_URL", "http://content-manager:80")
PARSE_JOB_URL = os.getenv("PARSE_JOB_URL", "http://parse-job:8087")

# Simple token-based session storage (use Redis in production)
admin_tokens = {}  # token -> expiry timestamp


def verify_admin_token(token: str) -> bool:
    """Verify admin token is valid and not expired"""
    import time
    if token in admin_tokens:
        if admin_tokens[token] > time.time():
            return True
        else:
            del admin_tokens[token]
    return False


def generate_admin_token() -> str:
    """Generate a new admin session token"""
    import time
    token = secrets.token_urlsafe(32)
    # Token valid for 24 hours
    admin_tokens[token] = time.time() + 86400
    return token


@app.post("/api/guest/lookup")
async def guest_lookup(request: dict):
    """Look up a guest by mobile number or booking reference (demo: 9999999990–9999999999)."""
    identifier = str(request.get("identifier", "")).strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="identifier required")
    found = ship_data.set_active_guest(identifier)
    if not found:
        raise HTTPException(status_code=404, detail="Guest not found")
    guest = ship_data.get_guest()
    cruise = ship_data.get_cruise()
    return {
        "found": True,
        "guest": {
            **guest,
            "ship": cruise["ship"],
            "cruise": {
                "currentDay": cruise["current_day"],
                "totalDays": cruise["total_days"],
                "todayLabel": cruise["today_label"],
                "departurDate": cruise["departure_date"],
                "nextPort": cruise.get("next_port", {}),
                "itinerary": cruise.get("ports_visited", []) + cruise.get("ports_remaining", []),
            },
        },
    }


@app.get("/api/guest/reservations")
async def guest_reservations():
    """Return current in-memory reservations for the active guest."""
    reservations = ship_data.list_reservations()
    return {"reservations": reservations, "count": len(reservations)}


@app.post("/api/guest/reservations/cancel")
async def cancel_reservation_direct(request: dict):
    """Cancel a reservation directly from the dashboard (no Marina chat needed)."""
    name = str(request.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    removed = ship_data.remove_reservation(name)
    if not removed:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return {"cancelled": True, "reservation": removed}


@app.get("/api/guest/folio")
async def guest_folio():
    """Return current folio (balance + items) for the active guest."""
    guest = ship_data.get_guest()
    folio = guest.get("folio", {"balance": 0, "items": []})
    return folio


@app.post("/api/guest/reset")
async def guest_reset(request: dict):
    """Reset a guest's session mutations back to original registry state (for demo restart)."""
    phone = str(request.get("phone", "")).strip() or ship_data.get_active_phone()
    ok = ship_data.reset_guest(phone)
    if not ok:
        raise HTTPException(status_code=404, detail="Guest not found")
    return {"reset": True, "phone": phone}


@app.post("/api/user/login")
async def user_login(request: dict):
    """
    User access code authentication.

    Request: {"code": "access-code"}
    Response: {"success": true}
    """
    code = request.get("code", "")
    if USER_ACCESS_CODE and code == USER_ACCESS_CODE:
        logger.info("User login successful")
        return {"success": True}
    raise HTTPException(status_code=401, detail="Invalid access code")


@app.post("/api/admin/login")
async def admin_login(request: dict):
    """
    Admin login endpoint.

    Request: {"password": "admin-password"}
    Response: {"success": true, "token": "session-token"}
    """
    password = request.get("password", "")

    if password == ADMIN_PASSWORD:
        token = generate_admin_token()
        logger.info("Admin login successful")
        return {"success": True, "token": token}
    else:
        logger.warning("Admin login failed - invalid password")
        raise HTTPException(status_code=401, detail="Invalid password")


@app.get("/api/admin/validate")
async def admin_validate(token: str = None):
    """Validate admin session token"""
    if not token:
        raise HTTPException(status_code=401, detail="Token required")

    if verify_admin_token(token):
        return {"valid": True}
    else:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@app.post("/api/admin/logout")
async def admin_logout(request: dict):
    """Logout and invalidate admin token"""
    token = request.get("token", "")
    if token in admin_tokens:
        del admin_tokens[token]
    return {"success": True}


# ============================================================================
# Model Settings (local MongoDB-backed config_store)
# ============================================================================

@app.get("/api/admin/get_llm")
async def admin_get_llm():
    return config_store.get_llm()


@app.post("/api/admin/update_llm")
async def admin_update_llm(request: dict):
    config_store.set_llm(request["LLM_PROFILE"])
    return {"success": True}


@app.get("/api/admin/get_config")
async def admin_get_config():
    return config_store.get_system_prompt()


@app.post("/api/admin/update_config")
async def admin_update_config(request: dict):
    config_store.set_system_prompt(request["SYSTEM_PROMPT"])
    return {"success": True}


# ============================================================================
# RAG Settings (local MongoDB-backed config_store)
# ============================================================================

@app.get("/api/admin/get_rag")
async def admin_get_rag():
    return config_store.get_rag()


@app.post("/api/admin/update_rag")
async def admin_update_rag(request: dict):
    config_store.set_rag(request["RAG_PROFILE"], request.get("RAG_COLLECTION", []))
    return {"success": True}


# ============================================================================
# TTS Settings (local MongoDB-backed config_store)
# ============================================================================

@app.get("/api/admin/get_tts")
async def admin_get_tts():
    return config_store.get_tts()


@app.post("/api/admin/update_tts")
async def admin_update_tts(request: dict):
    config_store.set_tts(request["TTS_PROVIDER"])
    if "VOICE_ID" in request and request["VOICE_ID"]:
        old_voice = config_store.get_voice_id()
        new_voice = request["VOICE_ID"]
        config_store.set_voice(new_voice)
        if old_voice != new_voice:
            # Reload filler cache from the new voice's subdir (instant — no API call)
            _load_filler_audio(new_voice)
            logger.info(f"Filler cache reloaded for voice {new_voice}")
    return {"success": True}


@app.post("/api/admin/regenerate_fillers")
async def admin_regenerate_fillers(request: dict):
    """Manually re-bake filler audio for a specific voice (force overwrite)."""
    api_key = os.getenv("ELEVEN_LABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ELEVEN_LABS_API_KEY not set")
    voice_id = request.get("voice_id") or config_store.get_voice_id()
    lang = request.get("lang")  # None = regenerate both
    try:
        from scripts.generate_fillers import generate_filler_audio
        from pathlib import Path
        langs = [lang] if lang else ["en", "es"]
        for lg in langs:
            await generate_filler_audio(
                voice_id=voice_id, lang=lg,
                out_dir=Path(_FILLER_BASE_DIR), api_key=api_key, force=True,
            )
        _load_filler_audio(voice_id)
        return {"success": True, "voice_id": voice_id, "langs": langs}
    except Exception as e:
        logger.error(f"Filler regeneration failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Content Management Proxy (Content Manager Service - Port 9000)
# ============================================================================

@app.get("/api/admin/list_collections")
async def admin_list_collections():
    """List all collections from content manager"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{CONTENT_MANAGER_URL}/list_collections")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to list collections: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.post("/api/admin/create_collection/{collection}")
async def admin_create_collection(collection: str):
    """Create a new collection"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{CONTENT_MANAGER_URL}/create_collection/{collection}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to create collection: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.delete("/api/admin/delete_collection/{collection}")
async def admin_delete_collection(collection: str):
    """Delete a collection"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(f"{CONTENT_MANAGER_URL}/delete_collection/{collection}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to delete collection: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.get("/api/admin/list_collection_docs/{collection}")
async def admin_list_collection_docs(collection: str):
    """List documents in a collection"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{CONTENT_MANAGER_URL}/list_collection_docs/{collection}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to list collection docs: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.post("/api/admin/add_parsed_document")
async def admin_add_parsed_document(
    file: UploadFile = File(...),
    collection: str = Form(...),
    metadata: str = Form("{}")
):
    """Add a pre-parsed document (txt, md) to a collection"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Content manager expects 'document' field, not 'file'
            files = {"document": (file.filename, await file.read(), file.content_type)}
            data = {"collection": collection, "metadata": metadata}
            response = await client.post(
                f"{CONTENT_MANAGER_URL}/add_parsed_document/",
                files=files,
                data=data
            )
            if response.status_code in (200, 409):
                return JSONResponse(status_code=response.status_code, content=response.json())
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to add parsed document: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.post("/api/admin/add_unparsed_document")
async def admin_add_unparsed_document(
    file: UploadFile = File(...),
    collection: str = Form(...),
    metadata: str = Form("{}")
):
    """Add an unparsed document (pdf, csv, json) to a collection"""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Content manager expects 'document' field, not 'file'
            files = {"document": (file.filename, await file.read(), file.content_type)}
            data = {"collection": collection, "metadata": metadata}
            response = await client.post(
                f"{CONTENT_MANAGER_URL}/add_unparsed_document/",
                files=files,
                data=data
            )
            if response.status_code in (200, 409):
                return JSONResponse(status_code=response.status_code, content=response.json())
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to add unparsed document: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.delete("/api/admin/delete_document/{collection}/{document_id}")
async def admin_delete_document(collection: str, document_id: str):
    """Delete a document from a collection"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(
                f"{CONTENT_MANAGER_URL}/delete_document/{collection}/{document_id}"
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.post("/api/admin/assign_url_to_download")
async def admin_assign_url_to_download(request: dict):
    """Generate a download URL for a document"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{CONTENT_MANAGER_URL}/assign_url_to_download/",
                json=request
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to assign download URL: {e}")
        raise HTTPException(status_code=502, detail=f"Content manager error: {str(e)}")


@app.post("/api/admin/parse_documents")
async def admin_parse_documents(request: dict):
    """Trigger document parsing in a collection via parse-job service"""
    try:
        collection = request.get("collection")
        async with httpx.AsyncClient(timeout=300.0) as client:
            data = {"collection": collection} if collection else None
            response = await client.post(
                f"{PARSE_JOB_URL}/parse_documents/",
                data=data
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to parse documents: {e}")
        raise HTTPException(status_code=502, detail=f"Parse job error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BACKEND_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
