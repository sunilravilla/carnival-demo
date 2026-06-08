import { useEffect, useState } from 'react';

// Brand colors (Marenova: aurora teal on deep-sea ink, gold accent)
const RED = '#18A0A8';
const TOLOPEA = '#0B3D5C';
const GOLD = '#E8B04B';
const INK = '#06283D';

// A real public disco / golden-hour playlist on Spotify. (Opens external app —
// no audio is played from inside our PWA.)
const SPOTIFY_PLAYLIST_WEB = 'https://open.spotify.com/playlist/37i9dQZF1DXaXB8fQg7xif';
const SPOTIFY_PLAYLIST_APP = 'spotify:playlist:37i9dQZF1DXaXB8fQg7xif';
const APPLE_MUSIC = 'https://music.apple.com/us/search?term=disco%20essentials';

// Tonight's set list — chosen so something is always "live" for the demo.
// Each entry: start hour 0-23 + `set_name` key. The set_name must match
// the backend's _MANOR_SCHEDULE in [backend/app/services/agent_service.py]
// so the chat "Shazam" tool surfaces a track from THIS set (B4 fix).
const MANOR_SETS = [
  { h: 18, set_name: 'sundowner-disco',    dj: 'DJ House Mother',              set: "Sundowner — '70s disco essentials",      until: '8 PM' },
  { h: 20, set_name: 'dinner-funk',        dj: 'DJ House Mother',              set: 'Dinner Hour — funk & soul',              until: '10 PM' },
  { h: 22, set_name: 'marvy-house',        dj: 'DJ Marvy',                     set: 'Main Stage takeover — house & disco',    until: '11:30 PM' },
  { h: 23, set_name: 'klub-rubiks-80s',    dj: 'Resident · Retro Deck Party',  set: "'80s & '90s dance party (costume encouraged)", until: '1:30 AM' },
  { h: 1,  set_name: 'afterhours-grooves', dj: 'DJ Marvy',                     set: 'After-hours grooves',                    until: 'late' },
  { h: 3,  set_name: 'winddown-soul',      dj: 'Resident',                     set: 'Wind-down soul',                         until: '5 AM' },
];

// Explicit hour → set name lookup. The naive "latest start hour ≤ now" loop
// broke after-midnight (h=3 winddown set was winning for ANY h ≥ 3).
// Mirrors _MANOR_HOUR_LOOKUP in [backend/app/services/agent_service.py].
const HOUR_TO_SET_NAME = {
  16: 'marvy-house',        17: 'marvy-house',
  18: 'sundowner-disco',    19: 'sundowner-disco',
  20: 'dinner-funk',        21: 'dinner-funk',
  22: 'marvy-house',
  23: 'klub-rubiks-80s',    0: 'klub-rubiks-80s',
  1: 'afterhours-grooves',  2: 'afterhours-grooves',
  3: 'winddown-soul',       4: 'winddown-soul',
  // 5-15 → preview window
};

function currentSet() {
  const h = new Date().getHours();
  const setName = HOUR_TO_SET_NAME[h] || 'marvy-house';
  const preview = h >= 5 && h < 16;
  const match = MANOR_SETS.find((s) => s.set_name === setName) || MANOR_SETS[2];
  if (preview) {
    return { ...match, set: 'Tonight: house & disco at 10 PM', preview: true };
  }
  return match;
}

const S = {
  card: {
    margin: '8px 14px',
    background: INK,
    color: '#fff',
    borderRadius: 16,
    padding: '14px 16px 12px',
    position: 'relative',
    overflow: 'hidden',
    border: `1px solid ${TOLOPEA}`,
  },
  glow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: `radial-gradient(circle at 90% 0%, ${RED}40 0%, transparent 50%)`,
  },
  topRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 10, fontWeight: 800, letterSpacing: 2.5,
    textTransform: 'uppercase', color: GOLD,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: RED,
    boxShadow: `0 0 6px ${RED}`,
    animation: 'manorPulse 1.5s ease-in-out infinite',
  },
  body: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    gap: 12,
  },
  bodyLeft: { flex: 1, minWidth: 0 },
  djLine: { fontSize: 15, fontWeight: 800, lineHeight: 1.2, marginBottom: 2 },
  setLine: { fontSize: 12, opacity: 0.75, lineHeight: 1.3 },
  until: { fontSize: 11, color: GOLD, marginTop: 4, letterSpacing: 0.5 },
  // Equalizer bars
  eq: {
    display: 'flex', alignItems: 'flex-end', gap: 2,
    height: 28,
  },
  bar: (i, active) => ({
    width: 3,
    background: active ? RED : `${RED}50`,
    borderRadius: 1,
    animation: active ? `manorBar 1.${(i * 3) % 9}s ease-in-out infinite alternate` : 'none',
    animationDelay: `${i * 0.08}s`,
    height: active ? `${30 + (i % 4) * 20}%` : '10%',
    minHeight: 4,
  }),
  ctaRow: {
    display: 'flex', gap: 8, marginTop: 12,
  },
  vibeBtn: {
    flex: 1,
    background: `linear-gradient(135deg, ${RED} 0%, ${TOLOPEA} 100%)`,
    color: '#fff',
    border: 'none', borderRadius: 999,
    padding: '10px 14px',
    fontSize: 13, fontWeight: 800, letterSpacing: 0.4,
    cursor: 'pointer',
    display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6,
    boxShadow: '0 4px 14px rgba(204,0,0,0.35)',
  },
  altBtn: {
    background: 'transparent',
    color: '#fff', opacity: 0.85,
    border: '1px solid rgba(255,255,255,0.30)',
    borderRadius: 999,
    padding: '10px 14px',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },
};

export default function NowPlayingManor({ onAction } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (document.getElementById('manor-kf')) return;
    const s = document.createElement('style');
    s.id = 'manor-kf';
    s.textContent = `
      @keyframes manorPulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50%     { opacity: 0.5; transform: scale(0.8); }
      }
      @keyframes manorBar {
        from { height: 18%; }
        to   { height: 95%; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  // Re-render every minute so the live set rolls
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const set = currentSet();
  const live = !set.preview;

  const openSpotify = () => {
    // Try native app first (mobile); web fallback.
    const a = document.createElement('a');
    a.href = SPOTIFY_PLAYLIST_APP;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      window.open(SPOTIFY_PLAYLIST_WEB, '_blank', 'noopener');
    }, 350);
  };

  const openApple = () => {
    window.open(APPLE_MUSIC, '_blank', 'noopener');
  };

  return (
    <div style={S.card} key={tick}>
      <div style={S.glow} />
      <div style={S.topRow}>
        <div style={S.eyebrow}>
          {live && <span style={S.liveDot} />}
          {live ? 'NOW · STARLIGHT LOUNGE' : 'TONIGHT · STARLIGHT LOUNGE'}
        </div>
      </div>
      <div style={S.body}>
        <div style={S.bodyLeft}>
          <div style={S.djLine}>🎧 {set.dj}</div>
          <div style={S.setLine}>{set.set}</div>
          <div style={S.until}>{live ? `until ${set.until}` : `Starts at 10 PM · ${set.set}`}</div>
        </div>
        <div style={S.eq} aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={S.bar(i, live)} />
          ))}
        </div>
      </div>
      <div style={S.ctaRow}>
        <button style={S.vibeBtn} onClick={openSpotify}>
          🎶 Set the Vibe — Spotify
        </button>
        {onAction && (
          <button
            style={S.altBtn}
            onClick={() => onAction("What's playing right now at the Starlight Lounge? Identify the track for me.")}
            title="Identify the current Starlight Lounge track and add it to your Cruise Soundtrack"
          >
            🎧 Shazam
          </button>
        )}
        <button style={S.altBtn} onClick={openApple} title="Open in Apple Music">
          Apple
        </button>
      </div>
    </div>
  );
}
