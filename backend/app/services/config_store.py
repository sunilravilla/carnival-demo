"""
MongoDB-backed admin configuration store.
Replaces the external guardrails service for LLM profile, system prompt, and RAG config.

When MongoDB is unreachable (running outside docker-compose), every getter
falls back to an in-memory dict seeded from env vars. Setters become no-ops
in that mode (admin panel will still appear to work but changes won't persist).
"""

import logging
import os
from pymongo import MongoClient
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

_client = None
_mongo_available: bool | None = None  # None = unchecked, True/False = cached

# In-memory fallback when MongoDB is unreachable.
_MEMORY_STATE: dict = {}


def _db():
    global _client
    if _client is None:
        _client = MongoClient(
            os.getenv("MONGO_URL", "mongodb://mongodb:27017"),
            # Fail fast if MongoDB isn't running locally — keeps the
            # FastAPI startup snappy when developing without docker-compose.
            serverSelectionTimeoutMS=int(os.getenv("MONGO_TIMEOUT_MS", "2000")),
            connectTimeoutMS=int(os.getenv("MONGO_TIMEOUT_MS", "2000")),
        )
    return _client[os.getenv("BAYMAX_DB", "baymax")]


def _mongo_up() -> bool:
    """Cached probe — only tries the real connection once per process lifetime."""
    global _mongo_available
    if _mongo_available is not None:
        return _mongo_available
    try:
        _db().command("ping")
        _mongo_available = True
    except (PyMongoError, Exception) as e:
        logger.warning(
            "MongoDB unavailable (%s) — using in-memory config fallback. "
            "Admin panel changes will not persist this session.", e,
        )
        _mongo_available = False
    return _mongo_available


def _seed_memory_state() -> None:
    """Populate _MEMORY_STATE with env-driven defaults when MongoDB is down."""
    if _MEMORY_STATE:
        return
    default_llm_profile = os.getenv("DEFAULT_LLM_PROFILE", "openai/gpt-oss-20b")
    default_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
    _MEMORY_STATE.update({
        "llm": {
            "LLM_PROFILE": default_llm_profile,
            "AVAILABLE_PROFILES": [default_llm_profile],
        },
        "system_prompt": {"SYSTEM_PROMPT": DEFAULT_SYSTEM_PROMPT},
        "rag": {
            "RAG_PROFILE": "V2",
            "RAG_AVAILABLE_PROFILES": {
                "V1": {"RAG_COLLECTION": []},
                "V2": {"RAG_COLLECTION": []},
            },
        },
        "tts": {
            "TTS_PROVIDER": "elevenlabs",
            "AVAILABLE_PROVIDERS": ["elevenlabs", "kokoro"],
            "VOICE_ID": default_voice_id,
            "AVAILABLE_VOICES": [
                {"id": "EXAVITQu4vr4xnSDxMaL", "label": "Sarah (English, US)", "language": "en"},
                {"id": "JM2A9JbRp8XUJ7bdCXJc", "label": "Fernanda Olea (Spanish, Chile)", "language": "es-LatAm"},
            ],
        },
    })


_HPE_SYSTEM_PROMPT = (
    "You are ARIA, an AI Training Advisor powered by HPE AI Services.\n\n"
    "Your role is to help learners and teams with:\n"
    "- Training courses, learning paths, and onboarding journeys\n"
    "- Skills development and certification guidance\n"
    "- Training schedule and enrollment information\n"
    "- Detailed training content retrieval from knowledge bases\n\n"
    "Be precise, professional, and helpful in your responses. "
    "Provide specific course details and recommendations when available."
)

_CARNIVAL_SYSTEM_PROMPT = (
    "You are Marina, the onboard AI concierge for Carnival Cruise Line. "
    "You speak warmly, with energy, and never longer than two short sentences. "
    "Always reply in English — translation to other languages is handled downstream.\n\n"
    "Help guests with:\n"
    "- Tonight's dining reservations\n"
    "- Show and entertainment bookings\n"
    "- Shore excursion details and meet locations\n"
    "- Folio balance, charges, and drink-package upgrades\n"
    "- Today's onboard activities and ship wayfinding\n\n"
    "When tools are available, use them rather than guessing. "
    "Reference what's on screen so guests feel guided. "
    "Be the cruise director everyone wishes they had."
)

DEFAULT_SYSTEM_PROMPT = (
    _CARNIVAL_SYSTEM_PROMPT
    if os.getenv("DEMO_BRAND", "").lower() == "carnival"
    else _HPE_SYSTEM_PROMPT
)


def seed_defaults() -> None:
    """Idempotent seed of default config docs. Safe to call on every startup."""
    col = _db()["admin_config"]

    default_llm_profile = os.getenv("DEFAULT_LLM_PROFILE", "openai/gpt-oss-20b")

    if col.find_one({"_id": "llm"}) is None:
        col.insert_one({
            "_id": "llm",
            "LLM_PROFILE": default_llm_profile,
            "AVAILABLE_PROFILES": [default_llm_profile],
        })

    if col.find_one({"_id": "system_prompt"}) is None:
        col.insert_one({
            "_id": "system_prompt",
            "SYSTEM_PROMPT": DEFAULT_SYSTEM_PROMPT,
        })

    if col.find_one({"_id": "rag"}) is None:
        col.insert_one({
            "_id": "rag",
            "RAG_PROFILE": "V2",
            "RAG_AVAILABLE_PROFILES": {
                "V1": {"RAG_COLLECTION": []},
                "V2": {"RAG_COLLECTION": []},
            },
        })

    _DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
    _DEFAULT_VOICES = [
        {"id": "EXAVITQu4vr4xnSDxMaL", "label": "Sarah (English, US)", "language": "en"},
        {"id": "JM2A9JbRp8XUJ7bdCXJc", "label": "Fernanda Olea (Spanish, Chile)", "language": "es-LatAm"},
    ]
    tts_doc = col.find_one({"_id": "tts"})
    if tts_doc is None:
        col.insert_one({
            "_id": "tts",
            "TTS_PROVIDER": "elevenlabs",
            "AVAILABLE_PROVIDERS": ["elevenlabs", "kokoro"],
            "VOICE_ID": _DEFAULT_VOICE_ID,
            "AVAILABLE_VOICES": _DEFAULT_VOICES,
        })
    else:
        # Always sync AVAILABLE_VOICES from code (it's a static catalog, not user data).
        # Only set VOICE_ID if missing — preserve the admin's saved choice.
        updates = {"AVAILABLE_VOICES": _DEFAULT_VOICES}
        if "VOICE_ID" not in tts_doc:
            updates["VOICE_ID"] = _DEFAULT_VOICE_ID
        col.update_one({"_id": "tts"}, {"$set": updates})


def _get(key: str) -> dict:
    """Return the doc for `key` from MongoDB, or the in-memory fallback if Mongo is down."""
    if not _mongo_up():
        _seed_memory_state()
        return dict(_MEMORY_STATE.get(key, {}))
    try:
        col = _db()["admin_config"]
        doc = col.find_one({"_id": key})
        if doc is None:
            seed_defaults()
            doc = col.find_one({"_id": key})
        return doc or {}
    except PyMongoError as e:
        logger.warning("Mongo read failed for %s (%s) — using fallback", key, e)
        _seed_memory_state()
        return dict(_MEMORY_STATE.get(key, {}))


def _set(key: str, updates: dict) -> None:
    """Persist updates. No-op when Mongo is down (still updates the in-memory fallback)."""
    if not _mongo_up():
        _seed_memory_state()
        cur = _MEMORY_STATE.setdefault(key, {})
        cur.update(updates)
        return
    try:
        col = _db()["admin_config"]
        col.update_one({"_id": key}, {"$set": updates}, upsert=True)
    except PyMongoError as e:
        logger.warning("Mongo write failed for %s (%s) — keeping in-memory only", key, e)
        _seed_memory_state()
        cur = _MEMORY_STATE.setdefault(key, {})
        cur.update(updates)


def get_llm() -> dict:
    doc = _get("llm")
    return {
        "LLM_PROFILE": doc.get("LLM_PROFILE", os.getenv("DEFAULT_LLM_PROFILE", "openai/gpt-oss-20b")),
        "AVAILABLE_PROFILES": doc.get("AVAILABLE_PROFILES", []),
    }


def set_llm(profile: str) -> None:
    _set("llm", {"LLM_PROFILE": profile})


def get_system_prompt() -> dict:
    doc = _get("system_prompt")
    return {"SYSTEM_PROMPT": doc.get("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)}


def set_system_prompt(prompt: str) -> None:
    _set("system_prompt", {"SYSTEM_PROMPT": prompt})


def get_rag() -> dict:
    doc = _get("rag")
    return {
        "RAG_PROFILE": doc.get("RAG_PROFILE", "V2"),
        "RAG_AVAILABLE_PROFILES": doc.get("RAG_AVAILABLE_PROFILES", {
            "V1": {"RAG_COLLECTION": []},
            "V2": {"RAG_COLLECTION": []},
        }),
    }


def set_rag(profile: str, collections: list) -> None:
    profile_key = f"RAG_AVAILABLE_PROFILES.{profile}.RAG_COLLECTION"
    _set("rag", {"RAG_PROFILE": profile, profile_key: collections})


def get_active_collections() -> list:
    """Return the RAG_COLLECTION array for the currently-active RAG profile."""
    rag = get_rag()
    profile = rag["RAG_PROFILE"]
    profiles = rag["RAG_AVAILABLE_PROFILES"]
    return profiles.get(profile, {}).get("RAG_COLLECTION", [])


def get_tts() -> dict:
    doc = _get("tts")
    return {
        "TTS_PROVIDER": doc.get("TTS_PROVIDER", "elevenlabs"),
        "AVAILABLE_PROVIDERS": doc.get("AVAILABLE_PROVIDERS", ["elevenlabs", "kokoro"]),
        "VOICE_ID": doc.get("VOICE_ID", os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")),
        "AVAILABLE_VOICES": doc.get("AVAILABLE_VOICES", []),
    }


def set_tts(provider: str) -> None:
    _set("tts", {"TTS_PROVIDER": provider})


def set_voice(voice_id: str) -> None:
    """Set the active ElevenLabs voice ID."""
    _set("tts", {"VOICE_ID": voice_id})


def get_voice_id() -> str:
    """Return the active ElevenLabs voice ID."""
    return get_tts()["VOICE_ID"]


def get_tts_provider() -> str:
    """Return just the active TTS provider name."""
    return get_tts()["TTS_PROVIDER"]
