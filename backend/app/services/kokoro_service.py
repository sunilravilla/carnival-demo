"""
Kokoro TTS Service — async wrapper around the remote Kokoro API server.
Returns WAV bytes (24 kHz mono s16le) for both 2D and 3D avatar pipelines.
For LiveAvatar, call wav_to_raw_pcm() to strip the WAV header.
"""

import asyncio
import io
import logging
import os
import re
import time
import wave
from typing import List, Optional

import requests

logger = logging.getLogger(__name__)

KOKORO_API_URL = os.getenv("KOKORO_API_URL", os.getenv("TTS_API_URL", ""))
KOKORO_API_KEY = os.getenv("TTS_API_KEY", "")
KOKORO_ADMIN_KEY = os.getenv("TTS_ADMIN_KEY", "")
KOKORO_VOICE = os.getenv("KOKORO_TTS_VOICE", "af_sarah")

_TTS_MAX_CHARS = 4800


# ---------------------------------------------------------------------------
# Text splitting
# ---------------------------------------------------------------------------

def _split_text(text: str, max_chars: int = _TTS_MAX_CHARS) -> List[str]:
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r'\n\n+|(?<=[.!?])\s+', text)
    chunks: List[str] = []
    current = ""
    for sentence in sentences:
        if not sentence.strip():
            continue
        if len(sentence) > max_chars:
            for word in sentence.split():
                if len(current) + len(word) + 1 > max_chars:
                    if current:
                        chunks.append(current.strip())
                    current = word
                else:
                    current = (current + " " + word).lstrip()
        elif current and len(current) + len(sentence) + 2 > max_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = (current + "  " + sentence).lstrip() if current else sentence
    if current.strip():
        chunks.append(current.strip())
    return chunks or [text[:max_chars]]


# ---------------------------------------------------------------------------
# WAV concatenation
# ---------------------------------------------------------------------------

def _concat_wav(wav_list: List[bytes]) -> Optional[bytes]:
    pcm_parts: List[bytes] = []
    params = None
    for wav_bytes in wav_list:
        if not wav_bytes:
            continue
        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
                if params is None:
                    params = wf.getparams()
                pcm_parts.append(wf.readframes(wf.getnframes()))
        except Exception:
            continue
    if not pcm_parts or params is None:
        return None
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setparams(params)
        for pcm in pcm_parts:
            wf.writeframes(pcm)
    out.seek(0)
    return out.read()


# ---------------------------------------------------------------------------
# Single-chunk API call with retry
# ---------------------------------------------------------------------------

def _call_api(text: str, endpoint: str, params: dict, headers: dict, voice: str) -> Optional[bytes]:
    last_exc = None
    for attempt in range(3):
        try:
            resp = requests.post(
                endpoint,
                params=params,
                json={"text": text, "voice": voice},
                headers=headers,
                timeout=(10, 180),  # (connect timeout, read timeout)
            )
            if resp.status_code in (500, 502, 503, 504) and attempt < 2:
                logger.warning("Kokoro API transient error (attempt %d): HTTP %d", attempt + 1, resp.status_code)
                time.sleep(3 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.content
        except Exception as e:
            last_exc = e
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
    logger.error("Kokoro API error after retries: %s", last_exc)
    return None


# ---------------------------------------------------------------------------
# Synchronous generation (called via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _generate_wav_sync(text: str, voice: str) -> Optional[bytes]:
    base_url = KOKORO_API_URL.rstrip("/")
    if not base_url:
        logger.error("KOKORO_API_URL not configured")
        return None

    endpoint = f"{base_url}/tts"
    params = {"admin_key": KOKORO_ADMIN_KEY} if KOKORO_ADMIN_KEY else {}
    headers = {"Content-Type": "application/json"}
    if KOKORO_API_KEY:
        headers["Authorization"] = f"Bearer {KOKORO_API_KEY}"

    chunks = _split_text(text)
    logger.info("Kokoro TTS: %d chars → %d chunks", len(text), len(chunks))

    if len(chunks) == 1:
        return _call_api(chunks[0], endpoint, params, headers, voice)

    parts = []
    for i, chunk in enumerate(chunks):
        result = _call_api(chunk, endpoint, params, headers, voice)
        if result:
            parts.append(result)
        else:
            logger.warning("Kokoro: chunk %d/%d failed, skipping", i + 1, len(chunks))

    if not parts:
        return None

    combined = _concat_wav(parts)
    if combined:
        logger.info("Kokoro TTS: concatenated %d chunks → %d WAV bytes", len(parts), len(combined))
    else:
        logger.warning("Kokoro TTS: WAV concat failed, returning first chunk")
        combined = parts[0]
    return combined


# ---------------------------------------------------------------------------
# PCM extraction for LiveAvatar
# ---------------------------------------------------------------------------

def wav_to_raw_pcm(wav_bytes: bytes) -> bytes:
    """
    Strip the WAV header and return raw s16le PCM frames + 1.5s silence padding.
    LiveAvatar's repeatAudio() expects raw PCM at 24 kHz mono (no WAV header).
    Silence padding (72000 bytes) prevents the last spoken words from being cut off.
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        pcm = wf.readframes(wf.getnframes())
    # 1.5s silence at 24 kHz mono 16-bit = 24000 * 2 * 1.5 = 72000 bytes
    return pcm + b'\x00' * 72000


# ---------------------------------------------------------------------------
# Public service class
# ---------------------------------------------------------------------------

class KokoroService:
    def __init__(self):
        self.voice = KOKORO_VOICE
        if not KOKORO_API_URL:
            logger.warning("KOKORO_API_URL not set — Kokoro TTS will fail at runtime")

    async def text_to_speech_fast(self, text: str) -> bytes:
        """
        Generate speech and return WAV bytes (24 kHz mono).
        For LiveAvatar, extract raw PCM via wav_to_raw_pcm().
        Runs the synchronous HTTP call in a thread pool.
        """
        wav = await asyncio.to_thread(_generate_wav_sync, text, self.voice)
        if not wav:
            raise Exception("Kokoro TTS returned no audio")
        logger.info("Kokoro TTS: %d WAV bytes", len(wav))
        return wav
