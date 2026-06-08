// Centralised brand selection for the demo.
// Set VITE_DEMO_BRAND=carnival | virgin | marenova | hpe in the frontend env.
// Default = hpe (the upstream codebase).
import hpeTheme from "./hpeTheme";
import carnivalTheme from "./carnivalTheme";
import virginTheme from "./virginTheme";
import marenovaTheme from "./marenovaTheme";

const brand = (import.meta.env.VITE_DEMO_BRAND || "hpe").toLowerCase();

export const isCarnival = brand === "carnival";
export const isVirgin = brand === "virgin";
export const isMarenova = brand === "marenova";
export const isHpe = !isCarnival && !isVirgin && !isMarenova;

export const activeTheme = isVirgin
  ? virginTheme
  : isMarenova
  ? marenovaTheme
  : isCarnival
  ? carnivalTheme
  : hpeTheme;

const virginBranding = {
  logoText: "Virgin Voyages",
  headerTitle: "Sailor App",
  headerSubtitle: "It's Not a Cruise · Adult by Design",
  avatarName: "Marina",
  avatarRole: "Your Sailor Concierge",
  avatarInitials: "MA",
  emptyHeadline: "Honey, you're home.",
  emptySubtext:
    'Try: "Bring me a bottle to the pool" — or shake your phone. Marina\'s listening.',
  conversationTitle: "Chat with Marina",
  inputPlaceholder: "Ask Marina…",
  useAgentEndpoint: true,
  enableShowThis: false,
  useCopilotKit: false,
  defaultLanguage: "en",
  // Sprite-sheet avatar built for Carnival's Marina — disable for Virgin until a
  // dedicated sprite ships; SVG/initials fallback is on-brand enough for the demo.
  useSpriteAvatar: false,
  // Visual assets — official Virgin Voyages logo + Scarlet Lady photo.
  logo: "/virgin-logo.jpg",
  logoWhite: "/virgin-logo-white.svg",
  heroImage: "/scarlet-lady-hero.jpg",
  // Tolopea → Guardsman Red is the signature brand gradient.
  headerGradient: "linear-gradient(135deg, #2E0444 0%, #CC0000 100%)",
  // Subtle so the Scarlet Lady photo shines through, with just enough darkening
  // at the bottom for white text legibility.
  heroOverlay: "linear-gradient(180deg, rgba(46,4,68,0.30) 0%, rgba(10,10,10,0.70) 100%)",
  tierLabel: "Sailor",  // "Mega RockStar Sailor", "Sea Terrace Sailor"
  tierColors: {
    "Mega RockStar": "#D4A862",   // gold — most prestigious
    "RockStar":      "#2E0444",   // Tolopea — deep prestige
    "Sea Terrace":   "#1A1A1A",   // charcoal — contrasts the red header
    "Sea View":      "#6DBDD6",   // Viking blue — fresh sea-view
    "Insider":       "#8A8A8A",   // neutral
  },
  accentColor: "#CC0000",
  goldColor: "#D4A862",
  quickChips: [
    { icon: "🍽️", label: "Book Extra Virgin for 7:30" },
    { icon: "🎭", label: "2 seats for Persephone tonight" },
    { icon: "🥂", label: "Shake — bring me champagne" },
    { icon: "💃", label: "What should I wear for Scarlet Night?" },
    { icon: "🎧", label: "What's on at The Manor tonight?" },
  ],
};

const marenovaBranding = {
  logoText: "Marenova",
  headerTitle: "Marenova Aurora",
  headerSubtitle: "Your Sea. Your Story.",
  avatarName: "Marina",
  avatarRole: "Your Onboard Concierge",
  avatarInitials: "MA",
  emptyHeadline: "Welcome aboard!",
  emptySubtext:
    'Try: "Book Bella Mare for 7:30" — or shake your phone for a treat. Marina\'s listening.',
  conversationTitle: "Chat with Marina",
  inputPlaceholder: "Ask Marina…",
  useAgentEndpoint: true,
  enableShowThis: false,
  useCopilotKit: false,
  defaultLanguage: "en",
  // SVG/initials avatar fallback — no dedicated sprite for Marenova yet.
  useSpriteAvatar: false,
  // Visual assets — Marenova logo + Aurora ship photo (placeholder SVG/JPG in public/).
  logo: "/marenova-logo.svg",
  logoWhite: "/marenova-logo-white.svg",
  heroImage: "/marenova-ship-hero.jpg",
  // Deep Sea → Aurora teal is the signature brand gradient.
  headerGradient: "linear-gradient(135deg, #0B3D5C 0%, #18A0A8 100%)",
  heroOverlay:
    "linear-gradient(180deg, rgba(11,61,92,0.35) 0%, rgba(6,40,61,0.75) 100%)",
  tierLabel: "Star", // "Aurora Suite", "Balcony" etc.
  tierColors: {
    "Aurora Grand Suite": "#E8B04B", // gold — most prestigious
    "Aurora Suite":       "#5B4B8A", // aurora violet — prestige
    "Balcony":            "#0B3D5C", // deep sea — most common tier
    "Ocean View":         "#3FB6C4", // sea teal
    "Interior":           "#8A9BA3", // neutral
  },
  accentColor: "#18A0A8",
  goldColor: "#E8B04B",
  quickChips: [
    { icon: "🍽️", label: "Book Bella Mare for 7:30" },
    { icon: "🎭", label: "2 seats for Odyssey tonight" },
    { icon: "🍦", label: "Shake — bring me a treat" },
    { icon: "✨", label: "What to wear for the Starlight Deck Party?" },
    { icon: "🎶", label: "What's playing at the Starlight Lounge?" },
  ],
};

const carnivalBranding = {
  logoText: "Carnival",
  headerTitle: "Onboard AI Concierge",
  headerSubtitle: "",
  avatarName: "Marina",
  avatarRole: "Your Onboard Guide",
  avatarInitials: "MA",
  emptyHeadline: "Welcome aboard, Garcia family",
  emptySubtext:
    'Try: "Book me a table at the Italian place at 7:30" — voice or text.',
  conversationTitle: "Concierge Chat",
  inputPlaceholder: "Ask Marina…",
  useAgentEndpoint: true,
  enableShowThis: false,
  useCopilotKit: false,
  defaultLanguage: "en",
  useSpriteAvatar: true,
  logo: "/carnival-logo.png",
  logoWhite: "/carnival-logo-white.png",
  heroImage: "/carnival-ship-hero.jpg",
  headerGradient: "linear-gradient(135deg, #B61B38 0%, #014E8F 100%)",
  heroOverlay: "linear-gradient(to bottom, rgba(10,39,68,0.55) 0%, rgba(1,78,143,0.75) 100%)",
  tierLabel: "VIFP",
  tierColors: { Platinum: "#6B7CFF", Gold: "#C8952A", Red: "#B61B38" },
  accentColor: "#FFC72C",
  goldColor: "#FFC72C",
  quickChips: [
    { icon: "🍽️", label: "Book Italian for 7:30" },
    { icon: "🎭", label: "2 seats for 9 PM comedy" },
    { icon: "⛵", label: "What time is the Cozumel snorkel?" },
    { icon: "💳", label: "What have I spent so far?" },
    { icon: "🥂", label: "Add CHEERS! for the rest of the cruise" },
  ],
};

const hpeBranding = {
  logoText: "HPE",
  headerTitle: "ARIA – AI Product Advisor",
  headerSubtitle: "Powered by HPE AI Services • AI Factory Portfolio",
  avatarName: "ARIA",
  avatarRole: "AI-Powered Product Advisor",
  avatarInitials: "AR",
  emptyHeadline: "Welcome to HPE AI Factory",
  emptySubtext:
    "Ask ARIA about the HPE AI Factory Portfolio — in English or Spanish.",
  conversationTitle: "Conversation History",
  inputPlaceholder:
    "Ask about HPE AI Factory... / Pregunta sobre HPE AI Factory...",
  useAgentEndpoint: false,
  enableShowThis: false,
  defaultLanguage: "en",
  useSpriteAvatar: false,
  logo: "/carnival-logo.png",
  logoWhite: "/carnival-logo-white.png",
  heroImage: "/carnival-ship-hero.jpg",
  headerGradient: "linear-gradient(135deg, #01a982 0%, #00739d 100%)",
  heroOverlay: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.6) 100%)",
  tierLabel: "Tier",
  tierColors: {},
  accentColor: "#01a982",
  goldColor: "#FFC72C",
};

export const branding = isVirgin
  ? virginBranding
  : isMarenova
  ? marenovaBranding
  : isCarnival
  ? carnivalBranding
  : hpeBranding;

export default activeTheme;
