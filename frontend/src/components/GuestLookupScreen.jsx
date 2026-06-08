import { useState, useRef, useEffect } from 'react';
import { lookupGuest } from '../services/api';
import { branding } from '../styles/branding';

const S = {
  root: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(170deg, #003580 0%, #006994 60%, #004f7c 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '36px 32px 32px',
    width: '100%', maxWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    animation: 'cardIn 0.5s ease both',
  },
  logoRow: {
    display: 'flex', justifyContent: 'center', marginBottom: 8,
  },
  logo: { height: 40, objectFit: 'contain' },
  header: {
    fontSize: 20, fontWeight: 700, color: '#003580',
    textAlign: 'center', marginBottom: 4,
  },
  shipLine: {
    fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 28,
  },
  label: {
    fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 8, display: 'block',
  },
  input: {
    width: '100%', boxSizing: 'border-box',
    border: '2px solid #e0e0e0', borderRadius: 12,
    padding: '14px 16px', fontSize: 22,
    fontWeight: 600, letterSpacing: 3,
    textAlign: 'center', color: '#003580',
    outline: 'none', transition: 'border-color 0.2s',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 10,
  },
  error: {
    background: '#fff0f0', border: '1px solid #ffcccc',
    borderRadius: 8, padding: '10px 14px',
    color: '#B61B38', fontSize: 13,
    marginTop: 14, textAlign: 'center',
  },
  loadingWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 24, gap: 10,
  },
  spinner: {
    width: 36, height: 36,
    border: '3px solid #e0e0e0',
    borderTop: '3px solid #B61B38',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { fontSize: 13, color: '#666' },
  btn: {
    width: '100%', marginTop: 20,
    background: '#B61B38', color: '#fff',
    border: 'none', borderRadius: 12,
    padding: '14px', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', transition: 'opacity 0.2s',
  },
};

export default function GuestLookupScreen({ onGuestFound }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doLookup = async (phone) => {
    setLoading(true);
    setError('');
    try {
      const data = await lookupGuest(phone);
      onGuestFound(data.guest);
    } catch {
      setError('Number not found. Try a demo number: 9999999990 – 9999999999');
      setLoading(false);
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setValue(digits);
    setError('');
    if (digits.length === 10) {
      doLookup(digits);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.length === 10) doLookup(value);
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={S.card}>
        <div style={S.logoRow}>
          <img src={branding.logo || "/carnival-logo.png"} alt={branding.logoText} style={S.logo} />
        </div>
        <div style={S.header}>Your Voyage Profile</div>
        <div style={S.shipLine}>Marenova Aurora · Western Caribbean · 5 Nights</div>

        <form onSubmit={handleSubmit}>
          <label style={S.label} htmlFor="phone-input">Registered Mobile Number</label>
          <input
            id="phone-input"
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="_ _ _ _ _ _ _ _ _ _"
            value={value}
            onChange={handleChange}
            disabled={loading}
            style={{
              ...S.input,
              borderColor: error ? '#ffaaaa' : value.length > 0 ? '#006994' : '#e0e0e0',
            }}
            autoComplete="off"
          />
          <div style={S.hint}>Demo numbers: 9999999990 – 9999999999</div>

          {error && <div style={S.error}>{error}</div>}

          {loading ? (
            <div style={S.loadingWrap}>
              <div style={S.spinner} />
              <span style={S.loadingText}>Finding your voyage…</span>
            </div>
          ) : (
            <button type="submit" style={{ ...S.btn, opacity: value.length === 10 ? 1 : 0.5 }} disabled={value.length !== 10}>
              Find My Reservation
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
