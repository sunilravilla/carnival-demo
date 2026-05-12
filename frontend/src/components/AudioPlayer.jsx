import { useEffect, useRef } from 'react';

/**
 * Headless audio player — plays ElevenLabs TTS output without rendering anything visible.
 * Replaces the audio-playback responsibility of AvatarLayer.
 *
 * Props:
 *   audioBuffer  ArrayBuffer | null  — raw decoded audio bytes
 *   mime         string              — e.g. "audio/mpeg"
 *   onEnded      () => void          — called when playback finishes
 */
export default function AudioPlayer({ audioBuffer, mime, onEnded, audioElemRef }) {
  const localRef = useRef(null);
  const audioRef = audioElemRef || localRef;

  useEffect(() => {
    if (!audioBuffer || !audioRef.current) return;

    const blob = new Blob([audioBuffer], { type: mime || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    audioRef.current.src = url;

    const handleEnded = () => {
      URL.revokeObjectURL(url);
      onEnded?.();
    };

    audioRef.current.addEventListener('ended', handleEnded, { once: true });
    audioRef.current.play().catch((err) => {
      // Autoplay policy: first playback on mobile requires a user gesture.
      // The mic-tap or send-button tap counts as a gesture, so this should
      // rarely fire in practice. Log and continue.
      console.warn('[AudioPlayer] autoplay blocked:', err);
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioBuffer]);

  return <audio ref={audioRef} style={{ display: 'none' }} />;
}
