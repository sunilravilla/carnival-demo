// Marenova Cruise Line brand palette — fictional, all-ages cruise brand.
// Toggled at runtime via VITE_DEMO_BRAND=marenova.
//
// Palette: deep sea-blue → aurora-teal, with a warm gold accent and a soft
// aurora violet for highlights. Distinct from Carnival (red/blue), Virgin
// (purple/red), and HPE (green).
//   Deep Sea  #0B3D5C — primary / dark anchor
//   Aurora    #18A0A8 — teal CTA / accent
//   Gold      #E8B04B — warm metallic accent (top-tier badges)
//   Violet    #5B4B8A — aurora highlight
import hpeTheme from "./hpeTheme";

const marenova = {
  ...hpeTheme,
  brand: {
    ...hpeTheme.brand,
    green:      "#18A0A8",   // Aurora teal — primary CTA (overrides HPE green)
    red:        "#18A0A8",   // accent alias → teal
    redDeep:    "#0E7C83",   // hover / active
    purple:     "#5B4B8A",   // aurora violet
    purpleLight:"#7D6CB0",
    viking:     "#3FB6C4",   // sea / wellness accent
    vikingLight:"#9BDDE6",
    gold:       "#E8B04B",   // warm metallic accent (used for top-tier badges)
    goldLight:  "#F3CE86",
    ink:        "#06283D",
    warmWhite:  "#F8FBFC",
    charcoal:   "#0B3D5C",
  },
  background: {
    ...hpeTheme.background,
    main:  "#F8FBFC",
    back:  "#EAF3F5",
    front: "#FFFFFF",
  },
  text: {
    ...hpeTheme.text,
    main:   "#06283D",
    strong: "#041C2C",
    weak:   "#4A5C66",
  },
  gradients: {
    ...hpeTheme.gradients,
    // Brand-signature: Deep Sea → Aurora teal. Evokes the open ocean meeting
    // the nightly Starlight light show.
    primary: "linear-gradient(135deg, #0B3D5C 0%, #18A0A8 100%)",
    sunset:  "linear-gradient(135deg, #E8B04B 0%, #18A0A8 55%, #0B3D5C 100%)",
    ocean:   "linear-gradient(135deg, #3FB6C4 0%, #0B3D5C 100%)",
    overlay: "linear-gradient(180deg, rgba(11,61,92,0.45) 0%, rgba(6,40,61,0.78) 100%)",
  },
  typography: {
    ...hpeTheme.typography,
    fontFamily:
      "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
};

export default marenova;
