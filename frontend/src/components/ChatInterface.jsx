import { useState, useRef, useEffect, useContext } from "react";
import { flushSync } from "react-dom";
import InputSection from "./InputSection";
import AudioPlayer from "./AudioPlayer";
import ConciergeCard from "./concierge/ConciergeCards";
import ThinkingBubble from "./concierge/ThinkingBubble";
import { useCarnivalCopilotKitBridge } from "./concierge/CopilotKitBridge";
import {
  transcribeAudio,
  generateAgentResponseElevenLabs,
  generateAgentResponseStream,
  generate2DResponseElevenLabs,
} from "../services/api";
import { activeTheme as theme, branding, isCarnival, isVirgin } from "../styles/branding";
import { Menu, Settings, Trash2, Volume2, User, X } from "lucide-react";
import GuestContext from "../context/GuestContext";

// ─── Colours ────────────────────────────────────────────────────────────────
const C = {
  red:    "#B61B38",
  blue:   "#014E8F",
  gold:   "#FFC72C",
  cream:  "#F7F4F0",
  navy:   "#0D1B2A",
  white:  "#FFFFFF",
  muted:  "#6B7280",
  border: "#E5E0D8",
};

const generateUUID = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

// ─── Markdown → HTML (bot bubble only — content is LLM-controlled, not user input) ─
const mdToHtml = (text) =>
  (text || "")
    .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/gs, "<em>$1</em>")
    .replace(/\n/g, "<br/>");

// ─── Language detection (text-based, first 8 words) ─────────────────────────
const SPANISH_WORDS = new Set([
  "qué","que","cómo","como","cuál","cual","dónde","donde","cuándo","cuando",
  "quién","quien","cuánto","cuanto","el","la","los","las","un","una","de","del",
  "al","en","con","por","para","sin","sobre","entre","a","y","o","es","soy",
  "estoy","tengo","hay","puedo","quiero","necesito","hola","buenos","buenas",
  "gracias","claro","sí","bueno","bien",
]);

const detectLang = (text) => {
  const accent = /[áéíóúñü]/i;
  const words = text.trim().split(/\s+/).slice(0, 8);
  let votes = 0, total = words.length;
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-záéíóúñü]/gi, "");
    if (!w) { total--; continue; }
    if (accent.test(w)) { votes += 2; total++; }
    else if (SPANISH_WORDS.has(w)) votes += 1;
  }
  return total > 0 && votes / total >= 0.35 ? "es" : "en";
};

// ─── Quick-action chips (per-brand, configured in branding.js) ─────────────
const CHIPS = branding.quickChips || [
  { icon: "💳", label: "What have I spent so far?" },
  { icon: "📅", label: "Show my reservations" },
];

// ─── Inject keyframes once ───────────────────────────────────────────────────
function ensureKeyframes() {
  if (document.getElementById("carnival-ui-keyframes")) return;
  const s = document.createElement("style");
  s.id = "carnival-ui-keyframes";
  s.textContent = `
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes speakingPulse {
      0%, 100% { opacity: 0.6; }
      50%      { opacity: 1; }
    }
    @keyframes onlinePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      50%      { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
    }
    @keyframes chipHover {
      from { transform: scale(1); }
      to   { transform: scale(1.03); }
    }
    @keyframes folio-pop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.22); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(s);
}

// ─── Confirmation chime ───────────────────────────────────────────────────────
const CHIME_CARD_TYPES = new Set(["dining", "show", "spa_booking", "drink_package", "excursion", "weather"]);

function playConfirmChime(cardPayload) {
  if (!cardPayload) return;
  const cards = Array.isArray(cardPayload) ? cardPayload : [cardPayload];
  const hasBooking = cards.some(c => CHIME_CARD_TYPES.has(c?.card));
  if (!hasBooking) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[523, 0], [659, 0.14]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.45);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.45);
    });
  } catch (_) { /* AudioContext not available */ }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MarinaAvatar({ size = 36, speaking = false }) {
  // Photo-real concierge avatar. The same Marina sprite is shared across
  // brands — same face, different voice/persona per brand. A dedicated photo
  // can be dropped into /avatars/ later and we'll switch the src.
  return (
    <img
      src="/avatars/marina-real/marina_01_closed.png"
      alt={branding.avatarName}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        objectPosition: "center 5%",
        border: `2px solid ${speaking ? C.gold : C.red}`,
        flexShrink: 0,
        boxShadow: speaking
          ? `0 0 0 3px rgba(212,168,98,0.35)`
          : `0 2px 8px rgba(0,0,0,0.18)`,
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    />
  );
}

function UserAvatar() {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      background: `linear-gradient(135deg, ${C.blue} 0%, #0369a1 100%)`,
      color: C.white,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    }}>
      <User size={18} />
    </div>
  );
}

function LangBadge({ lang, inHeader = false }) {
  if (!lang || lang === "en") return null;
  const labels = { es:"ES 🇪🇸", fr:"FR 🇫🇷", de:"DE 🇩🇪", it:"IT 🇮🇹", ja:"JA 🇯🇵", zh:"ZH 🇨🇳", ar:"AR 🇸🇦" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999,
      background: inHeader ? "rgba(255,255,255,0.2)" : "rgba(255,199,44,0.15)",
      border: `1px solid ${inHeader ? "rgba(255,255,255,0.4)" : C.gold}`,
      color: inHeader ? C.white : "#92400e",
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {labels[lang] || lang.toUpperCase()}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChatInterface({
  onAdminClick,
  isCheckingAuth,
  // Panel mode props
  panelMode = false,
  panelOpen = true,
  onClose,
  prefilledMessage,
  onMessageUsed,
}) {
  const guestCtx = useContext(GuestContext);

  const [conversation, setConversation] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [language, setLanguage] = useState(branding.defaultLanguage || "en");
  const [detectedLang, setDetectedLang] = useState(null);
  const [error, setError] = useState("");
  const [currentAudio, setCurrentAudio] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [folioBalance, setFolioBalance] = useState(null);
  const folioPrevRef = useRef(null);

  const conversationUuidRef = useRef(generateUUID());
  const messageHistoryRef = useRef([]);
  const messagesEndRef = useRef(null);
  const audioElemRef = useRef(null);
  const streamTextRef = useRef("");
  const prefilledUsedRef = useRef("");

  const stopCurrentAudio = () => {
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setCurrentAudio(null);
  };

  useEffect(() => { ensureKeyframes(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation]);

  // Stop audio immediately when panel is closed
  useEffect(() => {
    if (panelMode && !panelOpen) {
      stopCurrentAudio();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  // Register clearConversation with GuestContext so clearGuest() can reset chat
  useEffect(() => {
    if (guestCtx?.clearChatRef) {
      guestCtx.clearChatRef.current = clearConversation;
    }
    return () => {
      if (guestCtx?.clearChatRef) guestCtx.clearChatRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestCtx]);

  // Auto-submit prefilled message from QuickActions / cancel flow
  useEffect(() => {
    if (!prefilledMessage || prefilledMessage === prefilledUsedRef.current || isProcessing) return;
    prefilledUsedRef.current = prefilledMessage;
    onMessageUsed?.();
    handleTextSubmit(prefilledMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledMessage]);

  // CopilotKit bridge (opt-in, off by default)
  const copilotKitOn = isCarnival && branding.useCopilotKit;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const copilotBridge = copilotKitOn
    ? useCarnivalCopilotKitBridge({ language, computeVisemes: false })
    : null;

  const _run2DPipeline = async (opts = {}) => {
    if (copilotBridge) {
      const last = messageHistoryRef.current.slice().reverse().find(m => m.role === "user");
      return copilotBridge.runViaCopilot({ userText: last?.content });
    }
    if (branding.useAgentEndpoint) {
      return generateAgentResponseElevenLabs(
        conversationUuidRef.current,
        messageHistoryRef.current,
        { language, computeVisemes: false, ...opts },
      );
    }
    return generate2DResponseElevenLabs(
      conversationUuidRef.current,
      messageHistoryRef.current,
    );
  };

  const _applyLang = (detectedCode) => {
    if (detectedCode && detectedCode !== "en") {
      setDetectedLang(detectedCode);
      setLanguage(detectedCode);
    } else {
      setDetectedLang(null);
      setLanguage("en");
    }
  };

  const _handleResponse = async (userText, msgIndex, timestamp) => {
    // Use SSE streaming for any brand using the cruise concierge agent (Carnival, Virgin).
    if (branding.useAgentEndpoint && !copilotKitOn) {
      streamTextRef.current = "";
      try {
        await generateAgentResponseStream(
          conversationUuidRef.current,
          messageHistoryRef.current,
          { language },
          {
            onDelta: (chunk) => {
              streamTextRef.current += chunk;
              // flushSync forces an immediate re-render per chunk so streaming is visible
              flushSync(() => {
                setIsGeneratingResponse(false);
                setConversation(prev => {
                  const u = [...prev];
                  u[msgIndex] = { ...u[msgIndex], bot: streamTextRef.current, timestamp };
                  return u;
                });
              });
            },
            onDone: (event) => {
              const botText = streamTextRef.current || event.bot_text || "";
              messageHistoryRef.current.push({ role: "assistant", content: botText });

              if (event.folio_balance != null && event.folio_balance !== folioPrevRef.current) {
                folioPrevRef.current = event.folio_balance;
                setFolioBalance(event.folio_balance);
              }

              // Sync dashboard widgets
              guestCtx?.applyAgentUpdate(event);

              playConfirmChime(event.card_payload);

              setConversation(prev => {
                const u = [...prev];
                u[msgIndex] = {
                  user: userText,
                  bot: botText,
                  card: event.card_payload || null,
                  timestamp,
                  suggestions: event.suggestions || [],
                };
                return u;
              });

              if (event.audio_b64) {
                const audioBytes = Uint8Array.from(atob(event.audio_b64), c => c.charCodeAt(0));
                setCurrentAudio({ audioBuffer: audioBytes.buffer, mime: event.mime || "audio/mpeg" });
                setIsSpeaking(true);
              }
            },
          },
        );
      } catch (e) {
        console.error(e);
        setError("Something went wrong. Please try again.");
      } finally {
        setIsProcessing(false);
        setIsGeneratingResponse(false);
      }
      return;
    }

    // Non-streaming fallback (non-agent brands or CopilotKit path)
    try {
      const response = await _run2DPipeline();
      messageHistoryRef.current.push({ role: "assistant", content: response.bot_text });

      if (response.folio_balance != null && response.folio_balance !== folioPrevRef.current) {
        folioPrevRef.current = response.folio_balance;
        setFolioBalance(response.folio_balance);
      }

      playConfirmChime(response.card_payload);

      setConversation(prev => {
        const u = [...prev];
        u[msgIndex] = {
          user: userText,
          bot: response.bot_text,
          card: response.card_payload || null,
          timestamp,
          suggestions: response.suggestions || [],
        };
        return u;
      });
      if (response.audio) {
        setCurrentAudio({ audioBuffer: response.audio, mime: response.mime || "audio/mpeg" });
        setIsSpeaking(true);
      }
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
      setIsGeneratingResponse(false);
    }
  };

  const handleRecordingComplete = async (audioBlob) => {
    setIsProcessing(true);
    setError("");
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msgIndex = conversation.length;

    try {
      const result = await transcribeAudio(audioBlob);
      const text = result.text;
      if (!text) { setIsProcessing(false); return; }

      // Use language detected by ElevenLabs Scribe (backend) if available
      _applyLang(result.detected_language || detectLang(text));

      setIsGeneratingResponse(true);
      setConversation(prev => [...prev, { user: text, bot: null, timestamp }]);
      messageHistoryRef.current.push({ role: "user", content: text });
      await _handleResponse(text, msgIndex, timestamp);
    } catch (e) {
      console.error(e);
      setError("Could not transcribe audio. Please try again.");
      setIsProcessing(false);
      setIsGeneratingResponse(false);
    }
  };

  const handleTextSubmit = async (text) => {
    stopCurrentAudio();
    setIsProcessing(true);
    setError("");
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msgIndex = conversation.length;

    _applyLang(detectLang(text));
    setIsGeneratingResponse(true);
    setConversation(prev => [...prev, { user: text, bot: null, timestamp }]);
    messageHistoryRef.current.push({ role: "user", content: text });
    await _handleResponse(text, msgIndex, timestamp);
  };

  const handleChipClick = (chipLabel) => {
    if (!isProcessing) handleTextSubmit(chipLabel);
  };

  const handleCardAction = (action) => {
    if (isProcessing) return;
    // Cards may emit either a structured object (e.g. cancel intent) or a
    // plain string prompt to send back to Marina (drink-package picker, squad
    // swap modal, outfit suggestion, etc.).
    if (typeof action === "string") {
      handleTextSubmit(action);
      return;
    }
    if (action && action.type === "cancel") {
      handleTextSubmit(`Cancel my ${action.name} reservation`);
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setCurrentAudio(null);
    setIsSpeaking(false);
    setDetectedLang(null);
    setLanguage("en");
    setError("");
    conversationUuidRef.current = generateUUID();
    messageHistoryRef.current = [];
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.root, height: panelMode ? '100%' : '100dvh' }}>
      {/* Hidden audio player */}
      <AudioPlayer
        audioBuffer={currentAudio?.audioBuffer}
        mime={currentAudio?.mime}
        onEnded={() => setIsSpeaking(false)}
        audioElemRef={audioElemRef}
      />

      {/* ── Fixed Header ────────────────────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.headerLeft}>
            {isVirgin ? (
              <div style={{ height: 28, background: '#fff', borderRadius: 5, padding: '3px 7px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', flexShrink: 0 }}>
                <img src={branding.logo || "/virgin-logo.jpg"} alt={branding.logoText} style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
              </div>
            ) : (
              <img src={branding.logoWhite || "/carnival-logo-white.png"} alt={branding.logoText} style={{ height: 28, width: 'auto', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
            )}
            <div style={s.headerTitle}>{branding.headerTitle}</div>
          </div>
          <div style={s.headerRight}>
            {isSpeaking && (
              <div style={s.speakingPill}>
                <Volume2 size={13} />
                <span>Speaking</span>
              </div>
            )}
            <LangBadge lang={detectedLang} inHeader />
            {panelMode ? (
              <button style={s.iconBtn} onClick={onClose} title="Close">
                <X size={20} />
              </button>
            ) : (
              <button
                style={s.iconBtn}
                onClick={() => setMenuOpen(v => !v)}
                title="Menu"
              >
                {isCheckingAuth ? <div style={s.miniSpinner} /> : <Menu size={20} />}
              </button>
            )}
          </div>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div style={s.menuOverlay} onClick={() => setMenuOpen(false)} />
            <div style={s.menuDropdown}>
              {onAdminClick && (
                <div
                  style={{ ...s.menuItem, borderBottom: "1px solid #f0ece6" }}
                  onClick={() => { setMenuOpen(false); onAdminClick(); }}
                >
                  <Settings size={16} color={C.navy} />
                  <span>Admin Settings</span>
                </div>
              )}
              <div
                style={{ ...s.menuItem, color: C.red }}
                onClick={() => { setMenuOpen(false); clearConversation(); }}
              >
                <Trash2 size={16} color={C.red} />
                <span>Clear Chat</span>
              </div>
            </div>
          </>
        )}
      </header>

      {/* ── Scrollable messages ──────────────────────────────────────────── */}
      <main style={s.messages}>
        {conversation.length === 0 && !error ? (
          <div style={s.emptyState}>
            <div style={s.emptyAvatar}>
              <MarinaAvatar size={72} />
              <span style={s.onlineDot} />
            </div>
            <h2 style={s.emptyName}>{branding.avatarName}</h2>
            <p style={s.emptyRole}>{branding.avatarRole}</p>
            <p style={s.emptyHint}>{branding.emptySubtext}</p>
            {/* Quick-action chips */}
            <div style={s.chips}>
              {CHIPS.map(chip => (
                <button
                  key={chip.label}
                  style={{ ...s.chip, ...(isProcessing ? s.chipDisabled : {}) }}
                  onClick={() => handleChipClick(chip.label)}
                  disabled={isProcessing}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          conversation.map((msg, idx) => (
            <div key={idx} style={s.msgPair}>
              {/* User bubble */}
              {msg.user && (
                <div style={s.userRow}>
                  <div style={s.userBubble}>
                    <div style={s.bubbleText}>{msg.user}</div>
                    {msg.timestamp && <div style={s.ts}>{msg.timestamp}</div>}
                  </div>
                  <UserAvatar />
                </div>
              )}

              {/* Bot bubble */}
              <div style={s.botRow}>
                <MarinaAvatar speaking={isSpeaking && idx === conversation.length - 1} />
                <div style={s.botBubble}>
                  {msg.bot == null
                    ? <ThinkingBubble />
                    : <>
                        <div style={s.bubbleText} dangerouslySetInnerHTML={{ __html: mdToHtml(msg.bot) }} />
                        {msg.timestamp && <div style={{ ...s.ts, textAlign: "left" }}>{msg.timestamp}</div>}
                      </>}
                </div>
              </div>

              {/* Concierge card (full width, below bot bubble) */}
              {msg.card && (
                <div style={s.cardWrapper}>
                  <ConciergeCard payload={msg.card} onAction={handleCardAction} />
                </div>
              )}

              {/* Dynamic follow-up suggestion chips */}
              {msg.suggestions?.length > 0 && (
                <div style={s.suggestionRow}>
                  {msg.suggestions.map((s_text, si) => (
                    <button
                      key={si}
                      style={{ ...s.suggestionChip, ...(isProcessing ? s.chipDisabled : {}) }}
                      disabled={isProcessing}
                      onClick={() => {
                        // Dismiss chips on tap
                        setConversation(prev => prev.map((m, i) => i === idx ? { ...m, suggestions: [] } : m));
                        handleTextSubmit(s_text);
                      }}
                    >
                      {s_text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {error && (
          <div style={s.errorMsg}>
            <span style={{ fontWeight: 700 }}>!</span> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* ── Fixed input bar ──────────────────────────────────────────────── */}
      <footer style={s.inputBar}>
        <InputSection
          onVoiceRecordingComplete={handleRecordingComplete}
          onTextSubmit={handleTextSubmit}
          onMicrophoneError={() => {}}
          onRecordingStart={stopCurrentAudio}
          isProcessing={isProcessing}
          placeholder={branding.inputPlaceholder}
          gradient={`linear-gradient(135deg, ${C.gold} 0%, ${C.red} 60%, ${C.blue} 100%)`}
          buttonGradient={`linear-gradient(135deg, ${C.red} 0%, ${C.blue} 100%)`}
        />
        <div style={s.safeArea} />
      </footer>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    backgroundColor: C.cream,
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    overscrollBehavior: "none",
    position: "relative",
  },

  // Header
  header: {
    background: `linear-gradient(135deg, ${C.red} 0%, ${C.blue} 100%)`,
    color: C.white,
    flexShrink: 0,
    paddingTop: "env(safe-area-inset-top, 0px)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
    zIndex: 100,
    position: "relative",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px 12px 16px",
    gap: 12,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  logoChip: {
    backgroundColor: C.white,
    color: C.red,
    padding: "3px 10px",
    borderRadius: 6,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 17,
    lineHeight: 1.2,
    fontFamily: "'Playfair Display', serif",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  folioBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(255,199,44,0.22)",
    border: "1px solid rgba(255,199,44,0.55)",
    color: C.gold,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    animation: "folio-pop 0.35s ease",
    flexShrink: 0,
  },
  speakingPill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.2)",
    border: "1px solid rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: 600,
    animation: "speakingPulse 1.4s ease-in-out infinite",
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 8,
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.3)",
    color: C.white,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0,
  },
  miniSpinner: {
    width: 16, height: 16,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: C.white,
    borderRadius: "50%",
    animation: "aria-spin 0.8s linear infinite",
  },
  menuOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 149,
  },
  menuDropdown: {
    position: "absolute",
    top: "100%",
    right: 16,
    marginTop: 4,
    zIndex: 150,
    background: C.white,
    borderRadius: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    minWidth: 190,
    overflow: "hidden",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    cursor: "pointer",
    fontSize: 15,
    color: C.navy,
    WebkitTapHighlightColor: "transparent",
  },

  // Messages area
  messages: {
    flex: 1,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  // Empty state
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "32px 16px",
    textAlign: "center",
    gap: 8,
  },
  emptyAvatar: {
    position: "relative",
    display: "inline-block",
    marginBottom: 4,
  },
  onlineDot: {
    position: "absolute",
    bottom: 2, right: 2,
    width: 14, height: 14,
    borderRadius: "50%",
    background: "#22c55e",
    border: `2px solid ${C.cream}`,
    animation: "onlinePulse 2.4s ease-in-out infinite",
  },
  emptyName: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: C.navy,
  },
  emptyRole: {
    margin: 0,
    fontSize: 13,
    color: C.muted,
  },
  emptyHint: {
    margin: "4px 0 16px",
    fontSize: 14,
    color: C.muted,
    maxWidth: 280,
    lineHeight: 1.5,
  },
  chips: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    maxWidth: 360,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 16px",
    borderRadius: 14,
    border: `1.5px solid ${C.border}`,
    background: C.white,
    color: C.navy,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    transition: "transform 0.15s, box-shadow 0.15s",
    WebkitTapHighlightColor: "transparent",
  },
  chipDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  // Message pairs
  msgPair: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    animation: "fadeSlideUp 0.25s ease-out",
  },
  userRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    alignSelf: "flex-end",
    maxWidth: "82%",
  },
  userBubble: {
    padding: "10px 14px",
    borderRadius: "18px 18px 4px 18px",
    background: C.blue,
    color: C.white,
    fontSize: 15,
    lineHeight: 1.5,
    boxShadow: "0 2px 12px rgba(1,78,143,0.25)",
  },
  botRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "82%",
  },
  botBubble: {
    padding: "10px 14px",
    borderRadius: "18px 18px 18px 4px",
    background: C.white,
    color: C.navy,
    fontSize: 15,
    lineHeight: 1.5,
    borderLeft: `3px solid ${C.red}`,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  bubbleText: {
    wordBreak: "break-word",
  },
  ts: {
    fontSize: 10,
    opacity: 0.6,
    marginTop: 4,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  cardWrapper: {
    marginLeft: 44,  // aligns with bot bubble (36px avatar + 8px gap)
    marginTop: 4,
  },

  // Suggestion chips (dynamic follow-ups below bot bubble)
  suggestionRow: {
    marginLeft: 44,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  suggestionChip: {
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.red,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
    WebkitTapHighlightColor: "transparent",
  },

  // Error
  errorMsg: {
    padding: "10px 14px",
    borderRadius: 12,
    background: "#FEE2E2",
    color: "#991B1B",
    fontSize: 13,
    display: "flex",
    gap: 6,
    alignItems: "center",
  },

  // Input bar
  inputBar: {
    flexShrink: 0,
    background: C.white,
    borderTop: `1px solid ${C.border}`,
    padding: "8px 16px 0",
    paddingBottom: "env(safe-area-inset-bottom, 8px)",
    boxShadow: "0 -2px 16px rgba(0,0,0,0.07)",
    zIndex: 100,
  },
  safeArea: {
    height: 4,
  },
};
