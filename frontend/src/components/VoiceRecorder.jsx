import { useState, useRef } from "react";
import hpeTheme from "../styles/hpeTheme";

export default function VoiceRecorder({
  onRecordingComplete,
  isProcessing,
  onMicrophoneError,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [micAvailable, setMicAvailable] = useState(true);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Microphone access not supported in this browser/environment"
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/wav" });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        onRecordingComplete(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setMicAvailable(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setMicAvailable(false);

      // If microphone is not available, trigger fallback behavior
      if (onMicrophoneError) {
        console.log("📝 Microphone unavailable - using fallback mode");
        onMicrophoneError();
      } else {
        alert("Microphone not available. Using fallback text mode instead.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Recording Button */}
      <div style={styles.buttonContainer}>
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            style={{
              ...styles.recordBtn,
              ...(isProcessing && styles.recordBtnDisabled),
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) {
                e.target.style.backgroundColor = hpeTheme.dark.green;
                e.target.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isProcessing) {
                e.target.style.backgroundColor = hpeTheme.brand.green;
                e.target.style.transform = "scale(1)";
              }
            }}
          >
            <span style={styles.icon}>🎤</span>
            <span>Start Voice</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={styles.stopBtn}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#a2423d";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = hpeTheme.status.critical;
              e.target.style.transform = "scale(1)";
            }}
          >
            <span style={styles.icon}>⏹</span>
            <span>Stop Voice</span>
          </button>
        )}
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div style={styles.recordingIndicator}>
          <span style={styles.pulse}>●</span>
          <span>Listening...</span>
        </div>
      )}

      {/* Last Recording Playback */}
      {audioURL && !isRecording && !isProcessing && (
        <div style={styles.playbackContainer}>
          <p style={styles.playbackLabel}>Last recording:</p>
          <audio src={audioURL} controls style={styles.audioPlayer} />
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: hpeTheme.spacing.md,
  },
  buttonContainer: {
    display: "flex",
    justifyContent: "center",
  },
  recordBtn: {
    backgroundColor: hpeTheme.brand.green,
    color: "white",
    border: "none",
    padding: `${hpeTheme.spacing.md} ${hpeTheme.spacing.xl}`,
    borderRadius: hpeTheme.borderRadius.md,
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: hpeTheme.spacing.sm,
    boxShadow: hpeTheme.elevation.medium,
    transition: hpeTheme.transitions.fast,
    minWidth: "200px",
    justifyContent: "center",
  },
  recordBtnDisabled: {
    backgroundColor: hpeTheme.text.weak,
    cursor: "not-allowed",
    opacity: 0.6,
  },
  stopBtn: {
    backgroundColor: hpeTheme.status.critical,
    color: "white",
    border: "none",
    padding: `${hpeTheme.spacing.md} ${hpeTheme.spacing.xl}`,
    borderRadius: hpeTheme.borderRadius.md,
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: hpeTheme.spacing.sm,
    boxShadow: hpeTheme.elevation.medium,
    transition: hpeTheme.transitions.fast,
    minWidth: "200px",
    justifyContent: "center",
  },
  icon: {
    fontSize: hpeTheme.typography.fontSizes.xl,
  },
  recordingIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: hpeTheme.spacing.sm,
    padding: hpeTheme.spacing.sm,
    backgroundColor: "rgba(236, 51, 49, 0.1)",
    borderRadius: hpeTheme.borderRadius.sm,
    color: hpeTheme.status.critical,
    fontSize: hpeTheme.typography.fontSizes.md,
    fontWeight: hpeTheme.typography.fontWeights.medium,
  },
  pulse: {
    fontSize: hpeTheme.typography.fontSizes.lg,
    animation: "pulse 1.5s ease-in-out infinite",
  },
  playbackContainer: {
    padding: hpeTheme.spacing.md,
    backgroundColor: hpeTheme.background.back,
    borderRadius: hpeTheme.borderRadius.md,
    border: `1px solid ${hpeTheme.border.weak}`,
  },
  playbackLabel: {
    margin: `0 0 ${hpeTheme.spacing.sm} 0`,
    fontSize: hpeTheme.typography.fontSizes.sm,
    color: hpeTheme.text.weak,
    fontWeight: hpeTheme.typography.fontWeights.medium,
  },
  audioPlayer: {
    width: "100%",
  },
};

// Add keyframe animation for pulse
const styleSheet = document.styleSheets[0];
try {
  styleSheet.insertRule(
    `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `,
    styleSheet.cssRules.length
  );
} catch (e) {
  // Ignore if already exists
}
