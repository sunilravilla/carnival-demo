import { useEffect, useState } from 'react';
import { branding, isVirgin } from '../styles/branding';

const ROOT_GRADIENT = isVirgin
  ? 'linear-gradient(170deg, #2E0444 0%, #5B0822 50%, #CC0000 100%)'
  : 'linear-gradient(170deg, #003580 0%, #006994 45%, #C8952A 100%)';

const S = {
  root: {
    position: 'fixed', inset: 0,
    background: ROOT_GRADIENT,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  logoWrap: {
    marginBottom: 16,
    animation: 'wFadeUp 0.7s ease both',
  },
  logo: {
    height: 56,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
  },
  avatarRing: {
    width: 110, height: 110,
    borderRadius: '50%',
    border: '3px solid rgba(200,149,42,0.7)',
    boxShadow: '0 0 0 6px rgba(200,149,42,0.2), 0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    marginBottom: 20,
    animation: 'wFadeUp 0.8s 0.1s ease both',
  },
  avatar: { width: '100%', height: '100%', objectFit: 'cover' },
  headline: {
    color: '#fff',
    fontSize: 26, fontWeight: 700,
    letterSpacing: 0.3,
    textAlign: 'center',
    textShadow: '0 2px 12px rgba(0,0,0,0.4)',
    marginBottom: 6,
    animation: 'wFadeUp 0.8s 0.2s ease both',
  },
  sub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 40,
    animation: 'wFadeUp 0.8s 0.3s ease both',
  },
  btn: {
    background: '#B61B38',
    color: '#fff',
    border: 'none',
    borderRadius: 30,
    padding: '14px 48px',
    fontSize: 17, fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(182,27,56,0.45)',
    letterSpacing: 0.5,
    animation: 'wFadeUp 0.8s 0.4s ease both, shimmer 3s 1.5s ease infinite',
    backgroundSize: '200% 100%',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  wave: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 100, overflow: 'hidden',
    lineHeight: 0,
  },
  footer: {
    position: 'absolute', bottom: 24,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11, letterSpacing: 0.5,
  },
};

export default function WelcomeScreen({ onGetStarted }) {
  const [pressed, setPressed] = useState(false);

  return (
    <div style={S.root}>
      <style>{`
        @keyframes wFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wave1 {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes wave2 {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>

      {/* Brand logo — use the white/transparent variant on the dark gradient. */}
      <div style={S.logoWrap}>
        <img src={isVirgin ? branding.logoWhite : (branding.logo || "/carnival-logo.png")} alt={branding.logoText} style={S.logo} />
      </div>

      {/* Concierge avatar — shared Marina sprite until a dedicated photo ships. */}
      <div style={S.avatarRing}>
        <img src="/avatars/marina-real/marina_01_closed.png" alt={branding.avatarName} style={S.avatar} />
      </div>

      <div style={S.headline}>{isVirgin ? "Honey, you're home." : "Welcome Aboard"}</div>
      <div style={S.sub}>{isVirgin ? "Scarlet Lady · Western Caribbean · 5 Nights" : "Carnival Celebration · Western Caribbean · 7 Nights"}</div>

      <button
        style={{
          ...S.btn,
          transform: pressed ? 'scale(0.97)' : 'scale(1)',
          boxShadow: pressed ? '0 2px 10px rgba(182,27,56,0.3)' : S.btn.boxShadow,
        }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onClick={onGetStarted}
      >
        Get Started
      </button>

      {/* Animated ocean wave */}
      <div style={S.wave}>
        <svg viewBox="0 0 1200 100" preserveAspectRatio="none" style={{ width: '200%', height: '100%', animation: 'wave1 8s linear infinite' }}>
          <path d="M0,40 C150,80 350,0 600,40 C850,80 1050,0 1200,40 L1200,100 L0,100 Z" fill="rgba(255,255,255,0.08)" />
        </svg>
        <svg viewBox="0 0 1200 100" preserveAspectRatio="none" style={{ width: '200%', height: '100%', position: 'absolute', bottom: 0, animation: 'wave2 12s linear infinite' }}>
          <path d="M0,50 C200,20 400,80 600,50 C800,20 1000,80 1200,50 L1200,100 L0,100 Z" fill="rgba(255,255,255,0.05)" />
        </svg>
      </div>

      <div style={S.footer}>Powered by HPE · {branding.logoText} {isVirgin ? "Sailor App" : "AI Concierge"}</div>
    </div>
  );
}
