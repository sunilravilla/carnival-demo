"""
ElevenLabs TTS Service with Character Alignment for Visemes
Provides text-to-speech with timing data for lip-sync animation
"""
import base64
import httpx
import os
import re
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


class ElevenLabsService:
    def __init__(self):
        self.api_key = os.getenv("ELEVEN_LABS_API_KEY")
        if not self.api_key:
            raise ValueError("ELEVEN_LABS_API_KEY not set in environment")

        self.base_url = "https://api.elevenlabs.io/v1"

        # Fixed voice for consistent output across all requests
        # Sarah - female, professional, warm tone
        self.default_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
        # Alternative voices:
        # "21m00Tcm4TlvDq8ikWAM" - Rachel
        # "AZnzlk1XvdvUeBnXmlld" - Domi

        # Model (turbo_v2_5 for low latency + multilingual/Arabic support)
        self.default_model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

        # Voice settings for consistency (high stability = same voice every time)
        self.voice_settings = {
            "stability": 0.85,           # High: consistent voice across calls
            "similarity_boost": 0.80,    # High: stays close to original voice
            "style": 0.0,               # No style exaggeration
            "use_speaker_boost": True,
        }

    @staticmethod
    def _preprocess_text(text: str) -> str:
        """Clean up text before sending to ElevenLabs TTS.

        Fixes common issues that cause the voice to skip or rush words:
        - Double dashes (--) → proper comma pause
        - Excessive whitespace
        - Markdown artifacts (* _ #) from RAG responses
        - Smart quotes and other unicode that can confuse the model
        """
        if not text:
            return text

        # Replace double/triple dashes with comma (natural pause)
        text = re.sub(r'\s*-{2,}\s*', ', ', text)

        # Replace em/en dashes with comma pause
        text = text.replace('\u2014', ', ')   # em dash —
        text = text.replace('\u2013', ', ')   # en dash –

        # Strip markdown bold/italic markers
        text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)
        text = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', text)

        # Strip markdown headers
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

        # Replace smart quotes with straight quotes
        text = text.replace('\u201c', '"').replace('\u201d', '"')
        text = text.replace('\u2018', "'").replace('\u2019', "'")

        # Collapse multiple spaces/newlines into single space
        text = re.sub(r'\s+', ' ', text).strip()

        return text

    async def text_to_speech_with_alignment(
        self,
        text: str,
        voice_id: str = None,
        model_id: str = None
    ) -> Tuple[bytes, Dict]:
        """
        Generate speech from text with character-level timing alignment.

        Returns (audio_bytes, alignment_data)
        alignment_data contains: chars, char_start_times_ms, char_durations_ms
        """
        text = self._preprocess_text(text)

        if not voice_id:
            voice_id = self.default_voice_id
        if not model_id:
            model_id = self.default_model_id

        url = f"{self.base_url}/text-to-speech/{voice_id}/with-timestamps"

        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "model_id": model_id,
            # Ask for character-level timestamps explicitly
            "timestamp_type": "character",
            # Make output bitrate explicit; used for duration estimate from byte-size
            "output_format": "mp3_44100_128",
            "voice_settings": self.voice_settings,
        }

        logger.info(f"ElevenLabs TTS: voice={voice_id}, model={model_id}")
        logger.info(f"Text length: {len(text)} characters")

        try:
            # Disable SSL verification for corporate proxy environments (Zscaler)
            verify_ssl = os.getenv("ELEVENLABS_VERIFY_SSL", "false").lower() == "true"
            
            if not verify_ssl:
                logger.debug("SSL verification disabled for ElevenLabs API (corporate proxy mode)")
            
            async with httpx.AsyncClient(timeout=30.0, verify=verify_ssl) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                data = response.json()
                logger.info(f"Response keys: {list(data.keys())}")

                audio_base64 = data.get("audio_base64", "")
                alignment = data.get("alignment", {})
                if not alignment and isinstance(data, dict):
                    # Try alternative keys if present
                    if "timestamps" in data:
                        alignment = data.get("timestamps") or {}
                    elif "alignment_info" in data:
                        alignment = data.get("alignment_info") or {}

                if alignment and isinstance(alignment, dict):
                    logger.info(f"Alignment keys: {list(alignment.keys())}")
                else:
                    logger.warning("No alignment data in response")

                if not audio_base64:
                    raise ValueError("No audio in ElevenLabs response")

                audio_bytes = base64.b64decode(audio_base64)
                logger.info(f"ElevenLabs TTS: Generated {len(audio_bytes)} bytes")
                if isinstance(alignment, dict):
                    logger.info(f"Alignment chars: {len(alignment.get('chars', []))}")

                return audio_bytes, alignment

        except httpx.HTTPStatusError as e:
            logger.error(f"ElevenLabs API error: {e.response.status_code}")
            try:
                logger.error(f"Response: {e.response.text[:500]}")
            except Exception:
                pass

            if e.response.status_code == 401:
                raise Exception("Invalid ElevenLabs API key")
            elif e.response.status_code == 429:
                raise Exception("ElevenLabs quota exceeded - please upgrade plan")
            else:
                raise Exception(f"ElevenLabs API error: {e.response.status_code}")

        except Exception as e:
            logger.error(f"ElevenLabs error: {str(e)}")
            raise

    async def text_to_speech_fast(
        self,
        text: str,
        voice_id: str = None,
        model_id: str = None
    ) -> bytes:
        """
        Generate speech from text WITHOUT alignment data (faster).

        Use this when visemes are not needed for lip-sync animation.
        Returns only audio_bytes (no alignment data).
        """
        text = self._preprocess_text(text)

        if not voice_id:
            voice_id = self.default_voice_id
        if not model_id:
            model_id = self.default_model_id

        # Use standard endpoint (faster - no timestamp computation)
        url = f"{self.base_url}/text-to-speech/{voice_id}"

        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

        payload = {
            "text": text,
            "model_id": model_id,
            "output_format": "mp3_44100_128",
            "voice_settings": self.voice_settings,
        }

        logger.info(f"ElevenLabs TTS (fast): voice={voice_id}, model={model_id}")
        logger.info(f"Text length: {len(text)} characters")

        try:
            # Disable SSL verification for corporate proxy environments (Zscaler)
            verify_ssl = os.getenv("ELEVENLABS_VERIFY_SSL", "false").lower() == "true"

            if not verify_ssl:
                logger.debug("SSL verification disabled for ElevenLabs API (corporate proxy mode)")

            async with httpx.AsyncClient(timeout=30.0, verify=verify_ssl) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                # Response is direct audio bytes (not JSON)
                audio_bytes = response.content
                logger.info(f"ElevenLabs TTS (fast): Generated {len(audio_bytes)} bytes")

                return audio_bytes

        except httpx.HTTPStatusError as e:
            logger.error(f"ElevenLabs API error: {e.response.status_code}")
            try:
                logger.error(f"Response: {e.response.text[:500]}")
            except Exception:
                pass

            if e.response.status_code == 401:
                raise Exception("Invalid ElevenLabs API key")
            elif e.response.status_code == 429:
                raise Exception("ElevenLabs quota exceeded - please upgrade plan")
            else:
                raise Exception(f"ElevenLabs API error: {e.response.status_code}")

        except Exception as e:
            logger.error(f"ElevenLabs error: {str(e)}")
            raise

    def alignment_to_visemes(
        self,
        alignment: Dict,
        audio_duration_ms: float,
    ) -> List[Dict]:
        """
        Convert ElevenLabs character alignment to the frontend viseme schedule.

        Frontend expects a list of { t: seconds, id: visemeId }.
        """
        # Character-to-viseme mapping (simplified)
        CHAR_TO_VISEME = {
            # Silence
            " ": 0,
            "\n": 0,
            "\t": 0,
            # Bilabials
            "p": 1,
            "b": 1,
            "m": 1,
            "P": 1,
            "B": 1,
            "M": 1,
            # Labiodentals
            "f": 2,
            "v": 2,
            "F": 2,
            "V": 2,
            # Close front vowels
            "i": 3,
            "e": 3,
            "I": 3,
            "E": 3,
            # Dentals/Alveolars
            "t": 4,
            "d": 4,
            "n": 4,
            "T": 4,
            "D": 4,
            "N": 4,
            # Laterals
            "l": 5,
            "L": 5,
            # Sibilants
            "s": 7,
            "z": 7,
            "c": 7,
            "S": 7,
            "Z": 7,
            "C": 7,
            # Velars
            "k": 8,
            "g": 8,
            "q": 8,
            "K": 8,
            "G": 8,
            "Q": 8,
            # Open vowels
            "a": 10,
            "A": 10,
            # Palato-alveolars (approximation)
            "h": 7,
            "H": 7,
            # Rounded back vowels
            "o": 19,
            "O": 19,
            "u": 20,
            "U": 20,
            # Semi-vowels
            "w": 20,
            "W": 20,
            "y": 3,
            "Y": 3,
            # Others
            "r": 6,
            "R": 6,
            "j": 6,
            "J": 6,
            "x": 8,
            "X": 8,
        }

        if not isinstance(alignment, dict):
            return []

        chars = alignment.get("chars", [])
        char_start_times_ms = alignment.get("char_start_times_ms", [])
        char_durations_ms = alignment.get("char_durations_ms", [])

        if not chars or not char_start_times_ms:
            logger.warning("No alignment data, returning empty visemes")
            return []

        visemes: List[Dict] = []
        for i, ch in enumerate(chars):
            if i >= len(char_start_times_ms):
                break
            viseme_id = CHAR_TO_VISEME.get(ch, 0)
            start_time_s = char_start_times_ms[i] / 1000.0
            # Frontend only needs change points
            visemes.append({"t": round(start_time_s, 4), "id": int(viseme_id)})

        logger.info(f"Converted {len(visemes)} character timings to visemes")
        return visemes

    def fallback_visemes_from_text(self, text: str, audio_duration_ms: float) -> List[Dict]:
        """Generate coarse visemes by evenly distributing across text duration.

        Used when the API returns no alignment. Maps non-whitespace characters across
        the total duration. Returns a list of { t, id } entries.
        """
        if not text or not audio_duration_ms or audio_duration_ms <= 0:
            return []

        CHAR_TO_VISEME = {
            " ": 0,
            "\n": 0,
            "\t": 0,
            "p": 1,
            "b": 1,
            "m": 1,
            "P": 1,
            "B": 1,
            "M": 1,
            "f": 2,
            "v": 2,
            "F": 2,
            "V": 2,
            "i": 3,
            "e": 3,
            "I": 3,
            "E": 3,
            "t": 4,
            "d": 4,
            "n": 4,
            "T": 4,
            "D": 4,
            "N": 4,
            "l": 5,
            "L": 5,
            "s": 7,
            "z": 7,
            "c": 7,
            "S": 7,
            "Z": 7,
            "C": 7,
            "k": 8,
            "g": 8,
            "q": 8,
            "K": 8,
            "G": 8,
            "Q": 8,
            "a": 10,
            "A": 10,
            "h": 7,
            "H": 7,
            "o": 19,
            "O": 19,
            "u": 20,
            "U": 20,
            "w": 20,
            "W": 20,
            "y": 3,
            "Y": 3,
            "r": 6,
            "R": 6,
            "j": 6,
            "J": 6,
            "x": 8,
            "X": 8,
        }

        non_space_chars = [c for c in text if not c.isspace()]
        if not non_space_chars:
            return []

        step_s = (audio_duration_ms / 1000.0) / max(1, len(non_space_chars))
        t = 0.0
        visemes: List[Dict] = []
        for c in non_space_chars:
            viseme_id = CHAR_TO_VISEME.get(c, 0)
            visemes.append({"t": round(t, 4), "id": int(viseme_id)})
            t += step_s

        logger.info(f"Generated {len(visemes)} fallback visemes (no alignment from API)")
        return visemes

    async def get_available_voices(self) -> List[Dict]:
        """Get list of available voices from ElevenLabs."""
        url = f"{self.base_url}/voices"
        headers = {"xi-api-key": self.api_key}

        try:
            # Disable SSL verification for corporate proxy environments (Zscaler)
            verify_ssl = os.getenv("ELEVENLABS_VERIFY_SSL", "false").lower() == "true"
            
            async with httpx.AsyncClient(timeout=10.0, verify=verify_ssl) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                voices = data.get("voices", [])

                female_voices = [
                    v for v in voices
                    if "female" in str(v.get("labels", {})).lower()
                    or "woman" in str(v.get("labels", {})).lower()
                ]

                if female_voices:
                    logger.info(f"Found {len(female_voices)} female voices")
                    return female_voices[:5]
                else:
                    logger.info(f"Found {len(voices)} voices total")
                    return voices[:5]
        except Exception as e:
            logger.error(f"Failed to fetch voices: {str(e)}")
            return []

