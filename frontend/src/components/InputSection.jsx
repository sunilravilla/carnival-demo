import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send } from 'lucide-react';
import hpeTheme from '../styles/hpeTheme';

const C = { red: '#B61B38', blue: '#014E8F', gold: '#FFC72C' };

/**
 * InputSection - Unified input bar with gradient border, text input + mic + send
 */
export default function InputSection({
  onVoiceRecordingComplete,
  onTextSubmit,
  onMicrophoneError,
  onRecordingStart,
  isProcessing,
  placeholder,
  gradient,
  buttonGradient,
}) {
  const [textValue, setTextValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const textInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textValue.trim() && !isProcessing && !isRecording) {
      onTextSubmit(textValue.trim());
      setTextValue('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit(e);
    }
  };

  // Voice recording
  const startRecording = async () => {
    onRecordingStart?.();   // stop any playing audio immediately
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
          animationRef.current = requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        cancelAnimationFrame(animationRef.current);
        setAudioLevel(0);
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) onVoiceRecordingComplete(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      onMicrophoneError?.();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const canSend = textValue.trim() && !isProcessing && !isRecording;

  return (
    <div style={styles.wrapper}>
      {/* Gradient border container — overridable via `gradient` prop for branding */}
      <div
        style={{
          ...styles.gradientBorder,
          ...(gradient ? { background: gradient, boxShadow: '0 0 20px rgba(182, 27, 56, 0.18), 0 0 40px rgba(1, 78, 143, 0.10)' } : {}),
          ...(isRecording ? styles.gradientBorderRecording : {}),
        }}
      >
        <div style={styles.innerBar}>
          {/* Recording waveform overlay */}
          {isRecording && (
            <div style={styles.recordingOverlay}>
              <div style={styles.waveContainer}>
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.waveBar,
                      height: `${12 + audioLevel * 20 * (1 + Math.sin(Date.now() / 200 + i))}px`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
              <span style={styles.recordingText}>Listening...</span>
            </div>
          )}

          {/* Text input */}
          <input
            ref={textInputRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording
                ? ''
                : placeholder ||
                  'Ask about HPE AI Factory... / Pregunta sobre HPE AI Factory...'
            }
            disabled={isProcessing || isRecording}
            style={{
              ...styles.textInput,
              ...(isRecording ? styles.textInputHidden : {}),
            }}
            className="aria-input-field"
          />

          {/* Right side action buttons */}
          <div style={styles.actions}>
            {/* Mic button */}
            <button
              onClick={toggleRecording}
              disabled={isProcessing}
              style={{
                ...styles.micButton,
                ...(isRecording ? styles.micButtonRecording : {}),
                ...(isProcessing ? styles.buttonDisabled : {}),
              }}
              title={isRecording ? 'Stop recording' : 'Start voice input'}
            >
              {isRecording ? <Square size={20} /> : <Mic size={22} />}
            </button>

            {/* Send button */}
            <button
              onClick={handleTextSubmit}
              disabled={!canSend}
              style={{
                ...styles.sendButton,
                ...(canSend ? styles.sendButtonActive : {}),
                ...(canSend && buttonGradient
                  ? { background: buttonGradient, boxShadow: '0 4px 14px rgba(182, 27, 56, 0.30)' }
                  : {}),
              }}
              title="Send message"
            >
              {isProcessing ? <LoadingSpinner /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return <div style={spinnerStyle} />;
}

const spinnerStyle = {
  width: '18px',
  height: '18px',
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: 'white',
  borderRadius: '50%',
  animation: 'aria-spin 0.8s linear infinite',
};

const styles = {
  wrapper: {
    padding: '4px 0',
  },
  gradientBorder: {
    position: 'relative',
    padding: '2px',
    borderRadius: '28px',
    background: `linear-gradient(90deg, ${C.red}, ${C.blue}, ${C.gold})`,
    boxShadow: `0 0 20px rgba(182, 27, 56, 0.15), 0 0 40px rgba(1, 78, 143, 0.08)`,
    transition: 'box-shadow 0.3s ease',
  },
  gradientBorderRecording: {
    background: `linear-gradient(90deg, ${C.red}, #c9392b, ${C.red})`,
    backgroundSize: '200% 100%',
    animation: 'aria-gradient-shift 2s linear infinite',
    boxShadow: `0 0 24px rgba(182, 27, 56, 0.4), 0 0 48px rgba(182, 27, 56, 0.15)`,
  },
  innerBar: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: '26px',
    padding: '6px 8px 6px 20px',
    minHeight: '56px',
  },
  recordingOverlay: {
    position: 'absolute',
    left: '20px',
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: 1,
  },
  waveContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    height: '32px',
  },
  waveBar: {
    width: '4px',
    backgroundColor: C.red,
    borderRadius: '2px',
    transition: 'height 0.15s ease',
    minHeight: '8px',
  },
  recordingText: {
    fontSize: '16px',
    color: C.red,
    fontWeight: '500',
    fontFamily: hpeTheme.typography.fontFamily,
  },
  textInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontFamily: hpeTheme.typography.fontFamily,
    fontSize: '16px', // prevents iOS auto-zoom on focus
    color: hpeTheme.text.strong,
    padding: '8px 0',
    lineHeight: '1.4',
  },
  textInputHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    marginLeft: '8px',
  },
  micButton: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    color: hpeTheme.text.weak,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  micButtonRecording: {
    backgroundColor: C.red,
    color: 'white',
    boxShadow: `0 0 16px rgba(182, 27, 56, 0.45)`,
    animation: 'aria-pulse 1.5s ease-in-out infinite',
  },
  sendButton: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#e8edf2',
    color: '#9aabb8',
    cursor: 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  sendButtonActive: {
    background: `linear-gradient(135deg, ${C.red} 0%, ${C.blue} 100%)`,
    color: 'white',
    cursor: 'pointer',
    boxShadow: `0 4px 14px rgba(182, 27, 56, 0.35)`,
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

// Keyframes
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes aria-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes aria-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }
  @keyframes aria-gradient-shift {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  .aria-input-field::placeholder {
    color: ${hpeTheme.text.xweak};
  }
  .aria-input-field:disabled::placeholder {
    color: ${hpeTheme.text.xweak};
  }
`;
if (!document.querySelector('#aria-input-styles')) {
  styleSheet.id = 'aria-input-styles';
  document.head.appendChild(styleSheet);
}
