import { useState, useEffect } from 'react';
import { useGuest } from '../../context/GuestContext';
import { branding, isVirgin } from '../../styles/branding';

const TOOLTIP_KEY = 'concierge_chat_tooltip_shown';
const RING_COLOR = branding.accentColor || '#B61B38';
const UNREAD_COLOR = branding.goldColor || '#FFC72C';

const S = {
  wrap: {
    position: 'fixed',
    bottom: 24,
    right: 20,
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
  },
  tooltip: {
    background: '#fff',
    borderRadius: 14,
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a2e',
    maxWidth: 200,
    lineHeight: 1.4,
    border: '1px solid #f0ece6',
    animation: 'tooltipIn 0.4s ease both',
    position: 'relative',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -6, right: 26,
    width: 12, height: 12,
    background: '#fff',
    border: '1px solid #f0ece6',
    borderTop: 'none', borderLeft: 'none',
    transform: 'rotate(45deg)',
  },
  bubble: (unread) => ({
    width: 64, height: 64,
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    border: `3px solid ${unread ? UNREAD_COLOR : RING_COLOR}`,
    boxShadow: unread
      ? `0 4px 20px ${UNREAD_COLOR}80`
      : `0 4px 20px ${RING_COLOR}59`,
    position: 'relative',
    transition: 'transform 0.2s, box-shadow 0.2s',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  }),
  img: {
    width: '100%', height: '100%',
    objectFit: 'cover',
    objectPosition: 'center 5%',
    display: 'block',
  },
  initials: {
    width: '100%', height: '100%',
    background: 'linear-gradient(135deg, #CC0000 0%, #2E0444 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 28, letterSpacing: 0.5,
  },
  unreadDot: {
    position: 'absolute',
    top: 2, right: 2,
    width: 14, height: 14,
    borderRadius: '50%',
    background: UNREAD_COLOR,
    border: '2px solid #fff',
    animation: 'dotPulse 1.5s ease-in-out infinite',
  },
};

export default function MarinaChatBubble({ onOpen }) {
  const { guestData, marinaUnread, isFirstVisit, setIsFirstVisit } = useGuest();
  const [showTooltip, setShowTooltip] = useState(false);
  const [pressed, setPressed] = useState(false);

  const firstName = guestData?.primaryFirstName || guestData?.name?.split(' ')[0] || '';

  useEffect(() => {
    if (!isFirstVisit) return;
    const shown = sessionStorage.getItem(TOOLTIP_KEY);
    if (shown) return;
    // Pulse animation then show tooltip after 1.5s
    const t1 = setTimeout(() => {
      setShowTooltip(true);
      sessionStorage.setItem(TOOLTIP_KEY, '1');
    }, 1500);
    // Auto-hide after 4s
    const t2 = setTimeout(() => setShowTooltip(false), 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isFirstVisit]);

  const handleClick = () => {
    setShowTooltip(false);
    setIsFirstVisit(false);
    onOpen?.();
  };

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes marinaPulse {
          0%   { transform: scale(1); box-shadow: 0 4px 20px rgba(182,27,56,0.35); }
          50%  { transform: scale(1.08); box-shadow: 0 6px 28px rgba(182,27,56,0.55); }
          100% { transform: scale(1); box-shadow: 0 4px 20px rgba(182,27,56,0.35); }
        }
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.3); }
        }
      `}</style>

      {showTooltip && (
        <div style={S.tooltip}>
          Hi {firstName}! I'm {branding.avatarName} 👋<br />
          <span style={{ fontWeight: 400, color: '#666', fontSize: 12 }}>
            {branding.avatarRole} — tap me!
          </span>
          <div style={S.tooltipArrow} />
        </div>
      )}

      <div
        style={{
          ...S.bubble(marinaUnread),
          transform: pressed ? 'scale(0.93)' : 'scale(1)',
          animation: isFirstVisit && !showTooltip ? 'marinaPulse 2s ease-in-out 3' : 'none',
        }}
        onClick={handleClick}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        title={`Chat with ${branding.avatarName}`}
      >
        <img
          src="/avatars/marina-real/marina_01_closed.png"
          alt={branding.avatarName}
          style={S.img}
        />
        {marinaUnread && <div style={S.unreadDot} />}
      </div>
    </div>
  );
}
