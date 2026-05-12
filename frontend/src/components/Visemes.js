// Viseme mouth shape definitions
// Maps viseme IDs (0-20) to SVG path data for mouth shapes

export const VISEME_SHAPES = {
  // 0 - Silence/neutral (mouth closed)
  0: 'M 50 60 Q 60 60 70 60',

  // 1-3 - Small mouth openings (m, p, b sounds)
  1: 'M 48 60 Q 60 62 72 60',
  2: 'M 48 60 Q 60 63 72 60',
  3: 'M 47 60 Q 60 64 73 60',

  // 4-6 - Medium mouth openings (vowels like "eh")
  4: 'M 46 58 Q 60 66 74 58',
  5: 'M 45 58 Q 60 68 75 58',
  6: 'M 44 57 Q 60 70 76 57',

  // 7-9 - Wider mouth openings (vowels like "ah")
  7: 'M 43 56 Q 60 72 77 56',
  8: 'M 42 55 Q 60 74 78 55',
  9: 'M 41 54 Q 60 76 79 54',

  // 10-12 - Large mouth openings (open vowels)
  10: 'M 40 53 Q 60 78 80 53',
  11: 'M 39 52 Q 60 80 81 52',
  12: 'M 38 51 Q 60 82 82 51',

  // 13-15 - Very wide openings (teeth showing)
  13: 'M 37 50 Q 60 84 83 50',
  14: 'M 36 49 Q 60 86 84 49',
  15: 'M 35 48 Q 60 88 85 48',

  // 16-18 - Maximum openings
  16: 'M 34 47 Q 60 90 86 47',
  17: 'M 33 46 Q 60 92 87 46',
  18: 'M 32 45 Q 60 94 88 45',

  // 19-20 - Special shapes (rounded, pursed lips like "oo", "w")
  19: 'M 45 58 Q 52 65 60 65 Q 68 65 75 58',
  20: 'M 48 60 Q 54 63 60 63 Q 66 63 72 60',
};

// Fallback function to get viseme shape
export function getVisemeShape(id) {
  const visemeId = Math.max(0, Math.min(20, Math.round(id)));
  return VISEME_SHAPES[visemeId] || VISEME_SHAPES[0];
}

// Parametric mouth model used by the Marina renderer.
// Each viseme maps to (openH, widthW, roundness):
//   openH    — vertical lip-opening in px (0 closed, ~14 max)
//   widthW   — horizontal stretch in px  (24 pursed, 38 wide)
//   roundness — 0 (wide grin) … 1 (rounded "oo"/"w")
// Picked so phoneme classes are visually distinct: bilabials (1-3) read
// as visibly closed, open vowels (10-12) read as wide, rounded vowels
// (19-20) read as narrow + circular. Ellipse rx/ry/cx interpolate
// smoothly across viseme boundaries — unlike SVG `d` attributes.
const VISEME_PARAMS = {
  0:  { openH: 0,  widthW: 30, roundness: 0.2 },  // silence
  1:  { openH: 1,  widthW: 26, roundness: 0.3 },  // m
  2:  { openH: 1,  widthW: 26, roundness: 0.3 },  // p
  3:  { openH: 2,  widthW: 27, roundness: 0.3 },  // b
  4:  { openH: 4,  widthW: 30, roundness: 0.15 }, // ə
  5:  { openH: 5,  widthW: 32, roundness: 0.10 }, // e
  6:  { openH: 6,  widthW: 33, roundness: 0.05 }, // E
  7:  { openH: 8,  widthW: 34, roundness: 0.0 },  // s/z
  8:  { openH: 9,  widthW: 35, roundness: 0.0 },  // θ/k
  9:  { openH: 10, widthW: 36, roundness: 0.0 },  // æ
  10: { openH: 11, widthW: 37, roundness: 0.0 },  // a
  11: { openH: 12, widthW: 38, roundness: 0.0 },  // a (stronger)
  12: { openH: 13, widthW: 38, roundness: 0.0 },  // ɑ
  13: { openH: 13, widthW: 38, roundness: 0.0 },
  14: { openH: 14, widthW: 38, roundness: 0.0 },
  15: { openH: 14, widthW: 38, roundness: 0.0 },
  16: { openH: 14, widthW: 36, roundness: 0.05 },
  17: { openH: 14, widthW: 34, roundness: 0.10 },
  18: { openH: 13, widthW: 32, roundness: 0.15 },
  19: { openH: 7,  widthW: 22, roundness: 1.0 },  // o/ʊ — pursed
  20: { openH: 5,  widthW: 20, roundness: 1.0 },  // u/w — pursed
};

export function getVisemeParams(id) {
  const visemeId = Math.max(0, Math.min(20, Math.round(id)));
  return VISEME_PARAMS[visemeId] || VISEME_PARAMS[0];
}

// Photo-sprite frame index for the PhotoMarina renderer.
// Frames live in frontend/public/avatars/marina-real/ and map as:
//   0 = closed (silence, m/p/b)
//   1 = slight (e/ə/l + EE-fallback for visemes 5/6)
//   2 = medium (s/z/k/g)
//   3 = wide   (a/ɑ/max-open)
//   4 = teeth  (warm-vowel smile a/æ)
//   5 = pursed (o/u/w)
//   6 = blink  (idle overlay, NOT viseme-driven — see PhotoMarina blink loop)
//   7 = FV     (loaded but currently unreached; reserved for char-level dispatch)
//   8 = TH     (loaded but currently unreached; reserved for char-level dispatch)
//
// Frame 9 (EE) was intentionally skipped during asset gen — every regen
// either smiled or grimaced, so EE phonemes route to frame 1 (slight).
const VISEME_TO_FRAME = {
  0: 0,                       // silence
  1: 0, 2: 0, 3: 0,            // m, p, b (bilabials)
  4: 1, 5: 1, 6: 1,            // ə, e, l (also catches EE fallback)
  7: 2, 8: 2,                  // s, z, θ, k
  9: 4, 10: 4, 11: 4,          // a, æ → teeth (warm vowel)
  12: 3, 13: 3, 14: 3, 15: 3,  // ɑ → wide
  16: 3, 17: 3, 18: 3,         // max-open → wide
  19: 5, 20: 5,                // o, u, w (rounded)
};

export function getVisemeFrameIndex(visemeId) {
  return VISEME_TO_FRAME[Math.max(0, Math.min(20, Math.round(visemeId)))] ?? 0;
}

// Map common phonemes to viseme IDs (if server doesn't provide visemes)
export const PHONEME_TO_VISEME = {
  // Silence
  'sil': 0,
  'pau': 0,

  // Bilabials (lips together)
  'p': 1,
  'b': 1,
  'm': 1,

  // Labiodentals (lip-teeth)
  'f': 2,
  'v': 2,

  // Vowels - closed
  'i': 3,
  'I': 3,

  // Vowels - mid
  'e': 5,
  'E': 6,
  'ə': 4,

  // Vowels - open
  'a': 10,
  'æ': 9,
  'ɑ': 12,

  // Rounded vowels
  'o': 19,
  'u': 20,
  'ʊ': 19,

  // Consonants with teeth
  'θ': 8,
  'ð': 8,
  's': 7,
  'z': 7,

  // Other consonants
  't': 4,
  'd': 4,
  'n': 4,
  'l': 5,
  'r': 6,
  'k': 8,
  'g': 8,
  'ŋ': 8,
  'h': 7,
  'w': 20,
  'j': 3,
};

export default VISEME_SHAPES;
