"""
Audio metadata fixer for video generation compatibility
Fixes WAV files that lack proper duration/metadata
"""
import wave
import os
import struct
import logging

logger = logging.getLogger(__name__)


def fix_wav_metadata(input_path: str, output_path: str = None) -> str:
    """
    Fix WAV file metadata to ensure it has proper headers and duration info.
    This fixes the "float division by zero" error in video generation.

    Args:
        input_path: Path to input WAV file
        output_path: Path to output fixed WAV file (if None, overwrites input)

    Returns:
        Path to fixed WAV file
    """
    if output_path is None:
        output_path = input_path.replace(".wav", "_fixed.wav")

    try:
        # Read the audio data
        with wave.open(input_path, 'rb') as wav_in:
            params = wav_in.getparams()
            frames = wav_in.readframes(wav_in.getnframes())

            nchannels = params.nchannels
            sampwidth = params.sampwidth
            framerate = params.framerate
            nframes = params.nframes

            logger.info(f"Original WAV: {nchannels}ch, {framerate}Hz, {sampwidth}bytes/sample, {nframes} frames")

            # Check if parameters are valid
            if framerate == 0:
                logger.warning("Sample rate is 0, setting to 16000 Hz")
                framerate = 16000

            if nchannels == 0:
                logger.warning("Channel count is 0, setting to 1 (mono)")
                nchannels = 1

            if sampwidth == 0:
                logger.warning("Sample width is 0, setting to 2 (16-bit)")
                sampwidth = 2

        # Write fixed WAV file with proper metadata
        with wave.open(output_path, 'wb') as wav_out:
            wav_out.setnchannels(nchannels)
            wav_out.setsampwidth(sampwidth)
            wav_out.setframerate(framerate)
            wav_out.writeframes(frames)

        # Verify the fixed file
        with wave.open(output_path, 'rb') as wav_verify:
            duration = wav_verify.getnframes() / wav_verify.getframerate()
            logger.info(f"Fixed WAV: Duration = {duration:.2f}s, Size = {os.path.getsize(output_path)} bytes")

        return output_path

    except Exception as e:
        logger.error(f"Failed to fix WAV metadata: {e}")
        # Return original file if fixing fails
        return input_path


def ensure_valid_wav(audio_path: str) -> str:
    """
    Ensure WAV file has valid metadata, fix if needed.

    Args:
        audio_path: Path to audio file

    Returns:
        Path to validated/fixed audio file
    """
    try:
        # Try to open and read basic info
        with wave.open(audio_path, 'rb') as wav:
            framerate = wav.getframerate()
            nframes = wav.getnframes()

            # Check for invalid metadata that causes division by zero
            if framerate == 0 or nframes == 0:
                logger.warning(f"Invalid WAV metadata detected: framerate={framerate}, nframes={nframes}")
                logger.info("Fixing WAV file...")
                return fix_wav_metadata(audio_path)

            # Calculate duration
            duration = nframes / framerate

            # Check for suspiciously short audio (might indicate corrupt metadata)
            if duration < 0.1:
                logger.warning(f"Suspiciously short duration: {duration}s. Fixing...")
                return fix_wav_metadata(audio_path)

            logger.info(f"WAV file is valid: {duration:.2f}s, {framerate}Hz")
            return audio_path

    except wave.Error as e:
        logger.warning(f"WAV format error: {e}. Attempting to fix...")
        return fix_wav_metadata(audio_path)
    except Exception as e:
        logger.error(f"Error validating WAV: {e}")
        return audio_path
