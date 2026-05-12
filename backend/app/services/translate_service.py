"""Gemma Translate client.

Calls the vLLM `/v1/completions` endpoint configured for the Gemma translation
model. Used by the Carnival agent to convert the LLM's English output into the
guest's preferred language before it hits TTS. English passes through untouched.
"""

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)

GEMMA_URL = os.getenv("GEMMA_TRANSLATE_API_URL")
GEMMA_TOKEN = os.getenv("GEMMA_TRANSLATE_BEARER_TOKEN", "")

LANG_NAMES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ar": "Arabic",
    "ja": "Japanese",
    "zh": "Chinese (Simplified)",
}

_PROMPT_TEMPLATE = (
    "Translate the following text to {target}. Output ONLY the translation, "
    "no preamble, no quotes, no explanations.\n\n"
    "Text: {text}\n\nTranslation:"
)


def _is_configured() -> bool:
    return bool(GEMMA_URL)


def translate(text: str, target_lang: str, *, timeout: float = 8.0) -> Optional[str]:
    """Translate `text` into `target_lang` (ISO-639 code). Returns None on any error.

    Caller decides whether to fall back to the original text on None.
    """
    if not text or not text.strip():
        return text
    if not target_lang or target_lang.lower() == "en":
        return text
    if not _is_configured():
        logger.warning("Gemma Translate not configured; skipping translation")
        return None

    target_name = LANG_NAMES.get(target_lang.lower(), target_lang)
    prompt = _PROMPT_TEMPLATE.format(target=target_name, text=text.strip())

    headers = {"Content-Type": "application/json"}
    if GEMMA_TOKEN:
        headers["Authorization"] = f"Bearer {GEMMA_TOKEN}"

    payload = {
        "model": os.getenv("GEMMA_TRANSLATE_MODEL", "gemma-translate"),
        "prompt": prompt,
        "max_tokens": 400,
        "temperature": 0.0,
        # No `stop` sequence — Gemma often emits leading "\n\n" before the
        # actual translation; a stop="\n\n" empties the response. We trim
        # the result instead.
    }

    try:
        resp = requests.post(
            GEMMA_URL,
            headers=headers,
            json=payload,
            timeout=timeout,
            verify=os.getenv("LLM_VERIFY_SSL", "false").lower() == "true",
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("Gemma Translate failed (%s); returning None", e)
        return None

    if "choices" in data and data["choices"]:
        choice = data["choices"][0]
        translated = choice.get("text") or (choice.get("message") or {}).get("content")
        if translated:
            translated = translated.strip().strip('"').strip("'")
            logger.info("Translated to %s: %r -> %r", target_lang, text[:60], translated[:60])
            return translated

    logger.warning("Gemma Translate returned unexpected payload: %r", data)
    return None
