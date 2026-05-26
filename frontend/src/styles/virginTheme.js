// Virgin Voyages brand palette — OFFICIAL brand colors.
// Toggled at runtime via VITE_DEMO_BRAND=virgin.
//
// Source: Virgin Voyages brand guidelines
//   Guardsman Red #CC0000 — primary CTA / accent (RGB 204, 0, 0)
//   Viking       #6DBDD6 — sea/wellness accent  (RGB 109, 189, 214)
//   Tolopea      #2E0444 — premium/dark accent  (RGB  46,   4,  68)
import hpeTheme from "./hpeTheme";

const virgin = {
  ...hpeTheme,
  brand: {
    ...hpeTheme.brand,
    green:    "#CC0000",     // Guardsman Red — primary CTA (overrides HPE green)
    red:      "#CC0000",     // Guardsman Red
    redDeep:  "#9A0000",     // hover / active
    purple:   "#2E0444",     // Tolopea
    purpleLight: "#4A1568",
    viking:   "#6DBDD6",     // Viking — sea / wellness accent
    vikingLight: "#A8DAE6",
    gold:     "#D4A862",     // warm metallic accent (used for top-tier badges)
    goldLight:"#E8C988",
    ink:      "#0A0A0A",
    warmWhite:"#FAFAF7",
    charcoal: "#1A1A1A",
  },
  background: {
    ...hpeTheme.background,
    main:  "#FAFAF7",
    back:  "#F2EEE7",
    front: "#FFFFFF",
  },
  text: {
    ...hpeTheme.text,
    main:   "#0A0A0A",
    strong: "#000000",
    weak:   "#4A4A4A",
  },
  gradients: {
    ...hpeTheme.gradients,
    // Brand-signature: Tolopea → Guardsman Red. Tolopea anchors the brand
    // 'late-night' luxury feeling; the red is the headline accent.
    primary: "linear-gradient(135deg, #2E0444 0%, #CC0000 100%)",
    sunset:  "linear-gradient(135deg, #D4A862 0%, #CC0000 55%, #2E0444 100%)",
    ocean:   "linear-gradient(135deg, #6DBDD6 0%, #2E0444 100%)",
    overlay: "linear-gradient(180deg, rgba(46,4,68,0.55) 0%, rgba(10,10,10,0.75) 100%)",
  },
  typography: {
    ...hpeTheme.typography,
    fontFamily:
      "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
};

export default virgin;
