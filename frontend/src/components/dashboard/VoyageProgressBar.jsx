import { useGuest } from '../../context/GuestContext';

// Marenova itinerary ports — Aurora Cay, Puerto Plata, Miami.
// The matcher below falls back to a short slug for any other port.
const PORT_EMOJI = { 'Aurora Cay': '🏝', 'Puerto Plata': '🌴', 'Miami': '🏙' };

const S = {
  wrap: {
    background: '#fff',
    padding: '12px 16px 14px',
    borderBottom: '1px solid #f0ece6',
  },
  label: {
    fontSize: 11, fontWeight: 700, color: '#999',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 10,
  },
  track: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: '50%', left: 0, right: 0,
    height: 2,
    background: '#e5e0d8',
    transform: 'translateY(-50%)',
    zIndex: 0,
  },
  progress: (pct) => ({
    position: 'absolute',
    top: '50%', left: 0,
    width: `${pct}%`,
    height: 2,
    background: 'linear-gradient(90deg, #B61B38, #C8952A)',
    transform: 'translateY(-50%)',
    zIndex: 1,
    transition: 'width 0.6s ease',
  }),
  dayWrap: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4,
    zIndex: 2, position: 'relative',
  },
  dot: (active, past) => ({
    width: active ? 20 : 14,
    height: active ? 20 : 14,
    borderRadius: '50%',
    background: active
      ? 'linear-gradient(135deg, #B61B38, #C8952A)'
      : past ? '#C8952A' : '#e5e0d8',
    border: active ? '2px solid #fff' : 'none',
    boxShadow: active ? '0 2px 8px rgba(182,27,56,0.4)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  }),
  portLabel: (active) => ({
    fontSize: active ? 10 : 9,
    fontWeight: active ? 700 : 500,
    color: active ? '#B61B38' : '#999',
    textAlign: 'center',
    maxWidth: 44,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
};

function getPortLabel(stop) {
  if (!stop) return '';
  const s = stop.toLowerCase();
  if (s.includes('sea') || s === 'at sea') return 'Sea';
  if (s.includes('miami')) return 'Miami';
  if (s.includes('aurora cay') || s.includes('aurora')) return 'Aurora Cay';
  if (s.includes('puerto plata') || s.includes('plata')) return 'Plata';
  if (s.includes('embark')) return 'Start';
  if (s.includes('disembark')) return 'End';
  return stop.split(',')[0].slice(0, 7);
}

function getPortEmoji(stop) {
  if (!stop) return null;
  const s = stop.toLowerCase();
  if (s.includes('sea')) return null;
  for (const [k, v] of Object.entries(PORT_EMOJI)) {
    if (s.includes(k.toLowerCase())) return v;
  }
  return null;
}

export default function VoyageProgressBar() {
  const { guestData } = useGuest();
  if (!guestData?.cruise) return null;

  const { currentDay, totalDays, itinerary = [] } = guestData.cruise;
  const firstName = guestData.primaryFirstName || guestData.name?.split(' ')[0] || '';
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const progressPct = ((currentDay - 1) / Math.max(totalDays - 1, 1)) * 100;

  return (
    <div style={S.wrap}>
      <div style={S.label}>{firstName ? `${firstName}'s Voyage` : 'Your Voyage'}</div>
      <div style={S.track}>
        <div style={S.line} />
        <div style={S.progress(progressPct)} />
        {days.map(day => {
          const stop = itinerary[day - 1];
          const isActive = day === currentDay;
          const isPast = day < currentDay;
          const emoji = getPortEmoji(stop);
          const label = stop ? getPortLabel(stop) : `D${day}`;

          return (
            <div key={day} style={S.dayWrap}>
              <div style={S.dot(isActive, isPast)}>
                {isActive && <span style={{ fontSize: 9 }}>⛵</span>}
              </div>
              {emoji && !isActive && (
                <div style={{ fontSize: 11, marginTop: -2 }}>{emoji}</div>
              )}
              <div style={S.portLabel(isActive)}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
