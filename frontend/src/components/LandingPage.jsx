import { useState, useEffect } from 'react';
import { hpeTheme } from '../styles/hpeTheme';
import { branding, isCarnival, isVirgin, isMarenova } from '../styles/branding';
import { userLogin, setUserAuthenticated } from '../services/api';

// ─── Animated SVG logo mark — three orbital arcs + pulsing core ───────────────
function AriaOrb() {
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Outer orbital arc — green */}
      <circle
        cx="48" cy="48" r="42"
        stroke="#01a982"
        strokeWidth="1.5"
        strokeDasharray="180 84"
        strokeLinecap="round"
        opacity="0.4"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 48 48"
          to="360 48 48"
          dur="12s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="48" cy="6" r="3" fill="#01a982" opacity="0.8">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 48 48"
          to="360 48 48"
          dur="12s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Mid orbital arc — teal */}
      <circle
        cx="48" cy="48" r="30"
        stroke="#00e8cf"
        strokeWidth="1.5"
        strokeDasharray="110 78"
        strokeLinecap="round"
        opacity="0.5"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="120 48 48"
          to="-240 48 48"
          dur="8s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="48" cy="18" r="2.5" fill="#00e8cf" opacity="0.9">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="120 48 48"
          to="-240 48 48"
          dur="8s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Inner orbital arc — purple */}
      <circle
        cx="48" cy="48" r="18"
        stroke="#7630EA"
        strokeWidth="1.5"
        strokeDasharray="60 53"
        strokeLinecap="round"
        opacity="0.6"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="240 48 48"
          to="-120 48 48"
          dur="5s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="48" cy="30" r="2" fill="#7630EA" opacity="1">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="240 48 48"
          to="-120 48 48"
          dur="5s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Core — pulsing */}
      <circle cx="48" cy="48" r="7" fill="#01a982" opacity="0.9">
        <animate
          attributeName="r"
          values="6;8;6"
          dur="3s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.9;0.6;0.9"
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="48" cy="48" r="4" fill="#ffffff" opacity="0.95" />
    </svg>
  );
}

// ─── Dot-grid background ──────────────────────────────────────────────────────
function GridBackground() {
  return (
    <div style={gridStyles.root} aria-hidden>
      <div style={gridStyles.grid} className="aria-grid" />
      <div style={gridStyles.glow1} />
      <div style={gridStyles.glow2} />
      <div style={gridStyles.glow3} />
    </div>
  );
}

const gridStyles = {
  root: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute',
    inset: '-40px',
    backgroundImage: 'radial-gradient(circle, rgba(1,169,130,0.12) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  },
  glow1: {
    position: 'absolute',
    top: '-10%',
    left: '-5%',
    width: '50%',
    height: '60%',
    background: 'radial-gradient(ellipse, rgba(118,48,234,0.12) 0%, transparent 65%)',
  },
  glow2: {
    position: 'absolute',
    bottom: '-10%',
    right: '-5%',
    width: '55%',
    height: '60%',
    background: 'radial-gradient(ellipse, rgba(1,169,130,0.12) 0%, transparent 65%)',
  },
  glow3: {
    position: 'absolute',
    top: '30%',
    left: '35%',
    width: '30%',
    height: '40%',
    background: 'radial-gradient(ellipse, rgba(0,232,207,0.06) 0%, transparent 65%)',
  },
};

// ─── Horizontal scan line ─────────────────────────────────────────────────────
function ScanLine() {
  return <div style={scanStyle} className="aria-scan" aria-hidden />;
}

const scanStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  height: '1px',
  background: 'linear-gradient(90deg, transparent, rgba(1,169,130,0.4), transparent)',
  pointerEvents: 'none',
};

// ─── Auth overlay ─────────────────────────────────────────────────────────────
function AuthOverlay({ onSuccess, onDismiss }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await userLogin(code);
      setUserAuthenticated();
      onSuccess();
    } catch {
      setError('Incorrect access code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onDismiss();
  };

  return (
    <div
      style={authStyles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal
      aria-label="Enter access code"
    >
      <div style={authStyles.panel} className="aria-auth-panel">
        <div style={authStyles.gradientBorder} />
        <div style={authStyles.inner}>
          <div style={authStyles.lockIcon} aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#01a982" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1" fill="#01a982" stroke="none" />
            </svg>
          </div>

          <h2 style={authStyles.heading}>Access Required</h2>
          <p style={authStyles.desc}>
            Enter the team access code to continue.
          </p>

          <form onSubmit={handleSubmit} style={authStyles.form}>
            <div style={authStyles.inputWrap}>
              <input
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                placeholder="Access code"
                disabled={loading}
                autoFocus
                style={{
                  ...authStyles.input,
                  borderColor: error ? '#c54e4b' : (code ? '#01a982' : 'rgba(255,255,255,0.15)'),
                }}
              />
              {error && <p style={authStyles.error}>{error}</p>}
            </div>

            <div style={authStyles.buttons}>
              <button
                type="submit"
                disabled={!code || loading}
                style={{
                  ...authStyles.submitBtn,
                  opacity: (!code || loading) ? 0.5 : 1,
                  cursor: (!code || loading) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={authStyles.spinner} className="aria-spin" />
                    Verifying
                  </span>
                ) : 'Continue →'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={loading}
                style={authStyles.cancelBtn}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const authStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13,13,26,0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    animation: 'ariaFadeIn 200ms ease-out',
  },
  panel: {
    position: 'relative',
    width: '100%',
    maxWidth: '400px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.04)',
    animation: 'ariaSlideUp 300ms cubic-bezier(0.16,1,0.3,1)',
  },
  gradientBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: '20px',
    padding: '1px',
    background: 'linear-gradient(135deg, #7630EA, #00e8cf, #01a982)',
    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    pointerEvents: 'none',
  },
  inner: {
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  lockIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    background: 'rgba(1,169,130,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  heading: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.3px',
  },
  desc: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '8px',
  },
  inputWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  input: {
    width: '100%',
    padding: '13px 16px',
    borderRadius: '10px',
    border: '1.5px solid',
    background: 'rgba(255,255,255,0.06)',
    color: '#ffffff',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 150ms',
    boxSizing: 'border-box',
    letterSpacing: '0.08em',
  },
  error: {
    margin: 0,
    fontSize: '12px',
    color: '#fc6161',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  submitBtn: {
    padding: '13px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #01a982, #008567)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(1,169,130,0.35)',
    transition: 'transform 100ms, box-shadow 100ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    padding: '11px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '14px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 150ms, color 150ms',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
  },
};

// ─── Main landing page ────────────────────────────────────────────────────────
export default function LandingPage({ onEnterUser, onEnterAdmin }) {
  const [visible, setVisible] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const contentStyle = {
    ...styles.content,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(28px)',
    transition: 'opacity 900ms cubic-bezier(0.16,1,0.3,1), transform 900ms cubic-bezier(0.16,1,0.3,1)',
  };

  return (
    <div style={styles.root}>
      {/* Inject keyframe animations */}
      <style>{cssAnimations}</style>

      <GridBackground />
      <ScanLine />

      <main style={contentStyle}>
        {/* ── Orb ── */}
        <div style={styles.orbWrap}>
          <div style={styles.orbGlow} className="aria-orb-glow" />
          <AriaOrb />
        </div>

        {/* ── Wordmark ── */}
        <div style={styles.wordmarkBlock}>
          <h1 style={styles.title}>{(branding.avatarName || "ARIA").toUpperCase()}</h1>
          <p style={styles.tagline}>
            {branding.avatarRole || "AI Product Advisor"}
          </p>
        </div>

        {/* ── Divider ── */}
        <div style={styles.divider} aria-hidden>
          <span style={styles.dividerLine} />
          <span style={styles.dividerDot} />
          <span style={styles.dividerLine} />
        </div>

        {/* ── Attribution ── */}
        <p style={styles.attribution}>
          <span style={styles.teamName}>
            {branding.logoText || "AI & Data COE Houston"}
          </span>
          <span style={styles.attributionSep}> · </span>
          <span style={styles.hpeTag}>{(isCarnival || isVirgin || isMarenova) ? "Powered by HPE" : "HPE"}</span>
        </p>

        {/* ── Actions ── */}
        <div style={styles.actions}>
          <button
            style={styles.primaryBtn}
            onClick={() => setShowAuth(true)}
            className="aria-enter-btn"
          >
            <span>{isCarnival ? "Board Marina" : (isVirgin || isMarenova) ? "Meet Marina" : "Enter ARIA"}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 8 }}>
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            style={styles.adminLink}
            onClick={onEnterAdmin}
            className="aria-admin-link"
          >
            Administrator access →
          </button>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <span style={styles.footerLeft}>
          <span style={styles.statusDot} className="aria-status-pulse" />
          System Online
        </span>
        <span style={styles.footerRight}>
          {(isCarnival || isVirgin || isMarenova) ? "Demo · HPE Greenlake" : "HPE Internal · AI&Data COE"}
        </span>
      </footer>

      {/* ── Auth overlay ── */}
      {showAuth && (
        <AuthOverlay
          onSuccess={onEnterUser}
          onDismiss={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#0d0d1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: hpeTheme.typography.fontFamily,
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    padding: '24px',
    textAlign: 'center',
  },
  orbWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  orbGlow: {
    position: 'absolute',
    width: '160px',
    height: '160px',
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(1,169,130,0.18) 0%, transparent 70%)',
  },
  wordmarkBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(56px, 10vw, 88px)',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.18em',
    lineHeight: 1,
  },
  tagline: {
    margin: 0,
    fontSize: 'clamp(13px, 2vw, 16px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '180px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.12)',
  },
  dividerDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#01a982',
    opacity: 0.7,
  },
  attribution: {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: '0.05em',
  },
  teamName: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: 500,
  },
  attributionSep: {
    margin: '0 4px',
    opacity: 0.4,
  },
  hpeTag: {
    color: '#01a982',
    fontWeight: 600,
    opacity: 0.85,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    marginTop: '12px',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 36px',
    borderRadius: '50px',
    border: 'none',
    background: 'linear-gradient(135deg, #01a982, #008567)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: '0 0 0 0 rgba(1,169,130,0.4), 0 4px 24px rgba(1,169,130,0.3)',
    transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
    minWidth: '200px',
  },
  adminLink: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    fontSize: '12px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    padding: '4px 8px',
    transition: 'color 200ms',
  },
  footer: {
    position: 'absolute',
    bottom: '24px',
    left: '24px',
    right: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  footerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: '0.06em',
  },
  footerRight: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: '0.06em',
  },
  statusDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#01a982',
  },
};

// ─── CSS keyframes (injected once) ───────────────────────────────────────────
const cssAnimations = `
  @keyframes ariaFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes ariaSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ariaScan {
    0% { top: -2px; opacity: 0; }
    5% { opacity: 1; }
    95% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  @keyframes ariaOrbGlow {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.12); }
  }
  @keyframes ariaStatusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes ariaGridFloat {
    0% { transform: translate(0, 0); }
    50% { transform: translate(4px, 6px); }
    100% { transform: translate(0, 0); }
  }
  @keyframes ariaSpin {
    to { transform: rotate(360deg); }
  }

  .aria-grid {
    animation: ariaGridFloat 18s ease-in-out infinite;
  }
  .aria-scan {
    animation: ariaScan 8s linear infinite;
    animation-delay: 2s;
  }
  .aria-orb-glow {
    animation: ariaOrbGlow 4s ease-in-out infinite;
  }
  .aria-status-pulse {
    animation: ariaStatusPulse 2.5s ease-in-out infinite;
  }
  .aria-spin {
    animation: ariaSpin 0.8s linear infinite;
  }

  .aria-enter-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 0 0 6px rgba(1,169,130,0.15), 0 8px 32px rgba(1,169,130,0.4) !important;
  }
  .aria-enter-btn:active {
    transform: translateY(0);
  }
  .aria-admin-link:hover {
    color: rgba(255,255,255,0.6) !important;
  }
  .aria-auth-panel {
    animation: ariaSlideUp 300ms cubic-bezier(0.16,1,0.3,1);
  }
`;
