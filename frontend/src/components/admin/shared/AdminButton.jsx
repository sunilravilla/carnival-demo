import React from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';

/**
 * Futuristic admin button with glow effects
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'danger'} props.variant - Button style variant
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.disabled - Disable button
 * @param {React.ReactNode} props.children - Button content
 * @param {Function} props.onClick - Click handler
 * @param {Object} props.style - Additional styles
 */
function AdminButton({
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  onClick,
  style = {},
  type = 'button',
  ...props
}) {
  const buttonConfig = hpeTheme.admin.button[variant] || hpeTheme.admin.button.primary;
  const isDisabled = disabled || loading;

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: hpeTheme.spacing.sm,
    padding: `${hpeTheme.spacing.sm} ${hpeTheme.spacing.lg}`,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    fontFamily: hpeTheme.typography.fontFamily,
    borderRadius: hpeTheme.borderRadius.md,
    border: variant === 'secondary' ? `1px solid ${buttonConfig.border}` : 'none',
    background: buttonConfig.background,
    color: buttonConfig.text,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.6 : 1,
    transition: `all ${hpeTheme.transitions.fast}`,
    boxShadow: buttonConfig.shadow || 'none',
    minHeight: '40px',
    ...style,
  };

  const handleMouseEnter = (e) => {
    if (!isDisabled) {
      e.currentTarget.style.background = buttonConfig.backgroundHover;
      if (buttonConfig.shadowHover) {
        e.currentTarget.style.boxShadow = buttonConfig.shadowHover;
      }
      e.currentTarget.style.transform = 'translateY(-1px)';
    }
  };

  const handleMouseLeave = (e) => {
    e.currentTarget.style.background = buttonConfig.background;
    e.currentTarget.style.boxShadow = buttonConfig.shadow || 'none';
    e.currentTarget.style.transform = 'translateY(0)';
  };

  return (
    <button
      type={type}
      style={baseStyle}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {loading && (
        <span style={styles.spinner} />
      )}
      {children}
    </button>
  );
}

const styles = {
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

export default AdminButton;
