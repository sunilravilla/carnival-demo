import { useGuest } from '../../context/GuestContext';

const VIFP_COLORS = { Platinum: '#6B7CFF', Gold: '#C8952A', Red: '#B61B38' };

const S = {
  wrap: {
    position: 'relative',
    height: 180,
    overflow: 'hidden',
    flexShrink: 0,
  },
  // Decorative wave overlay
  waveSvg: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 60, overflow: 'hidden',
  },
  // Ship silhouette tint
  shipOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 70% 50%, rgba(0,105,148,0.4) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  content: {
    position: 'absolute',
    inset: 0,
    padding: '20px 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  topRow: {
    position: 'absolute',
    top: 16, right: 16,
    display: 'flex', gap: 8, alignItems: 'center',
  },
  dayPill: {
    background: 'rgba(255,199,44,0.2)',
    border: '1px solid rgba(255,199,44,0.5)',
    color: '#FFC72C',
    fontSize: 11, fontWeight: 700,
    padding: '3px 10px', borderRadius: 20,
    letterSpacing: 0.5,
  },
  vifpBadge: (tier) => ({
    background: VIFP_COLORS[tier] || '#888',
    color: '#fff', fontSize: 11, fontWeight: 700,
    padding: '3px 10px', borderRadius: 20,
    letterSpacing: 0.5,
    boxShadow: '0 1px 6px rgba(0,0,0,0.3)',
  }),
  greeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13, marginBottom: 2,
    letterSpacing: 0.3,
  },
  name: {
    color: '#fff',
    fontSize: 26, fontWeight: 800,
    lineHeight: 1.15,
    textShadow: '0 2px 12px rgba(0,0,0,0.5)',
    marginBottom: 6,
  },
  shipRow: {
    display: 'flex', gap: 8, alignItems: 'center',
  },
  shipChip: {
    background: 'rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12, padding: '2px 10px',
    borderRadius: 12,
  },
  portChip: {
    background: 'rgba(255,199,44,0.15)',
    border: '1px solid rgba(255,199,44,0.3)',
    color: '#FFC72C',
    fontSize: 12, fontWeight: 600,
    padding: '2px 10px', borderRadius: 12,
  },
};

export default function HeroBanner() {
  const { guestData } = useGuest();
  if (!guestData) return null;

  const { primaryFirstName, name, vifpTier, ship, cruise } = guestData;
  const displayName = primaryFirstName || name.split(' ')[0];
  const port = cruise?.todayLabel || '';
  const isSeaDay = !port || port === 'At Sea';

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes bannerFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Ship photo background */}
      <img
        src="/carnival-ship-hero.jpg"
        alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 55%',
        }}
      />

      {/* Dark gradient overlay for text legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,39,68,0.55) 0%, rgba(1,78,143,0.75) 100%)',
      }} />

      {/* Wave at bottom */}
      <div style={S.waveSvg}>
        <svg viewBox="0 0 375 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <path d="M0,30 C80,55 170,5 250,30 C330,55 375,20 375,30 L375,60 L0,60 Z" fill="rgba(255,255,255,0.06)" />
        </svg>
      </div>

      {/* Top-right badges */}
      <div style={S.topRow}>
        {cruise && (
          <span style={S.dayPill}>Day {cruise.currentDay} of {cruise.totalDays}</span>
        )}
        <span style={S.vifpBadge(vifpTier)}>{vifpTier} VIFP</span>
      </div>

      {/* Bottom content */}
      <div style={{ ...S.content, animation: 'bannerFadeUp 0.6s ease both' }}>
        <div style={S.greeting}>Welcome back,</div>
        <div style={S.name}>{displayName}</div>
        <div style={S.shipRow}>
          <span style={S.shipChip}>{ship}</span>
          {port && (
            <span style={S.portChip}>
              {isSeaDay ? '⚓ At Sea' : `📍 ${port}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
