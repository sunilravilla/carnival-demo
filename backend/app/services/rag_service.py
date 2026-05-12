"""
RAG Service — local in-process pipeline.
Retrieves relevant chunks from the local Qdrant/TEI retriever service,
then calls an external OpenAI-compatible LLM to produce a cited answer.

Query reformulation: before hitting the retriever, follow-up questions like
"tell me more about it" are rewritten into self-contained queries using the
conversation history, so the embedding search gets a meaningful vector.
"""

import asyncio
import logging
import os
import re

import httpx

from app.services import config_store
from app.services.llm_client import create_client_from_env

logger = logging.getLogger(__name__)

RETRIEVER_URL = os.getenv("RETRIEVER_URL", "http://retriever:80")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))

# ---------------------------------------------------------------------------
# Query reformulation
# ---------------------------------------------------------------------------

_REFORMAT_PROMPT = """You are a system that performs search on a vector database using semantic embeddings.
You are given a conversation between a user and an assistant.
Your goal is to rephrase the LAST question ONLY if it is related to the previous questions or answers and requires more context to be understood on its own.
Your response is passed directly to the vector database, so give the answer directly, without introductions or additional explanation.
Never try to answer the question — you are only rephrasing it.
You must rephrase to make it have full meaning by itself, adding all necessary information from the conversation.
Do not add information that is not in the conversation.
If the last question is not related to any previous questions, return the last question unchanged.
Only use previous context when the relation is totally clear, for example when the question is "continue", "tell me more about it", or similar.
If the context is not clear, just return the last question unchanged.
Always respond in English.
Do not justify your answer. Provide only the reformatted query.

Examples:
Q: What is HPE Alletra 10000?
A: It is a high-performance storage platform from HPE.
Q: Tell me more about it.
Your response: Tell me more about the HPE Alletra 10000 storage platform.

Q: How was the economy in France in 2022?
A: It has risen 5.4%.
Q: And in 2023?
Your response: How was the economy in France in 2023?

Q: What is the capital of France?
A: Paris.
Q: How do you make spaghetti?
Your response: How do you make spaghetti?

CONVERSATION:
{messages}
FINAL Your response: """



# ---------------------------------------------------------------------------
# Heuristic: does this query need LLM reformulation?
# ---------------------------------------------------------------------------

# 1. Anaphoric / demonstrative pronouns that refer back to a prior entity.
#    Includes possessives ("its pricing") and reflexives ("itself").
#    Excludes first/second-person (I, we, you) which are self-contained in conversation.
_ANAPHORIC = re.compile(
    r'\b(it|its|itself|'
    r'they|them|their|theirs|themselves|'
    r'this|these|that|those|'
    r'he|him|his|himself|'
    r'she|her|hers|herself|'
    r'one|ones|such)\b',
    re.IGNORECASE,
)

# 2. Discourse openers that are syntactically incomplete without prior context.
#    Anchored to the start of the query (after stripping leading whitespace).
_DISCOURSE_OPENERS = re.compile(
    r'^(and\b|but\b|or\b|nor\b|so\b|yet\b|'           # coordinating conjunctions
    r'also\b|additionally\b|furthermore\b|moreover\b|'  # additive
    r'however\b|although\b|though\b|even though\b|'     # contrastive
    r'because\b|since\b|as a result\b|therefore\b|'     # causal
    r'then\b|next\b|after that\b|before that\b|'        # sequential
    r'what about\b|how about\b|what if\b|'
    r'in that case\b|in this case\b|given that\b|'
    r'regarding (that|this|the above)\b|'
    r'about (that|this)\b)',
    re.IGNORECASE,
)

# 3. Explicit continuation / elaboration requests.
_CONTINUATION = re.compile(
    r'\b(tell me more|more (about|on|details?|info|information)|'
    r'elaborate|expand( on)?|go on|continue|carry on|'
    r'(explain|describe|clarify|detail) (it|that|this|them|those|further|more)|'
    r'give (me )?(more|an? )?(example|detail|information|info)|'
    r'can you (explain|elaborate|expand|clarify|describe) (it|that|this|more)|'
    r'could you (explain|elaborate|expand|clarify|describe) (it|that|this|more)|'
    r'please (explain|elaborate|expand|clarify|describe) (it|that|this|more))\b',
    re.IGNORECASE,
)

# 4. Relative / comparative / sequential references that imply a prior referent.
_RELATIVE_REF = re.compile(
    r'\b(the (same|other|rest|remaining|latter|former|above|below|previous|following)|'
    r'(any|some|what|anything|something|nothing) else\b|'
    r'another (one|option|example|type|course|module|version|step|way)\b|'
    r'(next|previous|last|first|second|third|final) (one|option|step|item|course|version|example|module)\b|'
    r'compared (to|with)\b|in comparison\b|versus\b|vs\.?\b|'
    r'(similar|different|related) (to|from)\b|'
    r'(better|worse|faster|cheaper|more|less) than\b|'
    r'what.s the difference\b|how (does|do) (it|they|this|that) (compare|differ)\b|'
    r'why (is|are|does|do) (it|that|this|they)\b|'
    r'how (does|do|is|are) (it|that|this|they)\b|'
    r'when (does|do|is|are|was|were) (it|that|this|they)\b|'
    r'where (does|do|is|are|was|were) (it|that|this|they)\b)\b',
    re.IGNORECASE,
)

# 5. Single-word or minimal elliptical follow-ups ("Why?", "Really?", "Ok and?").
_ELLIPTICAL = re.compile(
    r'^(why|how so|how come|really|seriously|interesting|noted|'
    r'ok|okay|right|sure|got it|i see|understood|makes sense|'
    r'and\?|so\?|then\?|what\?|which\?|who\?|when\?|where\?)\??\.?$',
    re.IGNORECASE,
)


def _needs_reformulation(query: str) -> bool:
    """
    Return True only when the query contains signals that it depends on prior context.
    Self-sufficient queries ("What is HPE Alletra?", "List pre-sales courses") return
    False and skip the LLM reformulation call entirely.

    Signal hierarchy (first match wins):
      1. Elliptical single/minimal utterance  → always reformulate
      2. ≤3 words (likely a fragment)          → always reformulate
      3. Discourse opener (starts with "And…") → reformulate
      4. Anaphoric pronoun (it/they/this/that) → reformulate
      5. Continuation phrase (tell me more…)  → reformulate
      6. Relative reference (compared to…)    → reformulate
    """
    q = query.strip()

    # 1. Single-word / minimal elliptical utterances
    if _ELLIPTICAL.match(q):
        return True

    words = q.split()

    # 2. Very short queries are nearly always incomplete fragments
    if len(words) <= 3:
        return True

    # 3. Discourse opener — syntactically depends on prior context
    if _DISCOURSE_OPENERS.match(q):
        return True

    # 4. Anaphoric pronoun present anywhere in the query
    if _ANAPHORIC.search(q):
        return True

    # 5. Explicit continuation / elaboration request
    if _CONTINUATION.search(q):
        return True

    # 6. Relative / comparative / sequential reference
    if _RELATIVE_REF.search(q):
        return True

    return False


def _reformat_query(llm_client, messages: list) -> str:
    """
    Rewrite the last user message into a self-contained retrieval query.
    Skips the LLM call when the query is already self-sufficient.
    Falls back to the raw last message on any LLM error.
    """
    if len(messages) <= 1:
        return messages[-1]["content"]

    raw = messages[-1]["content"]

    if not _needs_reformulation(raw):
        logger.info("Query is self-sufficient, skipping reformulation: %r", raw)
        return raw

    formatted = ""
    for m in messages[-11:]:  # last 10 prior turns + current
        if m["role"] == "user":
            formatted += f"Q: {m['content']}\n"
        elif m["role"] == "assistant":
            formatted += f"A: {m['content']}\n"

    prompt = _REFORMAT_PROMPT.format(messages=formatted)
    try:
        reformatted = llm_client.generate(prompt, max_tokens=1000, temperature=0.0)
        reformatted = reformatted.strip()
        logger.info("Query reformulated: %r -> %r", raw, reformatted)
        return reformatted if reformatted else raw
    except Exception as e:
        logger.warning("Query reformulation failed, using raw query: %s", e)
        return raw


# ---------------------------------------------------------------------------
# Query translation (for non-English input with English-only embedding model)
# ---------------------------------------------------------------------------

def _translate_to_english(llm_client, text: str) -> str:
    """
    Translate text to English for retrieval against the English-only BGE model.
    If the text is already in English the LLM returns it unchanged.
    Falls back to the original text on any error.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "Translate the following text to English. "
                "If it is already in English, return it unchanged. "
                "Output only the translation, nothing else."
            ),
        },
        {"role": "user", "content": text},
    ]
    try:
        result = llm_client.chat_completion(messages, max_tokens=200, temperature=0.0)
        translated = result.strip()
        if translated:
            logger.info("Query translated for retrieval: %r -> %r", text, translated)
            return translated
        return text
    except Exception as e:
        logger.warning("Query translation failed, using original: %s", e)
        return text


# ---------------------------------------------------------------------------
# Retriever helpers
# ---------------------------------------------------------------------------

async def _search_collection(client: httpx.AsyncClient, collection: str, query: str) -> list:
    """Call the local retriever's search endpoint. Returns raw result list or [] on error."""
    try:
        resp = await client.get(
            f"{RETRIEVER_URL}/search/{collection}",
            params={"query_content": query},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        # retriever api.py wraps results: {"results": [...]}
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        logger.warning("Retriever search failed for collection '%s': %s", collection, e)
        return []


def _normalize_to_source_nodes(raw: list) -> list:
    """
    Coerce retriever hits into the SourceNode shape used by _answer_with_citations.
    Qdrant clean_search_results() returns point.payload dicts with keys:
    document_id, content, page, score, and any indexing-time metadata.
    """
    nodes = []
    for r in raw:
        payload = r.get("payload") if isinstance(r, dict) and "payload" in r else r
        if not isinstance(payload, dict):
            continue
        text = payload.get("content", "")
        nodes.append({
            "text": text,
            "metadata": {
                "file_name": payload.get("document_name") or payload.get("document_id", "unknown"),
                "page_label": payload.get("page", "?"),
            },
        })
    return [n for n in nodes if n["text"]]


# ---------------------------------------------------------------------------
# Answer generation
# ---------------------------------------------------------------------------

def _answer_with_citations(llm_client, source_nodes: list, question: str, history_msgs: list) -> str:
    """
    Compose a numbered-context prompt and call the LLM.
    - System prompt is read from admin config_store.
    - References footer is NOT appended (TTS unfriendly).
    - Caller strips bracket markers [N] before returning to TTS.
    """
    context_blocks = []
    for i, node in enumerate(source_nodes, start=1):
        meta = node.get("metadata", {})
        context_blocks.append(
            f"[{i}] (Source: {meta.get('file_name', 'unknown')}, "
            f"page {meta.get('page_label', '?')})\n{node['text']}"
        )
    context = "\n\n".join(context_blocks)

    admin_prompt = config_store.get_system_prompt()["SYSTEM_PROMPT"]
    system_content = (
        f"{admin_prompt}\n\n"
        "When source excerpts are provided, cite them inline using bracket "
        "numbers (e.g. [1], [2]) and only use information from those sources. "
        "If no sources are provided, answer from general knowledge within scope."
    )

    messages = [{"role": "system", "content": system_content}]
    # Include up to last 10 prior turns, excluding the current user message
    for m in history_msgs[-10:]:
        messages.append({"role": m["role"], "content": m["content"]})

    if context:
        user_content = (
            f"{context}\n\nQuestion: {question}\n\nAnswer (with inline citations):"
        )
    else:
        user_content = question

    messages.append({"role": "user", "content": user_content})

    return llm_client.chat_completion(messages, max_tokens=1000, temperature=0.7)


# ---------------------------------------------------------------------------
# TTS cleanup
# ---------------------------------------------------------------------------

def _clean_for_tts(text: str) -> str:
    """
    Convert LLM markdown output to clean, speakable plain text.

    Strategy:
    1. Strip markdown table separator rows (|---|---|).
    2. Extract cell content from table rows — join cells with a comma so
       table content reads as a list rather than "vertical bar vertical bar".
    3. Strip bold/italic markers, ATX headers, HR rules, inline code,
       bullet/numbered list prefixes.

    Works for both proper multi-line markdown tables and the common LLM
    behaviour of emitting an entire table on a single line.
    """
    # ---- Phase 1: strip separator rows and unwrap table rows ----
    # Replace pure separator lines (|---|---| or |:---|:---|) with nothing.
    text = re.sub(r"\|[\s\-:]+\|[\s\-:|]*", "", text)

    # Replace remaining pipe-delimited rows: split on "|" and join with ", ".
    # Handles both inline (" | cell | cell |") and line-starting ("|cell|cell|").
    def _pipe_row_to_text(m):
        raw = m.group(0)
        cells = [c.strip() for c in raw.split("|") if c.strip()]
        # strip bold/italic inside cells
        cells = [re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", c) for c in cells]
        cells = [re.sub(r"_{1,2}([^_]+)_{1,2}", r"\1", c) for c in cells]
        return ", ".join(cells)

    # Match sequences of "| content | content |" (with optional leading/trailing spaces)
    text = re.sub(r"(?:\|\s*[^|\n]+)+\|?", _pipe_row_to_text, text)

    # ---- Phase 2: line-by-line markdown cleanup ----
    lines = text.splitlines()
    out_lines = []
    for line in lines:
        # Horizontal rule
        if re.match(r"^\s*[-*_]{3,}\s*$", line):
            continue
        # ATX headers
        line = re.sub(r"^#{1,6}\s+", "", line)
        # Bold / italic
        line = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", line)
        line = re.sub(r"_{1,2}([^_]+)_{1,2}", r"\1", line)
        # Inline code
        line = re.sub(r"`([^`]+)`", r"\1", line)
        # Bullet list markers
        line = re.sub(r"^\s*[-*+]\s+", "", line)
        # Numbered list markers
        line = re.sub(r"^\s*\d+[.)]\s+", "", line)
        # Any stray pipe characters
        line = line.replace("|", " ")
        # Collapse extra whitespace and punctuation artifacts
        line = re.sub(r",\s*,+", ",", line)
        line = re.sub(r"\s{2,}", " ", line)
        line = line.strip(" ,")
        if line:
            out_lines.append(line)

    return "\n".join(out_lines).strip()


# ---------------------------------------------------------------------------
# Public service class
# ---------------------------------------------------------------------------

class RAGService:
    def __init__(self):
        self.llm = create_client_from_env()

    async def generate_response_with_history(self, conversation_uuid: str, messages: list) -> str:
        try:
            raw_query = messages[-1]["content"]
            collections = config_store.get_active_collections()

            # Step 1: Rewrite follow-up questions into self-contained retrieval queries.
            # Run synchronous LLM call in a thread. Falls back to raw query on error.
            if len(messages) > 1:
                retrieval_query = await asyncio.to_thread(_reformat_query, self.llm, messages)
            else:
                retrieval_query = raw_query

            # Step 1b: Translate retrieval query to English (BGE model is English-only).
            retrieval_query = await asyncio.to_thread(_translate_to_english, self.llm, retrieval_query)

            # Step 2: Search each active collection with the reformulated query.
            source_nodes = []
            async with httpx.AsyncClient(timeout=10.0) as client:
                for col in collections:
                    raw = await _search_collection(client, col, retrieval_query)
                    source_nodes.extend(_normalize_to_source_nodes(raw))

            source_nodes = source_nodes[: RAG_TOP_K * max(1, len(collections))]

            # Step 3: Generate answer using full conversation history + retrieved context.
            # Pass the original (raw) last question — not the reformulated one — so the
            # LLM answer reads naturally in context. The reformulated query was only for
            # retrieval.
            reply = await asyncio.to_thread(
                _answer_with_citations, self.llm, source_nodes, raw_query, messages[:-1]
            )

            # Strip citation markers and markdown formatting for TTS.
            reply = re.sub(r"\s*\[\d+\]", "", reply)
            return _clean_for_tts(reply)

        except Exception as e:
            raise Exception(f"RAG service error: {e}")

    async def generate_response(self, user_text: str, conversation_uuid: str = None) -> str:
        return await self.generate_response_with_history(
            conversation_uuid, [{"role": "user", "content": user_text}]
        )
