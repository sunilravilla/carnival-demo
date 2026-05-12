// Claude-Code-style cycling status while the agent runs a tool.
// Typewriter-cycles through cruise-themed status phrases with a pulsing icon
// and three bouncing dots. Inspired by the Eli-Lilly thinking-indicator
// pattern, but native React (we own the DOM, no CopilotKit injection needed).
import { useEffect, useRef, useState } from "react";
import { activeTheme as theme } from "../../styles/branding";

const THINKING_PHRASES = [
  "Looking that up",
  "Checking the schedule",
  "Pulling up your folio",
  "Confirming the details",
  "Just a sec",
  "Almost there",
  "Polishing the answer",
  "On it",
  "Reading the dining map",
  "Tuning Marina's voice",
];

const TYPE_SPEED = 38;     // ms per typed character
const PAUSE_AFTER = 1100;  // ms to hold a fully-typed phrase
const ERASE_SPEED = 16;    // ms per erased character
const NEXT_DELAY = 90;     // ms before the next phrase starts

export default function ThinkingBubble() {
  const [display, setDisplay] = useState("");
  const wordIdxRef = useRef(Math.floor(Math.random() * THINKING_PHRASES.length));

  useEffect(() => {
    _ensureKeyframes();
    let charIdx = 0;
    let erasing = false;
    let timeoutId;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const word = THINKING_PHRASES[wordIdxRef.current];
      if (!erasing) {
        charIdx++;
        if (charIdx <= word.length) {
          setDisplay(word.slice(0, charIdx));
          timeoutId = setTimeout(tick, TYPE_SPEED);
        } else {
          erasing = true;
          timeoutId = setTimeout(tick, PAUSE_AFTER);
        }
      } else {
        charIdx--;
        if (charIdx >= 0) {
          setDisplay(word.slice(0, charIdx));
          timeoutId = setTimeout(tick, ERASE_SPEED);
        } else {
          wordIdxRef.current = (wordIdxRef.current + 1) % THINKING_PHRASES.length;
          charIdx = 0;
          erasing = false;
          timeoutId = setTimeout(tick, NEXT_DELAY);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div style={styles.wrap} aria-live="polite" aria-label="Marina is thinking">
      <span style={styles.icon}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      </span>
      <span style={styles.text}>{display}</span>
      <span style={styles.dots}>
        <span style={{ ...styles.dot, animationDelay: "0s" }}>.</span>
        <span style={{ ...styles.dot, animationDelay: "0.18s" }}>.</span>
        <span style={{ ...styles.dot, animationDelay: "0.36s" }}>.</span>
      </span>
    </div>
  );
}

const styles = {
  wrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "white",
    fontStyle: "italic",
    minHeight: "1.4em",
  },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.brand.sun || "#FFC72C",
    animation: "concierge-thinking-pulse 1.4s ease-in-out infinite",
  },
  text: {
    opacity: 0.96,
    minWidth: 1,        // keep height stable when text is empty
  },
  dots: {
    display: "inline-flex",
    gap: 1,
    fontWeight: 700,
  },
  dot: {
    animation: "concierge-thinking-bounce 1.2s ease-in-out infinite",
    display: "inline-block",
  },
};

function _ensureKeyframes() {
  if (document.querySelector("#concierge-thinking-keyframes")) return;
  const sheet = document.createElement("style");
  sheet.id = "concierge-thinking-keyframes";
  sheet.textContent = `
    @keyframes concierge-thinking-pulse {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.15); opacity: 1; }
    }
    @keyframes concierge-thinking-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-3px); opacity: 1; }
    }
  `;
  document.head.appendChild(sheet);
}
