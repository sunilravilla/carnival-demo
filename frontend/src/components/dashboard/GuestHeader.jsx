import { useState } from 'react';
import { useGuest } from '../../context/GuestContext';
import { branding, isVirgin } from '../../styles/branding';

const TIER_COLORS = branding.tierColors || {};
const TIER_LABEL = branding.tierLabel || 'Tier';
const ACCENT = branding.accentColor || '#FFC72C';
const HEADER_GRADIENT = branding.headerGradient || 'linear-gradient(135deg, #B61B38 0%, #014E8F 100%)';

const S = {
  header: {
    position: 'sticky', top: 0, zIndex: 100,
    background: HEADER_GRADIENT,
    padding: '12px 16px 10px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
  },
  row1: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  left: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { height: 38, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))', alignSelf: 'flex-start', marginTop: -2 },
  logoCard: {
    height: 38,
    background: '#fff',
    borderRadius: 6,
    padding: '4px 8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: -2,
  },
  logoCardImg: { height: '100%', width: 'auto', objectFit: 'contain' },
  guestName: {
    color: '#fff', fontSize: 16, fontWeight: 700,
    fontFamily: "'Playfair Display', serif",
    letterSpacing: 0.3,
    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  vifpBadge: (tier) => ({
    background: TIER_COLORS[tier] || '#888',
    color: '#fff', fontSize: 11, fontWeight: 700,
    padding: '3px 10px', borderRadius: 20,
    letterSpacing: 0.5,
    boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
  }),
  row2: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6,
  },
  cabinRow: {
    display: 'flex', gap: 12,
  },
  chip: {
    color: 'rgba(255,255,255,0.85)', fontSize: 12,
    background: 'rgba(255,255,255,0.12)',
    padding: '2px 10px', borderRadius: 12,
  },
  dayChip: {
    color: ACCENT, fontSize: 12, fontWeight: 700,
  },
};

export default function GuestHeader({ onAdminClick, onSwitchGuest }) {
  const { guestData } = useGuest();
  const [adminTaps, setAdminTaps] = useState(0);

  if (!guestData) return null;

  const { primaryFirstName, name, cabin, deck, vifpTier, ship, cruise } = guestData;

  const handleCabinTap = () => {
    const next = adminTaps + 1;
    setAdminTaps(next);
    if (next >= 5) {
      setAdminTaps(0);
      onAdminClick?.();
    }
  };

  return (
    <div style={S.header}>
      <div style={S.row1}>
        <div style={S.left}>
          {isVirgin ? (
            <div style={S.logoCard}>
              <img src={branding.logo || '/virgin-logo.jpg'} alt={branding.logoText} style={S.logoCardImg} />
            </div>
          ) : (
            <img src={branding.logoWhite || '/carnival-logo-white.png'} alt={branding.logoText} style={S.logo} />
          )}
        </div>
        <div style={S.right}>
          <div style={S.vifpBadge(vifpTier)}>{vifpTier} {TIER_LABEL}</div>
          {onSwitchGuest && (
            <button
              onClick={onSwitchGuest}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}
            >
              Switch
            </button>
          )}
        </div>
      </div>
      <div style={S.row2}>
        <div style={S.cabinRow}>
          <span
            style={{ ...S.chip, cursor: 'default', userSelect: 'none' }}
            onClick={handleCabinTap}
            title="Tap 5× for admin"
          >
            Cabin {cabin} · Deck {deck}
          </span>
          <span style={S.chip}>{ship}</span>
        </div>
        {cruise && (
          <span style={S.dayChip}>
            Day {cruise.currentDay} of {cruise.totalDays}
          </span>
        )}
      </div>
    </div>
  );
}
