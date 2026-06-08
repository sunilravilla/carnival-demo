import { useGuest } from '../../context/GuestContext';

const TEAL = '#18A0A8';
const DEEPSEA = '#0B3D5C';
const GOLD = '#E8B04B';

const TIER_PERKS = {
  'Aurora Grand Suite': {
    label: 'Aurora Grand Suite',
    color: GOLD,
    perks: [
      { icon: '🌅', label: 'The Aurora Deck — exclusive sundeck access' },
      { icon: '🥤', label: 'Unlimited Refreshment Package — included' },
      { icon: '💆', label: 'Unlimited Serenity Spa Thermal Suite' },
      { icon: '📶', label: 'Premium Wi-Fi included on all devices' },
      { icon: '🛎️', label: 'Aurora Concierge — 24/7 white-glove service' },
    ],
  },
  'Aurora Suite': {
    label: 'Aurora Suite',
    color: TEAL,
    perks: [
      { icon: '🌅', label: 'The Aurora Deck access' },
      { icon: '🚶', label: 'Priority boarding + reserved restaurant slots' },
      { icon: '🧸', label: 'Kids-club priority + in-cabin treats' },
      { icon: '🛎️', label: 'Aurora Concierge — 24/7 support' },
    ],
  },
};

const S = {
  card: {
    margin: '8px 14px',
    background: '#fff',
    border: `1.5px solid ${DEEPSEA}33`,
    borderRadius: 14,
    padding: '14px 16px 12px',
    boxShadow: '0 4px 14px rgba(11,61,92,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  ribbon: (color) => ({
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 4, background: color,
  }),
  topRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  badge: (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: `${color}15`,
    color, fontSize: 11, fontWeight: 800,
    letterSpacing: 1.5, textTransform: 'uppercase',
    padding: '4px 10px', borderRadius: 999,
  }),
  star: (color) => ({
    color, fontSize: 12, letterSpacing: 1,
  }),
  perkRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 0',
    borderTop: '1px solid #F2EEE7',
    fontSize: 13, color: '#0A0A0A',
  },
  icon: { fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 },
};

export default function RockStarPerks() {
  const { guestData } = useGuest();
  if (!guestData) return null;
  const tier = guestData.vifpTier;
  const config = TIER_PERKS[tier];
  if (!config) return null; // Only RockStar / Mega RockStar see this

  return (
    <div style={S.card}>
      <div style={S.ribbon(config.color)} />
      <div style={S.topRow}>
        <div style={S.badge(config.color)}>
          <span style={S.star(config.color)}>★</span> {config.label} Perks
        </div>
        <div style={{ fontSize: 11, color: '#888' }}>Included in your stay</div>
      </div>
      <div>
        {config.perks.map((p, i) => (
          <div key={i} style={{ ...S.perkRow, borderTop: i === 0 ? 'none' : S.perkRow.borderTop }}>
            <span style={S.icon}>{p.icon}</span>
            <span>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
