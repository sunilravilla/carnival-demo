import React, { useState } from 'react';
import { hpeTheme } from '../../styles/hpeTheme';
import AdminButton from './shared/AdminButton';
import AdminInput from './shared/AdminInput';
import { adminLogin } from '../../services/api';

/**
 * Full-screen admin login component with futuristic styling
 * @param {Object} props
 * @param {Function} props.onLoginSuccess - Called when login succeeds
 * @param {Function} props.onCancel - Called when user cancels
 */
function AdminLogin({ onLoginSuccess, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await adminLogin(password);
      if (result.success) {
        onLoginSuccess();
      }
    } catch (err) {
      setError('Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Animated background gradient */}
      <div style={styles.backgroundGradient} />

      {/* Login card */}
      <div style={styles.card}>
        {/* Gradient border effect */}
        <div style={styles.gradientBorder} />

        <div style={styles.cardContent}>
          {/* Logo/Icon */}
          <div style={styles.logoContainer}>
            <div style={styles.logo}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke={hpeTheme.brand.green}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke={hpeTheme.core.teal}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke={hpeTheme.core.purple}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <h1 style={styles.title}>Admin Panel</h1>
          <p style={styles.subtitle}>Enter your password to continue</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <AdminInput
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter admin password"
              error={error}
              disabled={loading}
            />

            <div style={styles.buttonGroup}>
              <AdminButton
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!password}
                style={{ flex: 1 }}
              >
                Sign In
              </AdminButton>
              <AdminButton
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </AdminButton>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>SEA Admin</span>
        <span style={styles.footerDot}>&#8226;</span>
        <span>HPE AI Services</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d0d1a',
    fontFamily: hpeTheme.typography.fontFamily,
    zIndex: 10000,
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `
      radial-gradient(circle at 20% 20%, rgba(118, 48, 234, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(1, 169, 130, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(0, 232, 207, 0.1) 0%, transparent 50%)
    `,
    animation: 'pulse 8s ease-in-out infinite',
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: '400px',
    borderRadius: hpeTheme.borderRadius.xl,
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    overflow: 'hidden',
    zIndex: 1,
  },
  gradientBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: hpeTheme.borderRadius.xl,
    padding: '1px',
    background: hpeTheme.admin.gradientBorder,
    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    pointerEvents: 'none',
  },
  cardContent: {
    padding: hpeTheme.spacing.xxl,
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: hpeTheme.spacing.lg,
  },
  logo: {
    width: '80px',
    height: '80px',
    borderRadius: hpeTheme.borderRadius.lg,
    background: 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: hpeTheme.admin.glow.green,
  },
  title: {
    margin: 0,
    marginBottom: hpeTheme.spacing.xs,
    fontSize: hpeTheme.typography.fontSizes.xxl,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    margin: 0,
    marginBottom: hpeTheme.spacing.xl,
    fontSize: hpeTheme.typography.fontSizes.sm,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: hpeTheme.spacing.lg,
  },
  buttonGroup: {
    display: 'flex',
    gap: hpeTheme.spacing.sm,
  },
  footer: {
    position: 'absolute',
    bottom: hpeTheme.spacing.lg,
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.sm,
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: 'rgba(255, 255, 255, 0.4)',
    zIndex: 1,
  },
  footerDot: {
    opacity: 0.5,
  },
};

export default AdminLogin;
