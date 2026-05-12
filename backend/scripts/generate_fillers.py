"""
Generate pre-recorded filler audio files for LiveAvatar.

Uses ElevenLabs TTS to generate English filler phrases, then converts
to PCM 24kHz mono s16le via ffmpeg -- the exact same pipeline used
for regular LiveAvatar responses.

Each voice gets its own subdirectory under filler_audio/{voice_id}/.
Files are skipped if they already exist (idempotent).

Usage:
    cd backend
    python -m scripts.generate_fillers [--voice-id <id>]

    # Force regeneration even if files exist:
    python -m scripts.generate_fillers --voice-id <id> --force

Requires: ELEVEN_LABS_API_KEY, ELEVENLABS_MODEL_ID in .env
Requires: ffmpeg installed and in PATH
"""
import argparse
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

FILLERS = {
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

_BASE_FILLER_DIR = Path(__file__).parent.parent / 'filler_audio'


async def _generate_tts_mp3(text: str, api_key: str, voice_id: str, model_id: str) -> bytes:
    """Call ElevenLabs TTS and return MP3 audio bytes."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": model_id,
        "output_format": "mp3_44100_128",
        "voice_settings": {
            "stability": 0.85,
            "similarity_boost": 0.80,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.content


def _convert_mp3_to_pcm_24khz(mp3_bytes: bytes) -> bytes:
    """Convert MP3 bytes to PCM 24kHz mono s16le via ffmpeg."""
    mp3_path = None
    pcm_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            f.write(mp3_bytes)
            mp3_path = f.name

        with tempfile.NamedTemporaryFile(suffix='.pcm', delete=False) as f:
            pcm_path = f.name

        command = [
            'ffmpeg',
            '-i', mp3_path,
            '-ar', '24000',
            '-ac', '1',
            '-f', 's16le',
            '-acodec', 'pcm_s16le',
            '-y',
            pcm_path
        ]

        subprocess.run(command, capture_output=True, text=True, check=True)

        with open(pcm_path, 'rb') as f:
            return f.read()

    finally:
        for path in (mp3_path, pcm_path):
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError:
                    pass


async def generate_filler_audio(
    voice_id: str,
    lang: str = "en",
    out_dir: Path | None = None,
    api_key: str | None = None,
    model_id: str | None = None,
    force: bool = False,
) -> list[dict]:
    """Generate (or load) filler PCM files for a given ElevenLabs voice_id and language.

    Files are stored under out_dir/{voice_id}/{lang}/ and skipped if they already
    exist (unless force=True).

    Returns a list of manifest-style dicts with id, text, filename, size_bytes.
    Raises on API errors.
    """
    if out_dir is None:
        out_dir = _BASE_FILLER_DIR
    if api_key is None:
        api_key = os.getenv("ELEVEN_LABS_API_KEY")
    if not api_key:
        raise ValueError("ELEVEN_LABS_API_KEY not set")
    if model_id is None:
        model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

    filler_list = FILLERS.get(lang, FILLERS["en"])
    voice_lang_dir = Path(out_dir) / voice_id / lang
    voice_lang_dir.mkdir(parents=True, exist_ok=True)

    manifest = []

    for filler in filler_list:
        filename = f"filler_{filler['id']}.pcm"
        filepath = voice_lang_dir / filename

        if filepath.exists() and not force:
            size = filepath.stat().st_size
            manifest.append({
                "id": filler['id'],
                "text": filler['text'],
                "filename": filename,
                "size_bytes": size,
            })
            print(f"  [{filler['id']}/{len(filler_list)}] Already exists, skipping: {filename}")
            continue

        print(f"  [{filler['id']}/{len(filler_list)}] Generating [{lang}]: {filler['text']}")

        mp3_bytes = await _generate_tts_mp3(filler['text'], api_key, voice_id, model_id)
        print(f"         MP3: {len(mp3_bytes)} bytes")

        pcm_bytes = _convert_mp3_to_pcm_24khz(mp3_bytes)

        # 150ms of silence prefix — PCM 24kHz mono 16-bit = 48000 bytes/sec
        silence_prefix = b'\x00' * 7200
        pcm_bytes = silence_prefix + pcm_bytes
        print(f"         PCM: {len(pcm_bytes)} bytes (incl 150ms silence prefix)")

        with open(filepath, 'wb') as f:
            f.write(pcm_bytes)

        manifest.append({
            "id": filler['id'],
            "text": filler['text'],
            "filename": filename,
            "size_bytes": len(pcm_bytes),
        })
        print(f"         Saved: {filepath}\n")

    manifest_path = voice_lang_dir / 'fillers.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest


async def main():
    parser = argparse.ArgumentParser(description="Generate ElevenLabs filler audio per voice")
    parser.add_argument(
        "--voice-id",
        default=os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
        help="ElevenLabs voice ID (default: ELEVENLABS_VOICE_ID env var or Sarah)",
    )
    parser.add_argument(
        "--lang",
        default="en",
        choices=list(FILLERS.keys()),
        help="Language of filler phrases (default: en)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even if files already exist",
    )
    args = parser.parse_args()

    api_key = os.getenv("ELEVEN_LABS_API_KEY")
    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

    if not api_key:
        print("ERROR: ELEVEN_LABS_API_KEY not set in .env")
        sys.exit(1)

    print(f"Voice: {args.voice_id}, Lang: {args.lang}, Model: {model_id}")
    print(f"Output: {_BASE_FILLER_DIR / args.voice_id / args.lang}")
    print(f"Generating {len(FILLERS[args.lang])} filler audio files...\n")

    manifest = await generate_filler_audio(
        voice_id=args.voice_id,
        lang=args.lang,
        api_key=api_key,
        model_id=model_id,
        force=args.force,
    )

    print(f"\nDone.")
    total_size = sum(m['size_bytes'] for m in manifest)
    print(f"Total size: {total_size / 1024:.1f} KB ({len(manifest)} files)")


if __name__ == "__main__":
    asyncio.run(main())
