import { useEffect, useRef, useState } from 'react';
import { getVisemeShape, getVisemeParams, getVisemeFrameIndex } from './Visemes';
import hpeTheme from '../styles/hpeTheme';
import { isCarnival, branding } from '../styles/branding';

// 2D avatar with viseme-driven lipsync. Three render paths:
//   - Zippy (HPE)         — green smiley SVG (default for HPE branding)
//   - PhotoMarina         — photo-realistic sprite-sheet (Carnival, default)
//   - MarinaSVG           — illustrated SVG character (Carnival fallback)
//
// Carnival mode picks PhotoMarina when branding.useSpriteAvatar is true AND
// the sprite assets are reachable on disk; otherwise falls back to MarinaSVG.
// Flip branding.useSpriteAvatar to false in branding.js to revert to the SVG
// without touching code.
export default function ZippyAvatar({ currentViseme = 0, size = 400 }) {
  if (!isCarnival) return <ZippyClassic currentViseme={currentViseme} size={size} />;
  return <MarinaAvatar currentViseme={currentViseme} size={size} />;
}

// ---------------------------------------------------------------------------
// Marina selector — chooses between PhotoMarina and MarinaSVG.
// ---------------------------------------------------------------------------

// Probe state machine for the auto-detect fallback:
//   null    = probe in flight, render nothing for one tick to avoid SVG flash
//   true    = sprite assets reachable, render PhotoMarina
//   false   = probe failed, render MarinaSVG instead
function MarinaAvatar({ currentViseme, size }) {
  const [spritesAvailable, setSpritesAvailable] = useState(
    branding.useSpriteAvatar ? null : false
  );

  useEffect(() => {
    if (!branding.useSpriteAvatar) {
      setSpritesAvailable(false);
      return;
    }
    let cancelled = false;
    // Cheap probe: HEAD on the first frame. If it 200s, assume the rest are
    // there; the renderer pre-loads them on mount and any individual miss
    // still falls back gracefully via <img onError>.
    fetch('/avatars/marina-real/marina_01_closed.png', { method: 'HEAD' })
      .then((r) => { if (!cancelled) setSpritesAvailable(r.ok); })
      .catch(() => { if (!cancelled) setSpritesAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  if (spritesAvailable === null) {
    // Reserve the space so the layout doesn't jump while probing.
    return <div style={{ width: size, height: size }} />;
  }
  return spritesAvailable
    ? <PhotoMarina currentViseme={currentViseme} size={size} />
    : <MarinaSVG currentViseme={currentViseme} size={size} />;
}

// ---------------------------------------------------------------------------
// PhotoMarina — static base photo + mouth-region masked overlays.
//
// Why this design:
//   1. Earlier sprite-sheet (9 full-frame AI sprites cross-faded) flickered
//      because each AI-gen frame had subtle head-position / hair-drape /
//      skin-highlight differences from the others. Photometric normalization
//      reduced but didn't eliminate it.
//   2. SVG-mouth-overlay (parametric synthetic mouth painted onto a static
//      photo) looked clown-like because the synthetic lips couldn't match
//      the photo's natural lip color/shape, and the photo's real mouth
//      peeked out around the synthetic one.
//
//   This third design layers AI sprites on top of the static base photo
//   but applies a SOFT FEATHERED RADIAL MASK so only the MOUTH REGION of
//   the active sprite is visible. The face / hair / eyes / blouse /
//   background all come from the static base layer — they never change,
//   so they cannot flicker. The masked region is small enough (~18%
//   diameter) that any residual sprite-to-sprite drift stays contained
//   and reads as mouth motion, not exposure flicker.
//
//   Mouth content is REAL photo data (not synthetic), so it looks natural
//   against the surrounding face.
// ---------------------------------------------------------------------------

const SPRITE_BASE = '/avatars/marina-real';
const BASE_FRAME = 'marina_01_closed.png';

// Sprite frames in viseme-frame-index order (must match getVisemeFrameIndex).
// Frame 6 (blink) is reserved for speech-only blink overlay.
const SPRITE_FRAMES = [
  'marina_01_closed.png',  // 0
  'marina_02_slight.png',  // 1
  'marina_03_medium.png',  // 2
  'marina_04_wide.png',    // 3
  'marina_05_teeth.png',   // 4
  'marina_06_pursed.png',  // 5
  'marina_07_blink.png',   // 6  (speech-only blink)
  'marina_08_FV.png',      // 7  (reserved for char-level dispatch)
  'marina_10_TH.png',      // 8  (reserved for char-level dispatch)
];
const BLINK_FRAME_INDEX = 6;

// Soft feathered radial mask centered on Marina's mouth in the photo.
// Coordinates as percentages of the rendered container (1:1 square).
// Center sits slightly below Marina's natural lip line because when the
// mouth opens wide for "ah" / "oh" the lower lip drops further than the
// upper lip rises — so the geometric center of the OPEN mouth is below
// the geometric center of the CLOSED mouth. (50%, 53%) covers both the
// closed lip line above the center and the dropped lower lip below.
// Vertical extent (12%) is wide enough to enclose the maximum open
// mouth + feathering. Solid alpha inside the ellipse, fading to
// transparent at the edges so the boundary between overlay and base
// photo is invisible.
const MOUTH_MASK = 'radial-gradient(ellipse 16% 12% at 50% 53%, black 50%, transparent 95%)';

// Inject breathing keyframe once (style-element pattern matches ThinkingBubble.jsx).
function _ensureMarinaKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('#marina-photo-keyframes')) return;
  const sheet = document.createElement('style');
  sheet.id = 'marina-photo-keyframes';
  sheet.textContent = `
    @keyframes marina-breathe {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.012); }
    }
  `;
  document.head.appendChild(sheet);
}

function PhotoMarina({ currentViseme, size }) {
  const [blink, setBlink] = useState(false);
  const lastVisemeChangeRef = useRef(Date.now());
  const prevVisemeRef = useRef(currentViseme);

  useEffect(_ensureMarinaKeyframes, []);

  useEffect(() => {
    if (currentViseme !== prevVisemeRef.current) {
      lastVisemeChangeRef.current = Date.now();
      prevVisemeRef.current = currentViseme;
    }
  }, [currentViseme]);

  // Speech-only blink loop — see commentary on previous sprite-sheet
  // implementation. Idle blink causes flicker; speech-time blink is masked
  // by mouth motion and feels natural.
  useEffect(() => {
    let alive = true;
    const cycle = () => {
      if (!alive) return;
      const idle = Date.now() - lastVisemeChangeRef.current > 2000;
      if (idle) return;
      setBlink(true);
      setTimeout(() => { if (alive) setBlink(false); }, 110);
    };
    const interval = setInterval(cycle, 4500 + Math.random() * 1500);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const visemeFrameIdx = getVisemeFrameIndex(currentViseme);
  const activeIdx = blink ? BLINK_FRAME_INDEX : visemeFrameIdx;

  return (
    <div style={styles.container}>
      <div
        style={{
          width: size,
          height: size,
          position: 'relative',
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
          animation: 'marina-breathe 4s ease-in-out infinite',
          background: '#F4E1C9',
        }}
      >
        {/* Base layer: static photo — provides face / hair / eyes / blouse /
            background. Literally never changes; zero flicker possible here. */}
        <img
          src={`${SPRITE_BASE}/${BASE_FRAME}`}
          alt=""
          loading="eager"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Mouth-region overlays: each AI sprite, but masked to a small
            soft-edge ellipse around the mouth. Only the mouth pixels of the
            active sprite are visible; everywhere else, the base photo shows
            through. Cross-fades between overlays handle viseme transitions. */}
        {SPRITE_FRAMES.map((file, i) => (
          <img
            key={file}
            src={`${SPRITE_BASE}/${file}`}
            alt=""
            loading="eager"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: i === activeIdx ? 1 : 0,
              transition: 'opacity 150ms ease-out',
              userSelect: 'none',
              pointerEvents: 'none',
              WebkitMaskImage: MOUTH_MASK,
              maskImage: MOUTH_MASK,
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarinaSVG (Carnival) — stylized 2D cruise concierge (illustrated fallback).
// Body unchanged from iter-7. Used when branding.useSpriteAvatar is false
// OR when the sprite probe fails to find /avatars/marina-real/.
// ---------------------------------------------------------------------------

function MarinaSVG({ currentViseme, size }) {
  const [blinkState, setBlinkState] = useState(false);
  const [tilt, setTilt] = useState(0);

  // Blink every 3-5s
  useEffect(() => {
    const id = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, []);

  // Subtle head tilt every 4-6s (idle micro-animation)
  useEffect(() => {
    const id = setInterval(() => {
      const next = (Math.random() - 0.5) * 4; // ±2 degrees
      setTilt(next);
      setTimeout(() => setTilt(0), 1800);
    }, 4500 + Math.random() * 1800);
    return () => clearInterval(id);
  }, []);

  const surprised = currentViseme > 12;
  const eyeHeight = blinkState ? 1.5 : surprised ? 11 : 9;
  const eyeY = blinkState ? 49 : surprised ? 44 : 47;

  // Parametric mouth — see Visemes.js getVisemeParams.
  // openH 0..14, widthW 20..38, roundness 0..1
  const { openH, widthW, roundness } = getVisemeParams(currentViseme);
  // Mouth center on the lip line (after the +16 translate group)
  const MOUTH_CX = 60;
  const MOUTH_CY = 76;
  // Outer lip silhouette (always visible) — width and slight height come from params.
  const lipRX = widthW / 2;
  const lipRY = Math.max(2, openH * 0.55 + 2);
  // Inner mouth opening — only visible when opening enough to read.
  const innerRX = Math.max(1.5, lipRX * (0.55 - roundness * 0.20));
  const innerRY = Math.max(0.8, openH * 0.5);
  const showInterior = openH > 1.5;
  const showTeeth = currentViseme > 9 && openH > 5;
  const showTongue = roundness > 0.5 && openH > 3;
  // Cheeks brighten subtly as the mouth opens — feels like speech, not an animation cue.
  const cheekStrength = Math.min(0.22, 0.04 + openH * 0.013);

  // Carnival brand palette — literal hex, not theme-derived.
  // The previous fallback chain (hpeTheme.brand.red || .green || hex) resolved
  // to HPE green when brand.red was undefined, painting Marina's uniform green.
  const SKIN = '#F2C9A6';
  const SKIN_SHADE = '#D9A982';
  const HAIR = '#3B2F2A';
  const RED = '#B61B38';   // Extreme Lipstick
  const NAVY = '#014E8F';  // Special Blue
  const GOLD = '#FFC72C';  // Sun
  const LIPS = '#C84A5A';
  const LIP_SHADE = '#8E2A36';
  const MOUTH_INSIDE = '#3D0F18';
  const TONGUE = '#A8404D';

  // Smooth attribute interpolation — works for rx/ry/cx (unlike `d`).
  const mouthTransition = 'rx 90ms ease-out, ry 90ms ease-out, cx 90ms ease-out, opacity 90ms ease-out';

  return (
    <div style={styles.container}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 130"
        style={{
          ...styles.svg,
          transform: `rotate(${tilt}deg)`,
          transition: 'transform 1.6s cubic-bezier(.25,.8,.4,1)',
        }}
      >
        <defs>
          <radialGradient id="marina-halo" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#FFE6CC" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F8D6BA" stopOpacity="0.0" />
          </radialGradient>
          <linearGradient id="marina-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A3A33" />
            <stop offset="100%" stopColor={HAIR} />
          </linearGradient>
          <linearGradient id="marina-uniform" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C72443" />
            <stop offset="100%" stopColor={RED} />
          </linearGradient>
        </defs>

        <circle cx="60" cy="60" r="58" fill="url(#marina-halo)" />

        {/* Carnival-red uniform shoulders + collar */}
        <path
          d="M 18 130 Q 22 100 60 100 Q 98 100 102 130 Z"
          fill="url(#marina-uniform)"
        />
        {/* White collar */}
        <path
          d="M 35 100 Q 60 92 85 100 L 78 110 Q 60 104 42 110 Z"
          fill="white"
          opacity="0.94"
        />
        {/* Gold piping along the collar edge */}
        <path
          d="M 35 100 Q 60 92 85 100"
          stroke={GOLD}
          strokeWidth="1.1"
          fill="none"
          opacity="0.85"
        />
        {/* Whale-tail lapel pin (larger, more legible) */}
        <g transform="translate(74 106) scale(0.75)">
          <path
            d="M 0 0 Q 6 -8 12 0 Q 6 -2 0 0 Z"
            fill={GOLD}
            stroke={NAVY}
            strokeWidth="0.8"
          />
          <path d="M 4 -4 L 8 -4" stroke={NAVY} strokeWidth="0.4" opacity="0.6" />
        </g>

        {/* Hair back-layer (frames the face) */}
        <path
          d="M 22 70 Q 18 38 60 28 Q 102 38 98 72 L 96 84 Q 92 64 60 56 Q 28 60 24 80 Z"
          fill="url(#marina-hair)"
        />

        {/* Face */}
        <ellipse cx="60" cy="64" rx="32" ry="34" fill={SKIN} />
        {/* Right-side face shading */}
        <ellipse cx="74" cy="68" rx="14" ry="22" fill={SKIN_SHADE} opacity="0.18" />

        {/* Hair front fringe */}
        <path
          d="M 30 50 Q 40 36 60 38 Q 84 36 92 56 Q 84 46 70 48 Q 60 42 50 50 Q 40 48 30 50 Z"
          fill="url(#marina-hair)"
        />

        {/* Earrings (small gold drops below the hair line) */}
        <circle cx="29" cy="74" r="1.6" fill={GOLD} stroke={NAVY} strokeWidth="0.3" />
        <circle cx="91" cy="74" r="1.6" fill={GOLD} stroke={NAVY} strokeWidth="0.3" />

        {/* Eyebrows */}
        <path
          d={surprised ? 'M 40 38 Q 47 34 54 36' : 'M 40 41 Q 47 38 54 40'}
          stroke={NAVY}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'all 0.3s ease' }}
        />
        <path
          d={surprised ? 'M 66 36 Q 73 34 80 38' : 'M 66 40 Q 73 38 80 41'}
          stroke={NAVY}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'all 0.3s ease' }}
        />

        {/* Eyes */}
        <ellipse cx="48" cy={eyeY} rx="6" ry={eyeHeight} fill="white" />
        <ellipse cx="48" cy={eyeY} rx="3" ry={eyeHeight * 0.7} fill={NAVY} />
        <ellipse cx="49" cy={eyeY - 1.5} rx="0.9" ry="1.2" fill="white" />

        <ellipse cx="72" cy={eyeY} rx="6" ry={eyeHeight} fill="white" />
        <ellipse cx="72" cy={eyeY} rx="3" ry={eyeHeight * 0.7} fill={NAVY} />
        <ellipse cx="73" cy={eyeY - 1.5} rx="0.9" ry="1.2" fill="white" />

        {/* Cheek warmth — brightens with mouth open, reads as expressive */}
        <circle cx="42" cy="68" r="4.5" fill={RED} opacity={cheekStrength} />
        <circle cx="78" cy="68" r="4.5" fill={RED} opacity={cheekStrength} />

        {/* Tiny nose hint */}
        <path
          d="M 60 60 Q 62 68 60 72 Q 58 73 60 73"
          stroke={SKIN_SHADE}
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />

        {/* Mouth (viseme-driven, parametric, attribute-interpolated) */}
        <g transform="translate(0 8)">
          {/* Mouth interior — visible whenever lips part */}
          <ellipse
            cx={MOUTH_CX}
            cy={MOUTH_CY}
            rx={innerRX}
            ry={innerRY}
            fill={MOUTH_INSIDE}
            opacity={showInterior ? 1 : 0}
            style={{ transition: mouthTransition }}
          />
          {/* Teeth — upper row appears for open vowels */}
          {showTeeth && (
            <rect
              x={MOUTH_CX - innerRX * 0.85}
              y={MOUTH_CY - innerRY + 0.3}
              width={innerRX * 1.7}
              height={Math.min(2.6, innerRY * 0.55)}
              fill="white"
              opacity="0.92"
              rx="0.6"
            />
          )}
          {/* Tongue hint — fades in for rounded "oo"/"w" */}
          <ellipse
            cx={MOUTH_CX}
            cy={MOUTH_CY + innerRY * 0.35}
            rx={innerRX * 0.65}
            ry={Math.max(0.8, innerRY * 0.45)}
            fill={TONGUE}
            opacity={showTongue ? 0.85 : 0}
            style={{ transition: mouthTransition }}
          />
          {/* Lower lip (filled body) */}
          <ellipse
            cx={MOUTH_CX}
            cy={MOUTH_CY + lipRY * 0.45}
            rx={lipRX}
            ry={lipRY * 0.95}
            fill={LIPS}
            style={{ transition: mouthTransition }}
          />
          {/* Lower lip shadow — gives the lip dimension */}
          <ellipse
            cx={MOUTH_CX}
            cy={MOUTH_CY + lipRY * 0.85}
            rx={lipRX * 0.85}
            ry={lipRY * 0.4}
            fill={LIP_SHADE}
            opacity="0.55"
            style={{ transition: mouthTransition }}
          />
          {/* Upper lip — slightly thinner, sits above center */}
          <ellipse
            cx={MOUTH_CX}
            cy={MOUTH_CY - lipRY * 0.35}
            rx={lipRX * 0.95}
            ry={lipRY * 0.7}
            fill={LIPS}
            style={{ transition: mouthTransition }}
          />
          {/* Lipstick highlight — subtle gloss dot on the upper lip */}
          <ellipse
            cx={MOUTH_CX - 1.5}
            cy={MOUTH_CY - lipRY * 0.55}
            rx={Math.max(0.6, lipRX * 0.08)}
            ry="0.6"
            fill="white"
            opacity="0.55"
            style={{ transition: mouthTransition }}
          />
          {/* Lip seam — only visible when (nearly) closed */}
          <line
            x1={MOUTH_CX - lipRX + 1}
            y1={MOUTH_CY}
            x2={MOUTH_CX + lipRX - 1}
            y2={MOUTH_CY}
            stroke={LIP_SHADE}
            strokeWidth="0.7"
            strokeLinecap="round"
            opacity={openH < 2 ? 0.7 : 0}
            style={{ transition: 'opacity 90ms ease-out' }}
          />
        </g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zippy (HPE) — original green smiley
// ---------------------------------------------------------------------------

function ZippyClassic({ currentViseme, size }) {
  const [blinkState, setBlinkState] = useState(false);
  const [emotionState, setEmotionState] = useState('neutral');
  const canvasRef = useRef(null);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    if (currentViseme > 12) setEmotionState('surprised');
    else if (currentViseme > 5) setEmotionState('happy');
    else setEmotionState('neutral');
  }, [currentViseme]);

  const mouthPath = getVisemeShape(currentViseme);
  const eyeHeight = blinkState ? 2 : emotionState === 'surprised' ? 16 : 12;
  const eyeY = blinkState ? 35 : emotionState === 'surprised' ? 30 : 33;

  return (
    <div style={styles.container}>
      <svg
        ref={canvasRef}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        style={styles.svg}
      >
        <circle cx="60" cy="60" r="50" fill={hpeTheme.brand.green} stroke={hpeTheme.core.purple} strokeWidth="3" />
        <circle cx="55" cy="50" r="45" fill="none" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="2" />
        <ellipse cx="45" cy={eyeY} rx="8" ry={eyeHeight} fill="white" />
        <ellipse cx="45" cy={eyeY} rx="4" ry={eyeHeight * 0.6} fill={hpeTheme.core.purple} />
        <ellipse cx="75" cy={eyeY} rx="8" ry={eyeHeight} fill="white" />
        <ellipse cx="75" cy={eyeY} rx="4" ry={eyeHeight * 0.6} fill={hpeTheme.core.purple} />
        <path
          d={emotionState === 'surprised' ? 'M 36 26 Q 42 23 50 24' : 'M 36 28 Q 42 26 50 27'}
          stroke={hpeTheme.core.purple} strokeWidth="3" strokeLinecap="round" fill="none"
          style={{ transition: 'all 0.3s ease' }}
        />
        <path
          d={emotionState === 'surprised' ? 'M 70 24 Q 78 23 84 26' : 'M 70 27 Q 78 26 84 28'}
          stroke={hpeTheme.core.purple} strokeWidth="3" strokeLinecap="round" fill="none"
          style={{ transition: 'all 0.3s ease' }}
        />
        <path
          d={mouthPath} stroke={hpeTheme.core.purple} strokeWidth="3" strokeLinecap="round"
          fill={currentViseme > 6 ? 'rgba(255, 255, 255, 0.3)' : 'none'}
          style={{ transition: 'all 0.05s ease-out' }}
        />
        {currentViseme > 12 && (
          <rect x="52" y="65" width="16" height="8" fill="white" opacity="0.8" rx="1" />
        )}
        {emotionState === 'happy' && (
          <>
            <circle cx="35" cy="55" r="6" fill="rgba(255, 100, 100, 0.2)" />
            <circle cx="85" cy="55" r="6" fill="rgba(255, 100, 100, 0.2)" />
          </>
        )}
      </svg>
      <div style={styles.label}>Zippy</div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  svg: {
    filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.12))',
    transition: 'all 0.3s ease',
  },
  label: {
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.text.strong,
    letterSpacing: '0.05em',
  },
};
