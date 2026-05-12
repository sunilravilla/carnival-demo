import { useState, useEffect, useRef } from 'react';
import { useGuest } from '../../context/GuestContext';
import { cancelReservation } from '../../services/api';

const TYPE_ICON = {
  dining: '🍽',
  show: '🎭',
  spa: '💆',
  spa_booking: '💆',
  excursion: '⛵',
  activity: '🎯',
  drink_package: '🍹',
};

function resName(res) {
  return res.restaurant_name || res.show_name || res.name || res.kind || 'Reservation';
}

function resType(res) {
  return res.kind || res.type || 'activity';
}

const S = {
  section: { margin: '12px 12px 0' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: 700, color: '#1a1a2e' },
  count: {
    background: '#B61B38', color: '#fff',
    fontSize: 11, fontWeight: 700,
    width: 20, height: 20, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    background: '#fff',
    borderRadius: 14,
    padding: '20px 16px',
    textAlign: 'center',
    color: '#999', fontSize: 13,
    border: '1px dashed #e5e0d8',
  },
  card: (isNew) => ({
    background: '#fff',
    borderRadius: 14,
    padding: '12px 14px',
    marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: isNew ? '1.5px solid rgba(200,149,42,0.5)' : '1px solid #f0ece6',
    animation: isNew ? 'goldSlideIn 0.5s ease both' : 'none',
    position: 'relative',
    overflow: 'hidden',
  }),
  newGlow: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(90deg, rgba(200,149,42,0.08) 0%, transparent 100%)',
    pointerEvents: 'none',
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    background: 'linear-gradient(135deg, #f7f4f0, #ede8e0)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 14, fontWeight: 700, color: '#1a1a2e',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  time: { fontSize: 13, fontWeight: 700, color: '#014E8F', flexShrink: 0 },
  cancelBtn: {
    background: 'none', border: 'none',
    color: '#B61B38', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', padding: '2px 6px',
    borderRadius: 6,
    flexShrink: 0,
  },
  confirmRow: {
    background: '#fff5f5',
    border: '1px solid #ffcccc',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8,
  },
  confirmText: { fontSize: 13, color: '#B61B38', fontWeight: 600 },
  confirmBtns: { display: 'flex', gap: 8 },
  yesBtn: {
    background: '#B61B38', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '6px 14px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
  },
  noBtn: {
    background: '#f0ece6', color: '#555',
    border: 'none', borderRadius: 8,
    padding: '6px 14px', fontSize: 13,
    cursor: 'pointer',
  },
};

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function ReservationCard({ res, onCancelRequest, isNew }) {
  const type = resType(res);
  const name = resName(res);
  const icon = TYPE_ICON[type] || '📋';
  const meta = res.party_size
    ? `Party of ${res.party_size}`
    : res.count ? `${res.count} tickets` : res.venue || res.location || '';

  return (
    <div style={S.card(isNew)}>
      {isNew && <div style={S.newGlow} />}
      <div style={S.iconWrap}>{icon}</div>
      <div style={S.info}>
        <div style={S.name}>{name}</div>
        {meta ? <div style={S.meta}>{meta}</div> : null}
      </div>
      <div style={S.time}>{formatTime(res.time)}</div>
      <button style={S.cancelBtn} onClick={() => onCancelRequest({ ...res, name })}>✕</button>
    </div>
  );
}

export default function ReservationWidget() {
  const { reservations, refreshReservations } = useGuest();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [newIds, setNewIds] = useState(new Set());
  const prevIdsRef = useRef(new Set());

  // Detect newly added reservations and flash them
  useEffect(() => {
    const currentIds = new Set(reservations.map(r => r.id || r.name + r.time));
    const added = [...currentIds].filter(id => !prevIdsRef.current.has(id));
    if (added.length > 0) {
      setNewIds(new Set(added));
      const t = setTimeout(() => setNewIds(new Set()), 3000);
      prevIdsRef.current = currentIds;
      return () => clearTimeout(t);
    }
    prevIdsRef.current = currentIds;
  }, [reservations]);

  const sorted = [...reservations].sort((a, b) => {
    const toMins = t => {
      if (!t) return 9999;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    return toMins(a.time) - toMins(b.time);
  });

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelReservation(cancelTarget.name);
      await refreshReservations();
    } catch (e) {
      console.warn('Cancel failed:', e);
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  return (
    <div style={S.section}>
      <style>{`
        @keyframes goldSlideIn {
          from { opacity: 0; transform: translateX(-12px); background: rgba(200,149,42,0.12); }
          to   { opacity: 1; transform: translateX(0); background: #fff; }
        }
      `}</style>

      <div style={S.header}>
        <div style={S.title}>Today's Reservations</div>
        {sorted.length > 0 && <div style={S.count}>{sorted.length}</div>}
      </div>

      {cancelTarget && (
        <div style={S.confirmRow}>
          <span style={S.confirmText}>Cancel {cancelTarget.name}?</span>
          <div style={S.confirmBtns}>
            <button style={S.yesBtn} onClick={handleCancelConfirm} disabled={cancelling}>
              {cancelling ? '…' : 'Yes'}
            </button>
            <button style={S.noBtn} onClick={() => setCancelTarget(null)} disabled={cancelling}>No</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={S.empty}>
          No reservations yet · Ask Marina to book something!
        </div>
      ) : (
        sorted.map((res, idx) => {
          const id = res.id || res.name + res.time;
          return (
            <ReservationCard
              key={id || idx}
              res={res}
              isNew={newIds.has(id)}
              onCancelRequest={setCancelTarget}
            />
          );
        })
      )}
    </div>
  );
}
