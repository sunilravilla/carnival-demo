import React, { useEffect } from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';
import AdminButton from './AdminButton';

/**
 * Modal dialog with backdrop blur
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {React.ReactNode} props.children - Modal content
 * @param {React.ReactNode} props.footer - Optional footer content
 */
function AdminModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = '480px',
}) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button style={styles.closeButton} onClick={onClose}>
            &#x2715;
          </button>
        </div>
        <div style={styles.content}>{children}</div>
        {footer && <div style={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'fadeIn 0.2s ease-out',
  },
  modal: {
    background: '#ffffff',
    borderRadius: hpeTheme.borderRadius.lg,
    boxShadow: hpeTheme.elevation.large,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideUp 0.2s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: hpeTheme.spacing.lg,
    borderBottom: `1px solid ${hpeTheme.border.weak}`,
  },
  title: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.xl,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.text.strong,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: hpeTheme.typography.fontSizes.lg,
    color: hpeTheme.text.weak,
    cursor: 'pointer',
    padding: hpeTheme.spacing.xs,
    borderRadius: hpeTheme.borderRadius.sm,
    transition: `all ${hpeTheme.transitions.fast}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
  },
  content: {
    padding: hpeTheme.spacing.lg,
    overflowY: 'auto',
    flex: 1,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: hpeTheme.spacing.sm,
    padding: hpeTheme.spacing.lg,
    borderTop: `1px solid ${hpeTheme.border.weak}`,
  },
};

export default AdminModal;
