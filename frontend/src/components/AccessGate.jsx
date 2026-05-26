import { useState, useRef, useEffect } from 'react';
import { branding } from '../styles/branding';

const ACCESS_CODE = (import.meta.env.VITE_ACCESS_CODE || 'hpe-carnival').toLowerCase();
const SESSION_KEY = 'carnival_access_granted';

export function isAccessGranted() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function grantAccess() {
  sessionStorage.setItem(SESSION_KEY, '1');
}

const S = {
  root: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(170deg, #0a1628 0%, #0d2d5e 50%, #8B0E26 100%)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 24, overflow: 'hidden',
  },
  card: {
    background: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    padding: '36px 32px 32px',
    width: '100%', maxWidth: 380,
    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
    animation: 'gateIn 0.55s cubic-bezier(0.16,1,0.3,1) both',
    position: 'relative', zIndex: 1,
  },
  logoRow: {
    display: 'flex', justifyContent: 'center', marginBottom: 4,
  },
  logo: { height: 38, objectFit: 'contain' },
  divider: {
    width: 56, height: 3,
    background: 'linear-gradient(90deg, #B61B38, #014E8F)',
    borderRadius: 2, margin: '14px auto 22px',
  },
  title: {
    fontSize: 21, fontWeight: 800, color: '#0d2d5e',
    textAlign: 'center', marginBottom: 6, letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13, color: '#888',
    textAlign: 'center', marginBottom: 26, lineHeight: 1.55,
  },
  lockIcon: {
    fontSize: 32, textAlign: 'center', marginBottom: 16,
    display: 'block',
  },
  label: {
    fontSize: 12, fontWeight: 700, color: '#555',
    letterSpacing: 0.8, textTransform: 'uppercase',
    display: 'block', marginBottom: 8,
  },
  inputWrap: {
    position: 'relative', marginBottom: 6,
  },
  input: (error, shake) => ({
    width: '100%', boxSizing: 'border-box',
    border: `2px solid ${error ? '#B61B38' : '#e0e0e0'}`,
    borderRadius: 14,
    padding: '14px 48px 14px 16px',
    fontSize: 18, fontWeight: 700,
    letterSpacing: 2,
    color: '#0d2d5e',
    outline: 'none',
    fontFamily: 'monospace',
    transition: 'border-color 0.2s',
    animation: shake ? 'inputShake 0.4s ease' : 'none',
    background: error ? '#fff5f5' : '#fff',
  }),
  eyeBtn: {
    position: 'absolute', right: 14, top: '50%',
    transform: 'translateY(-50%)',
    background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 18, color: '#aaa',
    lineHeight: 1, padding: 4,
  },
  hint: {
    fontSize: 11, color: '#bbb', marginTop: 6, marginBottom: 20,
  },
  submitBtn: (ready) => ({
    width: '100%',
    background: ready
      ? 'linear-gradient(135deg, #B61B38 0%, #014E8F 100%)'
      : '#e5e0d8',
    color: ready ? '#fff' : '#aaa',
    border: 'none', borderRadius: 14,
    padding: '15px', fontSize: 16, fontWeight: 700,
    cursor: ready ? 'pointer' : 'default',
    transition: 'all 0.2s',
    letterSpacing: 0.5,
    boxShadow: ready ? '0 4px 20px rgba(182,27,56,0.3)' : 'none',
  }),
  error: {
    color: '#B61B38', fontSize: 13, fontWeight: 600,
    textAlign: 'center', marginTop: 12,
  },
  wave: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: 120, overflow: 'hidden', zIndex: 0,
    lineHeight: 0,
  },
  footer: {
    position: 'fixed', bottom: 16,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11, letterSpacing: 0.5, zIndex: 1,
  },
};

export default function AccessGate({ onGranted }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  const handleChange = (e) => {
    setValue(e.target.value);
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submit();
  };

  const submit = () => {
    if (!value.trim()) return;
    if (value.trim().toLowerCase() === ACCESS_CODE) {
      grantAccess();
      onGranted();
    } else {
      setShake(true);
      setError('Incorrect access code. Please try again.');
      setTimeout(() => {
        setShake(false);
        setValue('');
        inputRef.current?.focus();
      }, 500);
    }
  };

  const ready = value.trim().length > 0;

  return (
    <div style={S.root}>
      <style>{`
        @keyframes gateIn {
          from { opacity: 0; transform: translateY(32px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes inputShake {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-8px); }
          40%     { transform: translateX(8px); }
          60%     { transform: translateX(-5px); }
          80%     { transform: translateX(5px); }
        }
        @keyframes waveA { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes waveB { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
      `}</style>

      {/* Animated ocean waves */}
      <div style={S.wave}>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none"
          style={{ width: '200%', height: '100%', animation: 'waveA 11s linear infinite' }}>
          <path d="M0,55 C180,95 360,15 600,55 C840,95 1020,15 1200,55 L1200,120 L0,120 Z"
            fill="rgba(255,255,255,0.07)" />
        </svg>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none"
          style={{ width: '200%', height: '100%', position: 'absolute', bottom: 0, animation: 'waveB 15s linear infinite' }}>
          <path d="M0,65 C220,20 440,100 600,65 C780,20 1000,100 1200,65 L1200,120 L0,120 Z"
            fill="rgba(255,255,255,0.04)" />
        </svg>
      </div>

      <div style={S.card}>
        <div style={S.logoRow}>
          <img src={branding.logo || "/carnival-logo.png"} alt={branding.logoText} style={S.logo} />
        </div>

        <div style={S.divider} />

        <span style={S.lockIcon}>🔐</span>
        <div style={S.title}>Demo Access</div>
        <div style={S.subtitle}>
          This is a private demo environment.<br />
          Enter your access code to continue.
        </div>

        <label style={S.label} htmlFor="access-input">Access Code</label>

        <div style={S.inputWrap}>
          <input
            id="access-input"
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter your code"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            style={S.input(!!error, shake)}
          />
          <button
            style={S.eyeBtn}
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            title={show ? 'Hide' : 'Show'}
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>

        <div style={S.hint}>Provided by your {branding.logoText} / HPE representative</div>

        <button
          style={S.submitBtn(ready)}
          onClick={submit}
          disabled={!ready}
        >
          Board the Ship 🚢
        </button>

        {error && <div style={S.error}>{error}</div>}
      </div>

      <div style={S.footer}>{branding.logoText} · Powered by HPE · Demo Environment</div>
    </div>
  );
}
