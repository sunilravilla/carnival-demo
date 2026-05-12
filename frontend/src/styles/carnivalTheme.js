// Carnival Cruise Line brand palette + reused HPE theme primitives.
// Toggled at runtime via VITE_DEMO_BRAND=carnival.
import hpeTheme from "./hpeTheme";

const carnival = {
  ...hpeTheme,
  brand: {
    ...hpeTheme.brand,
    green: "#B61B38",      // Carnival "Extreme Lipstick" red — overrides primary accent
    red: "#B61B38",
    blue: "#014E8F",       // Carnival "Special Blue"
    sand: "#F5E8C7",
    sun: "#FFC72C",
  },
  gradients: {
    ...hpeTheme.gradients,
    primary: "linear-gradient(135deg, #B61B38 0%, #014E8F 100%)",
    sunset: "linear-gradient(135deg, #FFC72C 0%, #B61B38 60%, #014E8F 100%)",
  },
};

export default carnival;
