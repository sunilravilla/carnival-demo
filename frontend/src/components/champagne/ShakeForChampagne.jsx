import { useEffect, useRef, useState, useCallback } from 'react';
import { useGuest } from '../../context/GuestContext';
import { orderChampagne } from '../../services/champagneApi';

// Marenova brand colors (aurora teal, gold, deep sea)
const RED = '#18A0A8';
const RED_DEEP = '#0E7C83';
const GOLD = '#E8B04B';
const INK = '#06283D';
const TOLOPEA = '#0B3D5C';

// Shake detection — magnitude threshold + debounce.
const SHAKE_THRESHOLD = 18;       // m/s^2 net acceleration (gravity-removed approximation)
const SHAKE_COOLDOWN_MS = 2000;

const PERMISSION_KEY = 'vv_shake_permission';
const PERMISSION_PROMPTED_KEY = 'vv_shake_prompted';

function needsIosPermission() {
  return (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function'
  );
}

async function requestMotionPermission() {
  try {
    if (needsIosPermission()) {
      const result = await DeviceMotionEvent.requestPermission();
      sessionStorage.setItem(PERMISSION_KEY, result);
      return result === 'granted';
    }
    sessionStorage.setItem(PERMISSION_KEY, 'granted');
    return true;
  } catch (e) {
    return false;
  }
}

const S = {
  card: {
    margin: '12px 14px 8px',
    padding: '18px 18px 16px',
    borderRadius: 18,
    background: `linear-gradient(135deg, ${TOLOPEA} 0%, ${RED} 100%)`,
    color: '#fff',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 8px 28px rgba(204,0,0,0.25)',
  },
  shimmer: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      'radial-gradient(circle at 80% 10%, rgba(255,255,255,0.18) 0%, transparent 50%)',
  },
  headlineRow: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
  },
  headlineLabel: {
    fontSize: 11, fontWeight: 800, letterSpacing: 2,
    textTransform: 'uppercase', color: GOLD,
  },
  headline: {
    fontSize: 22, fontWeight: 800, lineHeight: 1.15, marginBottom: 4,
  },
  sub: {
    fontSize: 13, opacity: 0.85, marginBottom: 14,
  },
  pressBtn: (pressed) => ({
    background: pressed ? RED_DEEP : '#fff',
    color: pressed ? '#fff' : RED,
    border: 'none',
    borderRadius: 999,
    padding: '12px 22px',
    fontSize: 15, fontWeight: 800,
    letterSpacing: 0.5,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
    transform: pressed ? 'scale(0.97)' : 'scale(1)',
    transition: 'transform 0.12s, background 0.18s, color 0.18s',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  }),
  shakeHint: {
    fontSize: 12, opacity: 0.8, marginTop: 10,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  enableBtn: {
    background: 'transparent',
    color: '#fff', opacity: 0.9,
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 8,
  },
  // Modal
  modalRoot: {
    position: 'fixed', inset: 0, zIndex: 500,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  scrim: {
    position: 'absolute', inset: 0,
    background: 'rgba(10,10,10,0.65)',
    backdropFilter: 'blur(6px)',
  },
  curtain: {
    position: 'absolute', inset: 0,
    background: `linear-gradient(180deg, ${RED} 0%, ${TOLOPEA} 100%)`,
    transformOrigin: 'top',
    animation: 'champagneCurtainIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
  },
  panel: {
    position: 'relative',
    width: '100%', maxWidth: 420,
    background: '#fff',
    borderRadius: 24,
    padding: '28px 22px 24px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
    animation: 'champagnePanelIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both',
  },
  closeX: {
    position: 'absolute', top: 12, right: 14,
    background: 'transparent', border: 'none',
    color: '#999', fontSize: 22, cursor: 'pointer',
    lineHeight: 1, padding: 4,
  },
  bucketWrap: {
    display: 'flex', justifyContent: 'center', marginBottom: 12,
  },
  ph2Title: { fontSize: 22, fontWeight: 800, color: INK, textAlign: 'center', marginBottom: 4, letterSpacing: 0.2 },
  ph2Sub: { fontSize: 14, color: '#4A4A4A', textAlign: 'center', marginBottom: 18 },
  detailGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 8, padding: '12px 14px',
    background: '#FAFAF7', borderRadius: 12, marginBottom: 18,
  },
  detailKey: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  detailVal: { fontSize: 14, color: INK, fontWeight: 600 },
  actionsRow: { display: 'flex', gap: 10 },
  primaryAction: (pressed) => ({
    flex: 1,
    background: pressed ? RED_DEEP : RED,
    color: '#fff', border: 'none',
    borderRadius: 999, padding: '14px 18px',
    fontSize: 15, fontWeight: 800, letterSpacing: 0.5,
    cursor: 'pointer',
    transform: pressed ? 'scale(0.98)' : 'scale(1)',
    transition: 'transform 0.12s, background 0.18s',
  }),
  secondaryAction: {
    background: 'transparent',
    color: '#666', border: '1px solid #E0E0E0',
    borderRadius: 999, padding: '14px 18px',
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  // Tracker
  trackerWrap: { padding: '4px 4px 0' },
  etaRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6,
    marginBottom: 4,
  },
  etaNum: { fontSize: 44, fontWeight: 900, color: RED, fontVariantNumeric: 'tabular-nums' },
  etaLabel: { fontSize: 14, color: '#666' },
  etaCaption: { textAlign: 'center', fontSize: 13, color: '#4A4A4A', marginBottom: 16 },
  shipFrame: {
    background: '#F2EEE7',
    borderRadius: 14,
    padding: '14px 12px 10px',
    marginBottom: 16,
  },
  arrivedTitle: {
    fontSize: 22, fontWeight: 800, color: RED, textAlign: 'center', marginBottom: 6,
  },
  arrivedSub: {
    fontSize: 14, color: '#4A4A4A', textAlign: 'center', marginBottom: 4,
  },
  confLine: {
    textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 18,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
};

// ─── Animated SVG bucket ─────────────────────────────────────────────────────
function ChampagneBucket({ size = 96, popping = false }) {
  // A gelato sundae — Marenova's "Shake for a Treat" hero visual.
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="bucketGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3FB6C4" />
          <stop offset="1" stopColor="#0B3D5C" />
        </linearGradient>
      </defs>
      {/* Scoops (pop on arrival) */}
      <g style={popping ? { transformOrigin: '60px 50px', animation: 'bottlePop 0.6s ease-out' } : {}}>
        <circle cx="48" cy="50" r="15" fill="#F7C8D6" />
        <circle cx="72" cy="50" r="15" fill="#F3CE86" />
        <circle cx="60" cy="40" r="15" fill="#FFFFFF" />
        {/* Cherry */}
        <circle cx="60" cy="26" r="5" fill="#E0556B" />
        <path d="M60 22 Q66 14 72 16" stroke="#0E7C83" strokeWidth="2" fill="none" />
      </g>
      {/* Sparkles */}
      <circle cx="34" cy="40" r="2.5" fill={GOLD} opacity="0.9" />
      <circle cx="88" cy="38" r="2" fill={GOLD} opacity="0.7" />
      <circle cx="40" cy="30" r="1.6" fill="#fff" opacity="0.8" />
      {/* Sundae cup */}
      <path d="M40 62 L80 62 L72 110 L48 110 Z" fill="url(#bucketGradient)" />
      <path d="M40 62 L80 62 L80 68 L40 68 Z" fill="#FFFFFF" opacity="0.20" />
      {/* Cup rim highlight */}
      <path d="M40 62 Q60 56 80 62" stroke={GOLD} strokeWidth="2.5" fill="none" />
    </svg>
  );
}

// ─── Mini ship cross-section tracker ─────────────────────────────────────────
function ShipTracker({ fromDeck = 6, toDeck = 8, progress = 0 }) {
  const decks = [16, 14, 11, 10, 8, 7, 6, 5, 4];
  const rowH = 16;
  const padX = 28;
  const w = 280;
  const h = decks.length * rowH + 8;

  const yFor = (deck) => {
    const idx = decks.indexOf(deck);
    return (idx >= 0 ? idx : decks.length - 1) * rowH + rowH / 2 + 4;
  };

  const fromX = padX;
  const toX = w - padX;
  const dotX = fromX + (toX - fromX) * progress;
  const dotY = yFor(fromDeck) + (yFor(toDeck) - yFor(fromDeck)) * progress;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden>
      {/* Ship outline */}
      <path
        d={`M${padX - 12},${rowH} L${w - padX + 12},${rowH} L${w - padX + 22},${h - 10} L${padX - 22},${h - 10} Z`}
        fill="#fff"
        stroke="#D8D2C8"
        strokeWidth="1"
      />
      {/* Deck lines */}
      {decks.map((d) => (
        <g key={d}>
          <line
            x1={padX - 8} y1={yFor(d)} x2={w - padX + 8} y2={yFor(d)}
            stroke="#E5DFD3" strokeWidth="0.75" strokeDasharray="3 3"
          />
          <text x={padX - 14} y={yFor(d) + 3} fontSize="9" fill="#888" textAnchor="end" fontFamily="ui-monospace, monospace">
            D{d}
          </text>
        </g>
      ))}
      {/* Origin marker (bar) */}
      <circle cx={fromX} cy={yFor(fromDeck)} r="4" fill="#D4A862" />
      <text x={fromX} y={yFor(fromDeck) - 7} fontSize="8" fill="#666" textAnchor="middle">Bar</text>
      {/* Destination marker (cabin) */}
      <circle cx={toX} cy={yFor(toDeck)} r="4" fill="#2E0444" />
      <text x={toX} y={yFor(toDeck) - 7} fontSize="8" fill="#666" textAnchor="middle">You</text>
      {/* Path line so far */}
      <line
        x1={fromX} y1={yFor(fromDeck)} x2={dotX} y2={dotY}
        stroke={RED} strokeWidth="2" strokeLinecap="round"
      />
      {/* Path line remaining */}
      <line
        x1={dotX} y1={dotY} x2={toX} y2={yFor(toDeck)}
        stroke={RED} strokeWidth="1" strokeLinecap="round" strokeDasharray="2 4" opacity="0.45"
      />
      {/* Moving dot */}
      <circle cx={dotX} cy={dotY} r="6" fill={RED}>
        <animate attributeName="r" values="6;8;6" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ShakeForChampagne({ defaultLocation }) {
  const { guestData, applyAgentUpdate } = useGuest();
  const [pressed, setPressed] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Order state persists across modal open/close so "Minimise" doesn't lose
  // the in-flight delivery. Three card states:
  //   no order            → "Press for a Treat" CTA
  //   order + sec > 0     → "Treat en route · M:SS" pill, tap to re-open tracker
  //   order + sec === 0   → "Your treat has arrived" glowing pill, tap to greet
  const [order, setOrder] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [popping, setPopping] = useState(false);

  // Pure UI state for the modal — orthogonal to the order lifecycle.
  const [modalOpen, setModalOpen] = useState(false);
  // 'confirm' | 'tracking' | 'arrived' — what the modal renders when open.
  const [view, setView] = useState('confirm');

  const cooldownRef = useRef(0);
  const lastAccelRef = useRef({ x: 0, y: 0, z: 0 });

  const cabinLabel =
    defaultLocation
    || (guestData ? `Cabin ${guestData.cabin} · Deck ${guestData.deck}` : 'your cabin');

  const hasOrder = !!order;
  const isArrived = hasOrder && secondsLeft <= 0;

  // Inject keyframes once
  useEffect(() => {
    if (document.getElementById('champagne-kf')) return;
    const s = document.createElement('style');
    s.id = 'champagne-kf';
    s.textContent = `
      @keyframes champagneCurtainIn {
        from { transform: scaleY(0); opacity: 0.85; }
        to   { transform: scaleY(0); opacity: 0; }
      }
      @keyframes champagnePanelIn {
        from { opacity: 0; transform: translateY(20px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes bottlePop {
        0%   { transform: translateY(0) rotate(0); }
        30%  { transform: translateY(-14px) rotate(-6deg); }
        60%  { transform: translateY(-6px) rotate(4deg); }
        100% { transform: translateY(0) rotate(0); }
      }
      @keyframes champagneGlow {
        0%,100% { box-shadow: 0 0 0 0 rgba(212,168,98,0.6), 0 4px 14px rgba(0,0,0,0.18); }
        50%     { box-shadow: 0 0 0 8px rgba(212,168,98,0), 0 4px 14px rgba(0,0,0,0.18); }
      }
      @keyframes flightPulse {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.65; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  // Restore permission state on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(PERMISSION_KEY);
    if (stored === 'granted') setEnabled(true);
    else if (!needsIosPermission()) {
      // Android / desktop don't need explicit permission; auto-enable.
      setEnabled(true);
    }
  }, []);

  // Tap "Press for a Treat" OR shake → either start a new order flow or
  // re-open the live tracker for the existing order.
  const triggerReveal = useCallback(() => {
    if (hasOrder) {
      setView(isArrived ? 'arrived' : 'tracking');
    } else {
      setView('confirm');
    }
    setModalOpen(true);
    if (window.navigator?.vibrate) window.navigator.vibrate(40);
  }, [hasOrder, isArrived]);

  // Shake listener
  useEffect(() => {
    if (!enabled) return;
    const onMotion = (e) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      const { x = 0, y = 0, z = 0 } = acc;
      const last = lastAccelRef.current;
      const delta = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z);
      lastAccelRef.current = { x, y, z };
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - cooldownRef.current > SHAKE_COOLDOWN_MS) {
        cooldownRef.current = now;
        triggerReveal();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, triggerReveal]);

  // Countdown — runs whenever there's an active order, regardless of whether
  // the modal is open. That's the whole point: minimise should NOT pause time.
  useEffect(() => {
    if (!order || secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setPopping(true);
          // If the user has the modal open, flip it to the arrived view.
          setView((v) => (v === 'tracking' ? 'arrived' : v));
          if (window.navigator?.vibrate) window.navigator.vibrate([60, 40, 60]);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [order, secondsLeft]);

  const handleEnableShake = async () => {
    sessionStorage.setItem(PERMISSION_PROMPTED_KEY, '1');
    const ok = await requestMotionPermission();
    setEnabled(ok);
    if (!ok) {
      alert('Shake detection needs motion access — you can still press the button anytime.');
    }
  };

  const handleConfirm = async () => {
    try {
      const result = await orderChampagne({ location: cabinLabel });
      // Update folio via guest context (matches the agent's applyAgentUpdate flow)
      if (typeof applyAgentUpdate === 'function' && result?.new_folio_balance != null) {
        applyAgentUpdate({ folio_balance: result.new_folio_balance });
      }
      setOrder(result);
      setSecondsLeft((result?.eta_minutes ?? 7) * 60);
      setView('tracking');
    } catch (e) {
      console.error('Treat order failed', e);
      // Local fallback so the demo never breaks
      const fallback = {
        bottle: 'Gelato Sundae',
        price: 0,
        location: cabinLabel,
        dispatched_from: 'Scoops, Deck 6',
        eta_minutes: 7,
        deck_path: [6, 5, 4, guestData?.deck || 8],
        confirmation_id: `CH${Math.floor(Math.random() * 99999).toString().padStart(5, '0')}`,
      };
      setOrder(fallback);
      setSecondsLeft(fallback.eta_minutes * 60);
      setView('tracking');
    }
  };

  // Close the modal but keep the order alive (still tracking under the hood).
  const minimise = () => setModalOpen(false);

  // Used by "Not yet" on the confirm view AND by scrim-click on confirm —
  // safely cancels BEFORE any order is placed. After confirm, scrim/× should
  // minimise instead so the order persists.
  const cancelOrMinimise = () => {
    if (view === 'confirm' && !hasOrder) {
      setModalOpen(false);
      setView('confirm');
    } else {
      minimise();
    }
  };

  // "Enjoy!" on the arrived view — clears the order entirely, returns card to idle.
  const dismissOrder = () => {
    setOrder(null);
    setSecondsLeft(0);
    setPopping(false);
    setModalOpen(false);
    setView('confirm');
  };

  // Compute tracker progress
  const totalSec = (order?.eta_minutes ?? 7) * 60;
  const progress = totalSec > 0 ? 1 - secondsLeft / totalSec : 1;
  const fromDeck = order?.deck_path?.[0] ?? 6;
  const toDeck = order?.deck_path?.[order.deck_path.length - 1] ?? (guestData?.deck || 8);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const etaStr = `${mins}:${String(secs).padStart(2, '0')}`;

  // ─── In-flight / Arrived pill styles ─────────────────────────────────
  const flightPillStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.30)',
    borderRadius: 14,
    padding: '12px 14px',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12,
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background 0.18s, transform 0.12s',
  };
  const flightLeft = { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 };
  const flightBucket = {
    width: 44, height: 44, borderRadius: 10,
    background: 'rgba(0,0,0,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    fontSize: 22,
  };
  const flightLabel = { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 };
  const flightTitle = { fontSize: 14, fontWeight: 700, marginTop: 1, lineHeight: 1.2 };
  const flightEta = (live) => ({
    fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
    color: live ? GOLD : '#fff',
    animation: live ? 'flightPulse 1.6s ease-in-out infinite' : 'none',
  });
  const arrivedPillStyle = {
    ...flightPillStyle,
    background: GOLD,
    color: INK,
    border: `1px solid ${GOLD}`,
    animation: 'champagneGlow 1.6s ease-in-out infinite',
  };

  return (
    <>
      {/* ── Always-visible dashboard card ──────────────────────────────── */}
      <div style={S.card}>
        <div style={S.shimmer} />
        <div style={S.headlineRow}>
          <span style={S.headlineLabel}>Signature experience</span>
        </div>
        <div style={S.headline}>Shake for a Treat</div>
        <div style={S.sub}>
          {hasOrder
            ? 'Your treat is on the move — tap below to see live status.'
            : 'Gelato, a smoothie, a mocktail, or popcorn — delivered wherever you are.'}
        </div>

        {/* Three visual states for the primary CTA. */}
        {!hasOrder && (
          <>
            <button
              style={S.pressBtn(pressed)}
              onClick={triggerReveal}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              onMouseLeave={() => setPressed(false)}
              onTouchStart={() => setPressed(true)}
              onTouchEnd={() => setPressed(false)}
            >
              🍦 Press for a Treat
            </button>
            <div style={S.shakeHint}>
              {enabled
                ? <>📳 …or just shake your phone.</>
                : (
                  <>
                    or shake your phone —
                    <button style={S.enableBtn} onClick={handleEnableShake}>Enable shake</button>
                  </>
                )
              }
            </div>
          </>
        )}

        {hasOrder && !isArrived && (
          <button style={flightPillStyle} onClick={triggerReveal} aria-label="Track treat delivery">
            <div style={flightLeft}>
              <div style={flightBucket}>🍦</div>
              <div style={{ minWidth: 0 }}>
                <div style={flightLabel}>Treat en route</div>
                <div style={flightTitle}>
                  {order?.dispatched_from?.replace(' bar', '') || 'Scoops'} → {cabinLabel}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={flightEta(true)}>{etaStr}</div>
              <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 1 }}>TAP TO TRACK</div>
            </div>
          </button>
        )}

        {hasOrder && isArrived && (
          <button style={arrivedPillStyle} onClick={triggerReveal} aria-label="Treat arrived — tap to greet">
            <div style={flightLeft}>
              <div style={{ ...flightBucket, background: 'rgba(0,0,0,0.10)' }}>🍦</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...flightLabel, color: INK, opacity: 1 }}>It's here</div>
                <div style={{ ...flightTitle, color: INK }}>
                  Your treat has arrived
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: INK }}>OPEN ↗</div>
          </button>
        )}
      </div>

      {/* ── Confirm / Tracking / Arrived modal ─────────────────────────── */}
      {modalOpen && (
        <div style={S.modalRoot} role="dialog" aria-modal="true">
          <div style={S.scrim} onClick={cancelOrMinimise} />
          <div style={S.panel}>
            <button style={S.closeX} onClick={cancelOrMinimise} aria-label="Close">×</button>

            {view === 'confirm' && !hasOrder && (
              <>
                <div style={S.bucketWrap}><ChampagneBucket size={108} /></div>
                <div style={S.ph2Title}>Gelato Sundae</div>
                <div style={S.ph2Sub}>Two scoops + cherry · or ask for a smoothie, mocktail, or popcorn</div>
                <div style={S.detailGrid}>
                  <div>
                    <div style={S.detailKey}>Delivery to</div>
                    <div style={S.detailVal}>{cabinLabel}</div>
                  </div>
                  <div>
                    <div style={S.detailKey}>To your folio</div>
                    <div style={S.detailVal}>Complimentary</div>
                  </div>
                </div>
                <div style={S.actionsRow}>
                  <button style={S.secondaryAction} onClick={cancelOrMinimise}>Not yet</button>
                  <button
                    style={S.primaryAction(false)}
                    onClick={handleConfirm}
                  >
                    Send it 🍦
                  </button>
                </div>
              </>
            )}

            {view === 'tracking' && hasOrder && (
              <div style={S.trackerWrap}>
                <div style={S.bucketWrap}><ChampagneBucket size={84} /></div>
                <div style={S.ph2Title}>On its way, honey</div>
                <div style={S.ph2Sub}>{order?.dispatched_from || 'Scoops, Deck 6'} → {cabinLabel}</div>
                <div style={S.etaRow}>
                  <span style={S.etaNum}>{etaStr}</span>
                  <span style={S.etaLabel}>min</span>
                </div>
                <div style={S.etaCaption}>Live tracker — minimise anytime, we'll keep counting.</div>
                <div style={S.shipFrame}>
                  <ShipTracker fromDeck={fromDeck} toDeck={toDeck} progress={Math.min(1, progress)} />
                </div>
                <div style={{ ...S.confLine, marginBottom: 14 }}>
                  Confirmation #{order?.confirmation_id}
                </div>
                <div style={S.actionsRow}>
                  <button style={S.secondaryAction} onClick={minimise}>Minimise</button>
                </div>
              </div>
            )}

            {view === 'arrived' && hasOrder && (
              <>
                <div style={S.bucketWrap}><ChampagneBucket size={108} popping={popping} /></div>
                <div style={S.arrivedTitle}>Knock knock 🍦</div>
                <div style={S.arrivedSub}>Your {order?.bottle || 'treat'} just arrived at {cabinLabel}.</div>
                <div style={S.confLine}>Confirmation #{order?.confirmation_id}</div>
                <div style={S.actionsRow}>
                  <button
                    style={S.primaryAction(false)}
                    onClick={dismissOrder}
                  >
                    Enjoy! 🍦
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
