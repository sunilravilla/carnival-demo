import { useEffect, useState } from 'react';
import { useGuest } from '../../context/GuestContext';

// Brand colors
const RED = '#CC0000';
const TOLOPEA = '#2E0444';
const GOLD = '#D4A862';
const INK = '#0A0A0A';

// Lookbook — must match keys in backend agent_service _OUTFIT_LOOKBOOK
const SCARLET_LOOKS = [
  {
    id: 'scarlet-statement',
    name: 'Scarlet Statement',
    image: '/looks/scarlet-statement.svg',
    vibe: 'Photo-finish red.',
  },
  {
    id: 'crimson-tux',
    name: 'Crimson Tuxedo',
    image: '/looks/crimson-tux.svg',
    vibe: 'Branson energy.',
  },
  {
    id: 'after-hours',
    name: 'After-Hours Red',
    image: '/looks/after-hours.svg',
    vibe: 'Arrive second, leave last.',
  },
];

// Scarlet Night happens tomorrow (Day 5) at 21:00 local-ish for the demo.
// Always anchor to "tomorrow at 9 PM" — simple and dramatic.
function scarletNightTarget() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(21, 0, 0, 0);
  return t;
}

function formatCountdown(ms) {
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, label: 'NOW' };
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s };
}

const S = {
  card: {
    margin: '8px 14px',
    borderRadius: 18,
    background: `linear-gradient(135deg, ${TOLOPEA} 0%, #5B0822 55%, ${RED} 100%)`,
    color: '#fff',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 10px 32px rgba(46,4,68,0.35)',
  },
  spotlight: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(circle at 85% 15%, rgba(212,168,98,0.30) 0%, transparent 55%)',
  },
  top: {
    padding: '16px 18px 12px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 8,
  },
  topLeft: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 11, fontWeight: 800, letterSpacing: 2,
    textTransform: 'uppercase', color: GOLD,
    marginBottom: 2,
  },
  headline: {
    fontSize: 22, fontWeight: 800, lineHeight: 1.15,
    letterSpacing: 0.2,
  },
  subline: {
    fontSize: 13, opacity: 0.9,
    padding: '0 18px 8px',
  },
  countdown: {
    display: 'flex', alignItems: 'baseline', gap: 4,
    background: 'rgba(0,0,0,0.30)',
    border: `1px solid ${GOLD}66`,
    borderRadius: 12,
    padding: '8px 12px',
    fontVariantNumeric: 'tabular-nums',
  },
  cdNum: { fontSize: 18, fontWeight: 900 },
  cdLbl: { fontSize: 9, fontWeight: 700, opacity: 0.8, letterSpacing: 1, marginLeft: 2, marginRight: 6 },
  dressRow: {
    margin: '0 18px 12px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10,
    fontSize: 13, fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  redDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: RED, border: '2px solid #fff',
    boxShadow: '0 0 8px rgba(255,255,255,0.6)',
  },
  looksLabel: {
    margin: '4px 18px 8px',
    fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
    textTransform: 'uppercase', color: GOLD,
  },
  looksRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8, padding: '0 14px 12px',
  },
  lookCard: (active) => ({
    background: 'rgba(255,255,255,0.08)',
    border: active ? `2px solid ${GOLD}` : '1px solid rgba(255,255,255,0.18)',
    borderRadius: 12,
    padding: 6,
    cursor: 'pointer',
    transition: 'transform 0.15s, border-color 0.15s, background 0.15s',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  }),
  lookImg: {
    width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
    objectFit: 'cover', background: '#fff',
    display: 'block',
  },
  lookName: {
    fontSize: 11, fontWeight: 700, marginTop: 6,
    color: '#fff', textAlign: 'center',
    lineHeight: 1.2,
  },
  lookVibe: {
    fontSize: 10, opacity: 0.8, color: GOLD,
    textAlign: 'center', marginTop: 2,
  },
  cta: {
    margin: '4px 14px 14px',
    display: 'flex', gap: 8,
  },
  primary: (pressed) => ({
    flex: 1,
    background: pressed ? '#FAFAF7' : '#fff',
    color: RED,
    border: 'none', borderRadius: 999,
    padding: '12px 16px',
    fontSize: 14, fontWeight: 800, letterSpacing: 0.4,
    cursor: 'pointer',
    transform: pressed ? 'scale(0.98)' : 'scale(1)',
    transition: 'transform 0.12s, background 0.18s',
  }),
  secondary: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.40)',
    borderRadius: 999, padding: '12px 16px',
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
};

export default function TonightsLook({ onAction }) {
  const { guestData } = useGuest();
  const firstName = guestData?.primaryFirstName || guestData?.name?.split(' ')[0] || 'Sailor';
  const [now, setNow] = useState(Date.now());
  const [hoveredLook, setHoveredLook] = useState(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = scarletNightTarget();
  const remaining = target.getTime() - now;
  const cd = formatCountdown(remaining);

  const handleLookTap = (look) => {
    if (!onAction) return;
    setHoveredLook(look.id);
    // Fires the `land_the_look` macro — one tool turn, 4 distinct cards back
    // (outfit + salon + Manor table + look-specific cocktail).
    onAction(
      `Land the ${look.name} look for Scarlet Night — blow-out at 7 PM, Manor table at 11 PM for 2.`
    );
  };

  const handleSortItAll = () => {
    if (!onAction) return;
    // Default to Scarlet Statement when the Sailor hasn't picked — Marina will
    // confirm and offer to swap.
    onAction(
      `Land the Scarlet Statement look for Scarlet Night — sort everything.`
    );
  };

  return (
    <div style={S.card}>
      <div style={S.spotlight} />

      <div style={S.top}>
        <div style={S.topLeft}>
          <div style={S.eyebrow}>Tonight's Look · Scarlet Night</div>
          <div style={S.headline}>{firstName}, you in red?</div>
        </div>
        <div style={S.countdown}>
          {cd.d > 0 && (<><span style={S.cdNum}>{cd.d}</span><span style={S.cdLbl}>D</span></>)}
          <span style={S.cdNum}>{String(cd.h).padStart(2, '0')}</span><span style={S.cdLbl}>H</span>
          <span style={S.cdNum}>{String(cd.m).padStart(2, '0')}</span><span style={S.cdLbl}>M</span>
          <span style={S.cdNum}>{String(cd.s).padStart(2, '0')}</span><span style={S.cdLbl}>S</span>
        </div>
      </div>
      <div style={S.subline}>Scarlet Night is tomorrow — pick a look.</div>

      <div style={S.dressRow}>
        <div style={S.redDot} />
        <div>Dress code: <strong>RED</strong> — non-negotiable.</div>
      </div>

      <div style={S.looksLabel}>Pick a look · Marina books the rest</div>
      <div style={S.looksRow}>
        {SCARLET_LOOKS.map((l) => (
          <div
            key={l.id}
            style={S.lookCard(hoveredLook === l.id)}
            onClick={() => handleLookTap(l)}
            onMouseEnter={() => setHoveredLook(l.id)}
            onMouseLeave={() => setHoveredLook(null)}
          >
            <img
              src={l.image}
              alt={l.name}
              style={S.lookImg}
              onError={(e) => { e.target.style.visibility = 'hidden'; }}
            />
            <div style={S.lookName}>{l.name}</div>
            <div style={S.lookVibe}>{l.vibe}</div>
          </div>
        ))}
      </div>

      <div style={S.cta}>
        <button
          style={S.primary(pressed)}
          onClick={handleSortItAll}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onMouseLeave={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
        >
          ✨ Sort it all for me
        </button>
      </div>
    </div>
  );
}
