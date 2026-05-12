"""Qwen 2.5 Omni 7B vision client.

OpenAI-compatible chat/completions endpoint that accepts image URLs (or
data: URLs) inline with the user message. Used by the Carnival demo's
"Show this" thumbnail strip — passenger picks a prop image, the backend
forwards it to Qwen Omni, and the textual result is fed into the next
agent turn.
"""

import base64
import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)

QWEN_URL = os.getenv("QWEN_API_ENDPOINT")
QWEN_TOKEN = os.getenv("QWEN_BEARER_TOKEN", "")
QWEN_MODEL = os.getenv("QWEN_MODEL", "/models/Qwen2.5-Omni-7B")


def _is_configured() -> bool:
    return bool(QWEN_URL)


def describe_image(
    *,
    image_bytes: Optional[bytes] = None,
    image_url: Optional[str] = None,
    prompt: str = "Read all text on this image and summarise the key facts in one short paragraph.",
    timeout: float = 30.0,
) -> Optional[str]:
    """Send an image to Qwen Omni Vision; return the text response or None on error.

    Pass exactly one of image_bytes (raw JPEG/PNG) or image_url (http(s) URL).
    """
    if not _is_configured():
        logger.warning("Qwen Omni vision not configured")
        return None
    if not image_bytes and not image_url:
        return None

    if image_bytes:
        # Conservative: assume JPEG. Qwen tolerates wrong MIME if base64 decodes.
        b64 = base64.b64encode(image_bytes).decode()
        image_payload = {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
    else:
        image_payload = {"type": "image_url", "image_url": {"url": image_url}}

    headers = {"Content-Type": "application/json"}
    if QWEN_TOKEN:
        headers["Authorization"] = f"Bearer {QWEN_TOKEN}"

    payload = {
        "model": QWEN_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    image_payload,
                ],
            }
        ],
        "max_tokens": 400,
        "temperature": 0.0,
    }

    try:
        resp = requests.post(
            QWEN_URL,
            headers=headers,
            json=payload,
            timeout=timeout,
            verify=os.getenv("LLM_VERIFY_SSL", "false").lower() == "true",
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("Qwen Omni vision call failed: %s", e)
        return None

    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        logger.warning("Qwen Omni unexpected payload: %r", data)
        return None
