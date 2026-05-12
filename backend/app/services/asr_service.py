"""
ASR service — ElevenLabs Scribe only (no local Whisper fallback for demo).
Returns (text, detected_language_code) where detected_language_code is a
2-letter ISO 639-1 code (e.g. "en", "es", "fr").
"""
import os
import logging
import re

import httpx

# ElevenLabs Scribe annotates non-speech events in parentheses, e.g.
# "(soft sound)", "(clicking sound)", "(music)". Strip them before returning.
_SOUND_EVENT = re.compile(
    r"\(\s*(?:[\w\s]*?(?:sound|noise|click|tap|beep|breath|breathing|laugh|"
    r"laughter|applause|silence|ambient|background|music|clap|cough|sigh|"
    r"ring|chime|bang|thud|whoosh)[\w\s]*?)\s*\)",
    re.IGNORECASE,
)

logger = logging.getLogger(__name__)

ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY", "")
_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text"

# ElevenLabs Scribe returns ISO 639-3 three-letter codes; map to 639-1.
_LANG_MAP = {
    "eng": "en", "spa": "es", "fra": "fr", "deu": "de", "ita": "it",
    "jpn": "ja", "zho": "zh", "ara": "ar", "por": "pt", "kor": "ko",
    "rus": "ru", "nld": "nl", "pol": "pl", "tur": "tr", "hin": "hi",
}


def _map_lang(code: str) -> str:
    """Normalise a language code to 2-letter ISO 639-1, defaulting to 'en'."""
    if not code:
        return "en"
    lower = code.lower()
    if lower in _LANG_MAP:
        return _LANG_MAP[lower]
    # Already a 2-letter code (e.g. from a future API change)
    if len(lower) == 2:
        return lower
    return "en"


class ASRService:
    def __init__(self):
        if not ELEVEN_LABS_API_KEY:
            raise ValueError(
                "ELEVEN_LABS_API_KEY is required for ASR (ElevenLabs Scribe). "
                "Set it in backend/.env"
            )
        logger.info("ASR service: ElevenLabs Scribe")

    async def transcribe_audio(self, audio_path: str) -> tuple[str, str]:
        """Transcribe audio via ElevenLabs Scribe.

        Returns:
            (text, detected_language_code)  e.g. ("Hello there", "en")
        """
        filename = os.path.basename(audio_path)
        ext = os.path.splitext(filename)[1].lower() or ".webm"
        mime = {
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".webm": "audio/webm",
        }.get(ext, "audio/webm")

        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            response = await client.post(
                _SCRIBE_URL,
                headers={"xi-api-key": ELEVEN_LABS_API_KEY},
                data={"model_id": "scribe_v1"},
                files={"file": (filename, audio_bytes, mime)},
            )
            response.raise_for_status()
            data = response.json()

        raw_text = data.get("text", "").strip()
        # Strip Scribe sound-event annotations before returning
        text = _SOUND_EVENT.sub("", raw_text)
        text = " ".join(text.split()).strip()  # normalize whitespace

        raw_lang = data.get("language_code", "eng")
        detected_lang = _map_lang(raw_lang)

        if not text:
            logger.warning("ElevenLabs Scribe returned empty text (raw: %r): %s", raw_text, data)

        logger.info(
            "ElevenLabs Scribe transcribed [%s→%s]: %s",
            raw_lang, detected_lang, text[:100],
        )
        return text, detected_lang
