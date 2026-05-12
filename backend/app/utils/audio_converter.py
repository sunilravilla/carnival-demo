"""
Audio format converter utility
Ensures audio files are in the correct format for Duix Avatar
"""
import os
import subprocess
from pathlib import Path

def convert_to_compatible_wav(input_path: str, output_path: str = None) -> str:
    """
    Convert audio file to WAV format compatible with Duix Avatar

    Requirements:
    - Sample rate: 16000 Hz
    - Channels: Mono (1 channel)
    - Format: PCM 16-bit
    - Codec: pcm_s16le

    Args:
        input_path: Path to input audio file
        output_path: Path for output file (optional, will generate if not provided)

    Returns:
        Path to converted audio file
    """
    if output_path is None:
        # Generate output path
        input_file = Path(input_path)
        output_path = str(input_file.parent / f"{input_file.stem}_converted.wav")

    try:
        # Use ffmpeg to convert to compatible format
        command = [
            'ffmpeg',
            '-i', input_path,
            '-ar', '16000',  # Sample rate 16kHz
            '-ac', '1',      # Mono
            '-c:a', 'pcm_s16le',  # PCM 16-bit little-endian
            '-y',  # Overwrite output file
            output_path
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )

        return output_path

    except subprocess.CalledProcessError as e:
        raise Exception(f"Audio conversion failed: {e.stderr}")
    except FileNotFoundError:
        raise Exception("ffmpeg not found. Please install ffmpeg and add it to PATH")

def get_audio_info(audio_path: str) -> dict:
    """
    Get audio file information using ffprobe

    Returns:
        Dictionary with duration, sample_rate, channels, format
    """
    try:
        command = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            audio_path
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )

        import json
        data = json.loads(result.stdout)

        audio_stream = None
        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'audio':
                audio_stream = stream
                break

        if not audio_stream:
            raise Exception("No audio stream found in file")

        return {
            'duration': float(data['format'].get('duration', 0)),
            'sample_rate': int(audio_stream.get('sample_rate', 0)),
            'channels': int(audio_stream.get('channels', 0)),
            'codec': audio_stream.get('codec_name', ''),
            'bitrate': int(data['format'].get('bit_rate', 0))
        }

    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to get audio info: {e.stderr}")
    except FileNotFoundError:
        raise Exception("ffprobe not found. Please install ffmpeg and add it to PATH")

def validate_audio_for_video(audio_path: str) -> tuple[bool, str]:
    """
    Validate if audio file is compatible with Duix Avatar

    Returns:
        (is_valid, message)
    """
    try:
        info = get_audio_info(audio_path)

        issues = []

        if info['duration'] <= 0:
            issues.append("Audio duration is 0 or invalid")

        if info['duration'] > 60:
            issues.append(f"Audio too long ({info['duration']}s > 60s)")

        if info['sample_rate'] not in [8000, 16000, 22050, 44100, 48000]:
            issues.append(f"Unsupported sample rate: {info['sample_rate']}")

        if info['channels'] > 2:
            issues.append(f"Too many channels: {info['channels']}")

        if not info['codec']:
            issues.append("Unknown audio codec")

        if issues:
            return False, "; ".join(issues)

        return True, f"Valid audio: {info['duration']:.2f}s, {info['sample_rate']}Hz, {info['channels']}ch"

    except Exception as e:
        return False, f"Validation error: {str(e)}"


def convert_mp3_to_pcm_24khz(mp3_bytes: bytes) -> bytes:
    """
    Convert MP3 audio bytes to PCM 24kHz mono format for LiveAvatar
    
    LiveAvatar requirements:
    - Sample rate: 24000 Hz
    - Channels: Mono (1 channel)
    - Format: PCM 16-bit signed little-endian
    - Encoding: Raw PCM (no WAV header)
    
    Args:
        mp3_bytes: MP3 audio data as bytes
        
    Returns:
        PCM audio data as bytes (raw, no WAV header)
    """
    import tempfile
    
    try:
        # Create temp files for input MP3 and output PCM
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as mp3_file:
            mp3_file.write(mp3_bytes)
            mp3_path = mp3_file.name
        
        with tempfile.NamedTemporaryFile(suffix='.pcm', delete=False) as pcm_file:
            pcm_path = pcm_file.name
        
        # Use ffmpeg to convert MP3 → PCM 24kHz mono
        command = [
            'ffmpeg',
            '-i', mp3_path,
            '-ar', '24000',           # Sample rate 24kHz
            '-ac', '1',               # Mono
            '-f', 's16le',            # Output format: signed 16-bit little-endian PCM
            '-acodec', 'pcm_s16le',   # PCM codec
            '-y',                     # Overwrite output
            pcm_path
        ]
        
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )
        
        # Read converted PCM data
        with open(pcm_path, 'rb') as f:
            pcm_bytes = f.read()

        # Cleanup temp files
        os.unlink(mp3_path)
        os.unlink(pcm_path)

        # Append silence padding at the end to prevent last words being cut off.
        # WebRTC/LiveAvatar can drop trailing audio frames, so 1.5s of silence
        # ensures the final spoken words fully play out before the avatar stops.
        # PCM 24kHz mono 16-bit = 48000 bytes/sec, 1.5s = 72000 bytes of zeros.
        silence_padding = b'\x00' * 72000
        pcm_bytes = pcm_bytes + silence_padding

        return pcm_bytes
        
    except subprocess.CalledProcessError as e:
        raise Exception(f"MP3 to PCM conversion failed: {e.stderr}")
    except FileNotFoundError:
        raise Exception("ffmpeg not found. Please install ffmpeg and add it to PATH")
    finally:
        # Ensure cleanup even if error occurs
        try:
            if os.path.exists(mp3_path):
                os.unlink(mp3_path)
            if os.path.exists(pcm_path):
                os.unlink(pcm_path)
        except:
            pass
