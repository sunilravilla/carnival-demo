import { useEffect, useRef, useState } from "react";

/**
 * Split raw s16le PCM audio at silence boundaries.
 *
 * Prevents mid-word chunk splits that cause audible glitches when LiveAvatar
 * transitions between repeatAudio() calls. TTS engines produce near-zero
 * amplitude between sentences, making those reliable split points.
 *
 * @param {ArrayBuffer} buffer         Raw PCM s16le 24kHz mono
 * @param {number} maxChunkBytes       Hard ceiling per chunk (default 480 000 ≈ 10 s)
 * @param {number} silenceThreshold    Amplitude ≤ this is "silent" (0–32767, default 300)
 * @param {number} minSilenceMs        Min consecutive silence to qualify as split point (ms)
 * @returns {ArrayBuffer[]}
 */
function splitPCMAtSilence(buffer, maxChunkBytes = 480000, silenceThreshold = 300, minSilenceMs = 60) {
  if (buffer.byteLength <= maxChunkBytes) return [buffer];

  const SAMPLE_RATE = 24000;
  const samples = new Int16Array(buffer);
  const n = samples.length;
  const samplesPerChunk = maxChunkBytes >> 1;           // 2 bytes per int16
  const minSilenceSamples = Math.round(minSilenceMs * SAMPLE_RATE / 1000);

  // Single forward pass — collect the midpoint of every silence run that
  // meets the minimum duration requirement.
  const silenceMids = [];
  let runStart = -1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(samples[i]) <= silenceThreshold) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0) {
        const len = i - runStart;
        if (len >= minSilenceSamples) silenceMids.push(runStart + (len >> 1));
        runStart = -1;
      }
    }
  }
  if (runStart >= 0 && n - runStart >= minSilenceSamples) {
    silenceMids.push(runStart + ((n - runStart) >> 1));
  }

  const chunks = [];
  let pos = 0; // sample index

  while (n - pos > samplesPerChunk) {
    const lo = pos + (samplesPerChunk >> 1); // search from 50 % of chunk
    const hi = pos + samplesPerChunk;        // up to 100 %

    // Pick the silence mid closest to hi (split as late as possible so each
    // chunk ends on a natural pause rather than mid-phoneme).
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < silenceMids.length; j++) {
      const mid = silenceMids[j];
      if (mid >= lo && mid <= hi) {
        const d = hi - mid;
        if (d < bestDist) { bestDist = d; best = mid; }
      }
    }

    const split = best >= 0 ? best : hi; // fall back to hard split if no silence found
    chunks.push(buffer.slice(pos << 1, split << 1));
    pos = split;
  }

  if (pos < n) chunks.push(buffer.slice(pos << 1));
  return chunks.length > 0 ? chunks : [buffer];
}
import {
 LiveAvatarSession,
 SessionState,
 AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";
import hpeTheme from "../styles/hpeTheme";

// Get API base URL from environment or use relative URL (goes through nginx proxy)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * LiveAvatar WebRTC Player Component
 *
 * Handles LiveAvatar session with Custom Mode:
 * - Creates session with backend
 * - Manages WebRTC video stream
 * - Sends audio to avatar for lip-synced video playback
 *
 * @param {Object} props
 * @param {ArrayBuffer} props.audioBuffer - Audio to send to avatar (PCM 24kHz base64)
 * @param {string} props.audioFormat - Audio format (wav, mp3)
 * @param {boolean} props.isProcessing - Show processing state
 * @param {Function} props.onAvatarSpeakEnd - Callback when avatar finishes speaking
 */
export default function LiveAvatarPlayer({
 audioBuffer,
 audioFormat = "wav",
 isProcessing = false,
 onAvatarSpeakEnd,
 fillerAudios = [],
}) {
 const videoRef = useRef(null);
 const sessionRef = useRef(null);
 const sessionIdRef = useRef(null); // Track session ID for server-side cleanup
 const lastSentAudioRef = useRef(null); // Track last sent audio to prevent duplicates
 const [sessionState, setSessionState] = useState(SessionState.INACTIVE);
 const [isStreamReady, setIsStreamReady] = useState(false);
 const [isTalking, setIsTalking] = useState(false);
 const [error, setError] = useState(null);
 const [needsUserGesture, setNeedsUserGesture] = useState(true);

 // Filler phrase tracking
 const fillerSentRef = useRef(false);
 const actualAudioQueuedRef = useRef(false);
 const lastFillerIndexRef = useRef(-1);
 // Separate counter for filler SPEAK events so they don't interfere with chunk tracking
 const pendingFillerCountRef = useRef(0);

 // Audio chunking - HeyGen WebSocket has 1MB message limit.
 // PCM 24kHz mono 16-bit = 48000 bytes/sec. At ~10s per chunk (480000 bytes),
 // base64 encoding produces ~640KB, safely under the 1MB limit.
 const CHUNK_MAX_BYTES = 480000;
 // Chunks waiting to be sent (not yet dispatched to HeyGen)
 const audioChunkQueueRef = useRef([]);
 // Number of actual audio chunks sent to HeyGen that haven't finished playing yet
 const pendingChunkCountRef = useRef(0);

 // Cleanup on unmount — stop SDK session and notify backend to clear its session tracker
 useEffect(() => {
 return () => {
 const sid = sessionIdRef.current;
 if (sessionRef.current) {
 sessionRef.current.stop();
 sessionRef.current = null;
 }
 // Tell the backend to clear its session ID so the next session start succeeds.
 // HeyGen enforces 1 concurrent session per API key; without this the next
 // /api/liveavatar/session call would not stop the old session first.
 if (sid) {
 const stopUrl = API_BASE_URL ? `${API_BASE_URL}/api/liveavatar/session/stop` : "/api/liveavatar/session/stop";
 navigator.sendBeacon(stopUrl, JSON.stringify({ session_id: sid }));
 }
 };
 }, []);

 // Called by user click - provides the browser gesture needed for audio playback
 const handleStartSession = () => {
 setNeedsUserGesture(false);
 initializeSession();
 };

 // Send FILLER audio when processing starts (reduces perceived latency)
 useEffect(() => {
 if (isProcessing && isStreamReady && sessionRef.current && fillerAudios.length > 0) {
 // Pick a random filler (avoid repeating the last one)
 let idx;
 do {
 idx = Math.floor(Math.random() * fillerAudios.length);
 } while (idx === lastFillerIndexRef.current && fillerAudios.length > 1);
 lastFillerIndexRef.current = idx;

 const filler = fillerAudios[idx];
 console.log("[FILLER] Sending filler phrase:", filler.text);
 const base64Audio = arrayBufferToBase64(filler.audioBuffer);
 pendingFillerCountRef.current += 1;
 sessionRef.current.repeatAudio(base64Audio);
 fillerSentRef.current = true;
 actualAudioQueuedRef.current = false;
 }
 if (!isProcessing) {
 // Reset filler tracking when processing ends
 fillerSentRef.current = false;
 actualAudioQueuedRef.current = false;
 }
 }, [isProcessing, isStreamReady]);

 // Send ACTUAL response audio (queues behind filler if one is playing)
 useEffect(() => {
 if (audioBuffer && isStreamReady && sessionRef.current) {
 if (lastSentAudioRef.current === audioBuffer) {
 console.log("[SKIP] Skipping duplicate audio (same reference)");
 return;
 }
 console.log("[SEND] Queueing actual response audio to avatar");
 sendAudioToAvatar(audioBuffer);
 actualAudioQueuedRef.current = true;
 }
 }, [audioBuffer, isStreamReady]);

 const initializeSession = async () => {
 try {
 console.log("[INIT] Initializing LiveAvatar session...");

 // Get session token from backend
 const apiUrl = API_BASE_URL
 ? `${API_BASE_URL}/api/liveavatar/session`
 : "/api/liveavatar/session";
 console.log("[CONFIG] API URL:", apiUrl);

 const response = await fetch(apiUrl, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ mode: "LITE" }),
 });

 if (!response.ok) {
 throw new Error(`Failed to create session: ${response.statusText}`);
 }

 const { session_id, session_token } = await response.json();
 sessionIdRef.current = session_id;
 console.log("[OK] Session token received:", session_id);

 // Route SDK API calls through our server so /v1/sessions/start is intercepted.
 // The backend rewrites livekit_url to our WebSocket proxy, keeping all
 // LiveKit traffic server-side and out of Zscaler's inspection path.
 const sdkApiUrl = API_BASE_URL || window.location.origin;
 const sessionConfig = {
 apiUrl: sdkApiUrl,
 voiceChat: false, // We control audio input via repeatAudio()
 };

 const session = new LiveAvatarSession(session_token, sessionConfig);

 // Let ICE negotiate all candidate types (host, srflx, relay).
 // Forcing relay-only previously caused zero candidates when Zscaler blocked
 // LiveKit's TURN servers, sending an empty SDP offer that LiveKit rejected.
 // Signaling is now proxied through our server, so the original Zscaler WS
 // issue is resolved; we no longer need to force relay-only.
 console.log("[CONFIG]  SDK apiUrl:", sdkApiUrl, "| ICE policy: all (default)");

 sessionRef.current = session;

 // Log ALL events for debugging (helps identify what events SDK actually fires)
 const originalOn = session.on.bind(session);
 const eventLog = new Set();
 session.on = (event, handler) => {
 if (!eventLog.has(event)) {
 eventLog.add(event);
 console.log(`[EVENT]  Registering listener for event: ${event}`);
 }
 return originalOn(event, (...args) => {
 console.log(`[EVENT]  Event fired: ${event}`, args);
 return handler(...args);
 });
 };

 // Track session state changes
 session.on("SESSION_STATE_CHANGED", (state) => {
 console.log("[STATE]  Session state:", state);
 setSessionState(state);

 if (state === SessionState.DISCONNECTED) {
 setIsStreamReady(false);
 console.warn("[WARN]  Session disconnected - may need to reconnect");
 } else if (state === SessionState.CONNECTED) {
 console.log("[OK]  Session CONNECTED - waiting for stream...");
 }
 });

 // Helper function to attach stream when ready
 const attachStream = () => {
 if (videoRef.current && sessionRef.current) {
 try {
 sessionRef.current.attach(videoRef.current);
 console.log("[OK]  Video/audio tracks attached to element");
 setIsStreamReady(true);
 setSessionState(SessionState.CONNECTED);
 } catch (err) {
 console.error("[ERROR]  Error attaching stream:", err);
 }
 }
 };

 // Track stream readiness
 session.on("SESSION_STREAM_READY", () => {
 console.log("[OK]  SESSION_STREAM_READY event fired");
 attachStream();
 });

 // Also listen for stream state changes (alternative event)
 session.on("STREAM_STATE_CHANGED", (state) => {
 console.log("[STATE]  Stream state changed:", state);
 if (state === "active") {
 console.log("[OK]  Stream is ACTIVE - attaching stream");
 attachStream();
 }
 });

 // Listen for all stream-related events (catch-all for debugging)
 session.on("STREAM_READY", () => {
 console.log("[OK]  STREAM_READY event (alternative) fired");
 attachStream();
 });

 // Listen for media stream
 session.on("MEDIA_STREAM_READY", () => {
 console.log("[OK]  MEDIA_STREAM_READY event fired");
 attachStream();
 });

 // Handle microphone errors gracefully (e.g., KasmWeb browser without mic access)
 session.on("SESSION_ERROR", (error) => {
 console.warn("[WARN]  Session error (non-fatal):", error);
 // Don't set error state for mic issues - avatar can still work
 if (error && error.message && error.message.includes("getUserMedia")) {
 console.log(
 " Microphone not available - will use text-to-speech only mode",
 );
 }
 });

 // Track avatar speaking events
 session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, (data) => {
 console.log("[SPEAK]  Avatar started speaking", data);
 setIsTalking(true);
 });

 session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, (data) => {
 console.log("[DONE]  Avatar finished speaking", data);

 // Handle filler events separately so they don't interfere with chunk tracking
 if (pendingFillerCountRef.current > 0) {
 pendingFillerCountRef.current -= 1;
 setIsTalking(false);
 if (fillerSentRef.current && !actualAudioQueuedRef.current) {
 console.log("[FILLER] Filler finished, waiting for actual response...");
 }
 return;
 }

 // Actual audio chunk finished — decrement pending count
 pendingChunkCountRef.current = Math.max(0, pendingChunkCountRef.current - 1);
 console.log(`[CHUNK] Chunk done, ${pendingChunkCountRef.current} pending, ${audioChunkQueueRef.current.length} remaining`);

 // If more chunks are queued, send the next one now.
 // Sending on SPEAK_ENDED (not SPEAK_STARTED) ensures HeyGen receives
 // the next chunk while it still has the previous one queued internally,
 // preventing the empty-queue session close (code 1000, wasClean: false).
 if (audioChunkQueueRef.current.length > 0) {
 const next = audioChunkQueueRef.current.shift();
 const base64 = arrayBufferToBase64(next);
 sessionRef.current.repeatAudio(base64);
 pendingChunkCountRef.current += 1;
 console.log(`[CHUNK] Sent next chunk, ${pendingChunkCountRef.current} pending, ${audioChunkQueueRef.current.length} remaining`);
 return;
 }

 // Still have pending chunks playing (the prefilled ones) — wait
 if (pendingChunkCountRef.current > 0) {
 return;
 }

 // All chunks done - signal completion
 setIsTalking(false);
 lastSentAudioRef.current = null;
 fillerSentRef.current = false;
 actualAudioQueuedRef.current = false;
 if (onAvatarSpeakEnd) {
 onAvatarSpeakEnd();
 }
 });

 // Track session disconnection
 session.on("SESSION_DISCONNECTED", (reason) => {
 console.warn("[WARN]  Session disconnected:", reason);
 setError(`Session disconnected: ${reason}`);
 });

 // Request microphone permission BEFORE starting LiveKit session.
 // LiveKit requires at least one media permission grant to establish
 // a WebRTC peer connection (even when voiceChat is disabled).
 // On localhost browsers auto-grant this; on remote origins it must
 // be explicitly requested or the connection silently fails.
 try {
 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 stream.getTracks().forEach((t) => t.stop());
 console.log("[OK]  Microphone permission granted");
 } catch (micErr) {
 console.warn("[WARN]  Microphone permission denied:", micErr.message);
 }

 // Start the session
 console.log("[INIT]  Starting LiveAvatar session...");
 await session.start();
 console.log("[OK]  LiveAvatar session started successfully");

 // Fallback: Force attach stream after 3 seconds if events don't fire
 // This handles cases where SDK events are unreliable
 setTimeout(() => {
 console.log(
 " Fallback timer: Checking if stream needs manual attach",
 );
 if (sessionRef.current && videoRef.current) {
 // Check if video element already has a stream
 if (!videoRef.current.srcObject) {
 console.log(
 " Stream events didn't fire - forcing manual attach as fallback",
 );
 attachStream();
 } else {
 console.log("[OK]  Stream already attached - fallback not needed");
 }
 }
 }, 3000);
 } catch (err) {
 console.error("[ERROR]  LiveAvatar initialization error:", err);
 setError(err.message);
 }
 };

 const sendAudioToAvatar = (buffer) => {
 try {
 if (!sessionRef.current) {
 console.warn("[WARN]  No active session - cannot send audio");
 return;
 }

 lastSentAudioRef.current = buffer;
 const totalBytes = buffer.byteLength;
 console.log("[SEND]  Sending audio to LiveAvatar, size:", totalBytes);

 // Split at silence boundaries (sentence pauses) so chunk transitions
 // never fall mid-word. Falls back to a hard split at CHUNK_MAX_BYTES
 // only when no silence is found in the search window.
 // Each chunk base64-encodes to ≤640 KB, safely under HeyGen's 1 MB WS limit.
 const chunks = splitPCMAtSilence(buffer, CHUNK_MAX_BYTES);
 console.log(`[CHUNK] Audio: ${totalBytes} bytes, ${chunks.length} chunk(s)`);

 // Strategy: send the first 2 chunks immediately so HeyGen always has
 // a buffered item when the first one starts playing. Remaining chunks
 // are sent one-at-a-time on SPEAK_ENDED (not SPEAK_STARTED) so HeyGen
 // gets the next chunk as soon as the previous one finishes, keeping its
 // internal queue from ever going empty and preventing premature close.
 const prefill = Math.min(2, chunks.length);
 audioChunkQueueRef.current = chunks.slice(prefill);
 pendingChunkCountRef.current = prefill;
 for (let i = 0; i < prefill; i++) {
 const base64 = arrayBufferToBase64(chunks[i]);
 sessionRef.current.repeatAudio(base64);
 console.log(`[CHUNK] Pre-sent chunk ${i + 1}/${chunks.length}, ${audioChunkQueueRef.current.length} remaining`);
 }

 } catch (err) {
 console.error("[ERROR]  Error sending audio:", err);
 setError(err.message);
 }
 };

 const arrayBufferToBase64 = (buffer) => {
 const bytes = new Uint8Array(buffer);
 let binary = "";
 for (let i = 0; i < bytes.byteLength; i++) {
 binary += String.fromCharCode(bytes[i]);
 }
 return btoa(binary);
 };

 const handleRetry = () => {
 setError(null);
 initializeSession();
 };

 return (
 <div style={styles.container}>
 {needsUserGesture && (
 <div style={styles.startOverlay}>
 <button onClick={handleStartSession} style={styles.startButton}>
 Start Avatar Session
 </button>
 <p style={styles.startHint}>Click to enable audio playback</p>
 </div>
 )}

 {error && (
 <div style={styles.errorOverlay}>
 <div style={styles.errorBox}>
 <span style={styles.errorIcon}>!</span>
 <p style={styles.errorText}>{error}</p>
 <button onClick={handleRetry} style={styles.retryButton}>
 Retry
 </button>
 </div>
 </div>
 )}

 {!needsUserGesture && sessionState === SessionState.CONNECTING && (
 <div style={styles.loadingOverlay}>
 <div style={styles.spinner}></div>
 <p style={styles.loadingText}>Connecting to LiveAvatar...</p>
 </div>
 )}

 {!needsUserGesture && !isStreamReady && sessionState === SessionState.CONNECTED && (
 <div style={styles.loadingOverlay}>
 <div style={styles.spinner}></div>
 <p style={styles.loadingText}>Loading video stream...</p>
 </div>
 )}


 <video
 ref={videoRef}
 autoPlay
 playsInline
 muted={false}
 style={{
 ...styles.video,
 opacity: isStreamReady ? 1 : 0.3,
 }}
 />

 </div>
 );
}

const styles = {
 startOverlay: {
 position: "absolute",
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 backgroundColor: "rgba(0, 0, 0, 0.85)",
 display: "flex",
 flexDirection: "column",
 alignItems: "center",
 justifyContent: "center",
 zIndex: 25,
 },
 startButton: {
 backgroundColor: hpeTheme.brand.green,
 color: "white",
 border: "none",
 padding: "16px 40px",
 borderRadius: "8px",
 cursor: "pointer",
 fontSize: "18px",
 fontWeight: "600",
 },
 startHint: {
 color: "#aaa",
 fontSize: "13px",
 marginTop: "12px",
 },
 container: {
 position: "relative",
 width: "100%",
 height: "100%",
 backgroundColor: "#000",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 overflow: "hidden",
 },
 video: {
 width: "100%",
 height: "100%",
 objectFit: "contain",
 transition: "opacity 0.3s ease",
 },
 loadingOverlay: {
 position: "absolute",
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 backgroundColor: "rgba(0, 0, 0, 0.7)",
 display: "flex",
 flexDirection: "column",
 alignItems: "center",
 justifyContent: "center",
 zIndex: 10,
 },
 processingOverlay: {
 position: "absolute",
 top: "20px",
 right: "20px",
 backgroundColor: "rgba(0, 0, 0, 0.8)",
 padding: "12px 20px",
 borderRadius: "8px",
 display: "flex",
 alignItems: "center",
 gap: "12px",
 zIndex: 15,
 },
 errorOverlay: {
 position: "absolute",
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 backgroundColor: "rgba(0, 0, 0, 0.85)",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 zIndex: 20,
 },
 errorBox: {
 backgroundColor: "white",
 padding: "32px",
 borderRadius: "12px",
 textAlign: "center",
 maxWidth: "400px",
 },
 errorIcon: {
 fontSize: "48px",
 display: "block",
 marginBottom: "16px",
 },
 errorText: {
 color: hpeTheme.status.critical,
 fontSize: "16px",
 marginBottom: "20px",
 },
 retryButton: {
 backgroundColor: hpeTheme.brand.green,
 color: "white",
 border: "none",
 padding: "10px 24px",
 borderRadius: "6px",
 cursor: "pointer",
 fontSize: "14px",
 fontWeight: "500",
 },
 spinner: {
 width: "40px",
 height: "40px",
 border: `4px solid ${hpeTheme.border.weak}`,
 borderTop: `4px solid ${hpeTheme.brand.green}`,
 borderRadius: "50%",
 animation: "spin 1s linear infinite",
 },
 loadingText: {
 color: "white",
 marginTop: "16px",
 fontSize: "16px",
 },
 processingText: {
 color: "white",
 fontSize: "14px",
 margin: 0,
 },
 talkingIndicator: {
 position: "absolute",
 bottom: "60px",
 left: "50%",
 transform: "translateX(-50%)",
 backgroundColor: "rgba(1, 169, 130, 0.9)",
 padding: "8px 16px",
 borderRadius: "20px",
 display: "flex",
 alignItems: "center",
 gap: "8px",
 zIndex: 12,
 },
 talkingDot: {
 width: "8px",
 height: "8px",
 backgroundColor: "white",
 borderRadius: "50%",
 animation: "pulse 1s ease-in-out infinite",
 },
 talkingText: {
 color: "white",
 fontSize: "13px",
 fontWeight: "500",
 },
 statusBar: {
 position: "absolute",
 bottom: "16px",
 left: "16px",
 backgroundColor: "rgba(0, 0, 0, 0.6)",
 padding: "8px 12px",
 borderRadius: "6px",
 zIndex: 11,
 },
 statusItem: {
 display: "flex",
 alignItems: "center",
 },
 statusText: {
 color: "white",
 fontSize: "12px",
 },
};

// Add CSS animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
 @keyframes spin {
 0% { transform: rotate(0deg); }
 100% { transform: rotate(360deg); }
 }
 @keyframes pulse {
 0%, 100% { opacity: 1; }
 50% { opacity: 0.5; }
 }
`;
document.head.appendChild(styleSheet);
