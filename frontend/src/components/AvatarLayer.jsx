import { useEffect, useRef, useState } from 'react';
import ZippyAvatar from './ZippyAvatar';
import { useLipsync } from '../hooks/useLipsync';
import hpeTheme from '../styles/hpeTheme';
import { isCarnival } from '../styles/branding';

/**
 * AvatarLayer - Integrates Zippy avatar with audio playback
 * Always shows Zippy, even in idle state
 *
 * @param {Object} props
 * @param {ArrayBuffer} props.audioBuffer - Audio data (optional)
 * @param {string} props.mime - MIME type (e.g., 'audio/wav')
 * @param {Array<{t: number, id: number}>} props.visemes - Optional viseme timings from server
 * @param {boolean} props.isProcessing - Whether currently generating response
 */
export default function AvatarLayer({ audioBuffer, mime, visemes, isProcessing = false }) {
 const audioRef = useRef(null);
 const [ready, setReady] = useState(false);
 const [playing, setPlaying] = useState(false);

 // Drive visemes from audio (server timings or analyser fallback)
 const lipsync = useLipsync({ audioRef, visemes });

 // Set up audio when buffer changes
 useEffect(() => {
 if (!audioRef.current || !audioBuffer) {
 setReady(false);
 setPlaying(false);
 return;
 }

 console.log('[AUDIO] Setting up audio:', {
 size: audioBuffer.byteLength,
 mime,
 visemes: visemes?.length || 0
 });

 const blob = new Blob([audioBuffer], { type: mime || 'audio/wav' });
 const url = URL.createObjectURL(blob);
 audioRef.current.src = url;
 audioRef.current.load(); // Force load

 const handleLoadedData = () => {
 console.log('[OK] Audio loaded and ready');
 setReady(true);
 };

 const handleError = (e) => {
 console.error('[ERROR] Audio loading error:', e);
 console.error('[ERROR] Error target:', audioRef.current?.error);
 };

 audioRef.current.addEventListener('loadeddata', handleLoadedData);
 audioRef.current.addEventListener('error', handleError);

 // Cleanup
 return () => {
 if (audioRef.current) {
 audioRef.current.removeEventListener('loadeddata', handleLoadedData);
 audioRef.current.removeEventListener('error', handleError);
 }
 URL.revokeObjectURL(url);
 };
 }, [audioBuffer, mime, visemes]);

 // Auto-play when ready
 useEffect(() => {
 if (ready && audioRef.current) {
 console.log('[PLAY] Attempting to play audio');
 console.log('[DEBUG] Pre-play state:', {
 paused: audioRef.current.paused,
 currentTime: audioRef.current.currentTime,
 duration: audioRef.current.duration,
 readyState: audioRef.current.readyState,
 muted: audioRef.current.muted,
 volume: audioRef.current.volume
 });

 setPlaying(true);

 // Small delay to ensure everything is ready
 setTimeout(() => {
 const playPromise = audioRef.current?.play();
 if (playPromise !== undefined) {
 playPromise
 .then(() => {
 console.log('[OK] Audio playing');
 // Check state after play
 setTimeout(() => {
 console.log('[DEBUG] Post-play state:', {
 paused: audioRef.current?.paused,
 currentTime: audioRef.current?.currentTime,
 duration: audioRef.current?.duration
 });
 }, 100);
 })
 .catch((err) => {
 console.error('[ERROR] Play error:', err.name, err.message);
 setPlaying(false);
 });
 }
 }, 50);
 }
 }, [ready]);

 const handleEnded = () => {
 console.log('[DONE] Audio playback ended');
 setPlaying(false);
 setReady(false);
 };

 const handlePause = () => {
 console.log('[WARN] Audio paused unexpectedly');
 };

 const handlePlay = () => {
 console.log('[PLAY] Audio play event fired');
 };

 const handleTimeUpdate = () => {
 if (audioRef.current && playing) {
 // Log occasionally to verify playback
 const time = audioRef.current.currentTime;
 if (time % 2 < 0.1) { // Log every ~2 seconds
 console.log('[PLAY]  Playing at:', time.toFixed(1) + 's');
 }
 }
 };

 // Determine status message
 const getStatusMessage = () => {
 if (playing) return 'Speaking...';
 if (isProcessing) return 'Thinking...';
 return 'Ready to chat!';
 };

 return (
 <div style={styles.container}>
 {/* Audio element - NOT hidden, but very small */}
 <audio
 ref={audioRef}
 onEnded={handleEnded}
 onPause={handlePause}
 onPlay={handlePlay}
 onTimeUpdate={handleTimeUpdate}
 style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }}
 controls={false}
 />

 {/* Zippy avatar - ALWAYS visible */}
 <ZippyAvatar currentViseme={playing ? lipsync.current : 0} size={400} />

 {/* Status indicator — hidden in Carnival mode (Online pill in chat panel covers it) */}
 {!isCarnival && (
 <div style={styles.statusContainer}>
 <div style={{
 ...styles.status,
 color: playing ? hpeTheme.brand.green : isProcessing ? hpeTheme.core.purple : hpeTheme.text.weak
 }}>
 {getStatusMessage()}
 </div>
 </div>
 )}
 </div>
 );
}

const styles = {
 container: {
 position: 'relative',
 width: '100%',
 height: '100%',
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 justifyContent: 'center',
 backgroundColor: '#f5f5f5',
 },
 statusContainer: {
 marginTop: '24px',
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 gap: '8px',
 },
 status: {
 fontSize: '16px',
 fontWeight: '500',
 transition: 'color 0.3s ease',
 },
};
