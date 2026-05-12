import { useState, useEffect } from 'react';
import hpeTheme from '../styles/hpeTheme';

export default function ModeSwitcher({ mode, onModeChange }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoverTimer, setHoverTimer] = useState(null);

  const handleMouseEnter = () => {
    // Show tooltip after 5 seconds of hovering
    const timer = setTimeout(() => {
      setShowTooltip(true);
    }, 5000);
    setHoverTimer(timer);
  };

  const handleMouseLeave = () => {
    // Cancel timer and hide tooltip
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    setShowTooltip(false);
  };

  const toggleMode = () => {
    // Cycle through: avatar -> 2d_avatar -> avatar
    const newMode = mode === 'avatar' ? '2d_avatar' : 'avatar';
    onModeChange(newMode);
    localStorage.setItem('interactionMode', newMode);
  };

  const getNextModeName = () => {
    return mode === 'avatar' ? '2D Avatar' : '3D Avatar';
  };

  const getCurrentModeLabel = () => {
    return mode === 'avatar' ? '3D Avatar' : '2D Avatar';
  };

  useEffect(() => {
    return () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
      }
    };
  }, [hoverTimer]);

  return (
    <div
      style={styles.container}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div style={styles.tooltip}>
          <div style={styles.tooltipText}>
            Switch to {getNextModeName()} Mode
          </div>
          <div style={styles.tooltipArrow} />
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={toggleMode}
        style={{
          ...styles.button,
          ...(showTooltip ? styles.buttonVisible : {}),
        }}
        title={`Switch to ${getNextModeName()} mode`}
      >
        <div style={styles.iconContainer}>
          {mode === 'avatar' ? (
            // 2D Avatar icon (smiley face) - shows next mode
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9" cy="9" r="1" fill="currentColor" />
              <circle cx="15" cy="9" r="1" fill="currentColor" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            // 3D Avatar icon (person) - shows next mode
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Mode indicator */}
        <div style={styles.modeLabel}>
          {getCurrentModeLabel()}
        </div>
      </button>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: '20px',
    right: '70px', // Make room for settings button
    zIndex: 1000,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: hpeTheme.brand.green,
    color: 'white',
    border: 'none',
    borderRadius: hpeTheme.borderRadius.md,
    cursor: 'pointer',
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    boxShadow: hpeTheme.elevation.high,
    transition: 'all 0.3s ease',
    opacity: 0.3,
  },
  buttonVisible: {
    opacity: 1,
    transform: 'scale(1.05)',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
  },
  modeLabel: {
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.medium,
  },
  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 12px)',
    right: 0,
    backgroundColor: hpeTheme.text.strong,
    color: 'white',
    padding: '10px 14px',
    borderRadius: hpeTheme.borderRadius.sm,
    fontSize: hpeTheme.typography.fontSizes.sm,
    whiteSpace: 'nowrap',
    boxShadow: hpeTheme.elevation.high,
    animation: 'fadeIn 0.3s ease',
  },
  tooltipText: {
    margin: 0,
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: '-6px',
    right: '20px',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: `6px solid ${hpeTheme.text.strong}`,
  },
};
