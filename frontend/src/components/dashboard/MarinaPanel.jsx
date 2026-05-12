import { useEffect, useRef } from 'react';
import { useGuest } from '../../context/GuestContext';
import ChatInterface from '../ChatInterface';

const S = {
  overlay: (open) => ({
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 299,
    opacity: open ? 1 : 0,
    pointerEvents: open ? 'auto' : 'none',
    transition: 'opacity 0.35s ease',
  }),
};

export default function MarinaPanel({ open, onClose, prefilledMessage, onPrefilledUsed }) {
  const { setMarinaUnread } = useGuest();
  const panelRef = useRef(null);

  // Clear unread when panel opens
  useEffect(() => {
    if (open) setMarinaUnread(false);
  }, [open, setMarinaUnread]);

  // Swipe-down to close on mobile
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let startY = 0;
    const onTouchStart = e => { startY = e.touches[0].clientY; };
    const onTouchEnd = e => {
      const delta = e.changedTouches[0].clientY - startY;
      if (delta > 80) onClose?.();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onClose]);

  return (
    <>
      <style>{`
        .marina-panel {
          position: fixed;
          z-index: 300;
          background: #F7F4F0;
          transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .marina-panel {
            top: 0;
            right: 0;
            width: min(480px, 62vw);
            height: 100%;
            border-radius: 0;
            transform: translateX(100%);
            box-shadow: -8px 0 40px rgba(0,0,0,0.2);
          }
          .marina-panel.open {
            transform: translateX(0);
          }
        }
        @media (max-width: 767px) {
          .marina-panel {
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            height: 80dvh;
            border-radius: 18px 18px 0 0;
            transform: translateY(100%);
            box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
          }
          .marina-panel.open {
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Backdrop (mobile: tap to close) */}
      <div style={S.overlay(open)} onClick={onClose} />

      {/* Panel — always mounted so chat history is preserved */}
      <div
        ref={panelRef}
        className={`marina-panel${open ? ' open' : ''}`}
      >
        {/* Mobile drag handle */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          padding: '10px 0 4px',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'rgba(0,0,0,0.15)',
          }} />
        </div>

        <ChatInterface
          panelMode
          panelOpen={open}
          onClose={onClose}
          prefilledMessage={prefilledMessage}
          onMessageUsed={onPrefilledUsed}
        />
      </div>
    </>
  );
}
