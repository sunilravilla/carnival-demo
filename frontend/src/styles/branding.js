// Centralised brand selection for the demo.
// Set VITE_DEMO_BRAND=carnival in the frontend env to enable the Carnival demo skin.
// Falls back to HPE/ARIA branding for the default codebase.
import hpeTheme from "./hpeTheme";
import carnivalTheme from "./carnivalTheme";

const brand = (import.meta.env.VITE_DEMO_BRAND || "hpe").toLowerCase();

export const isCarnival = brand === "carnival";

export const activeTheme = isCarnival ? carnivalTheme : hpeTheme;

export const branding = isCarnival
  ? {
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
      // Disabled until Qwen Omni Vision is back online and prop JPEGs are dropped
      // into frontend/public/demo-props/ + backend/app/data/demo_props/.
      enableShowThis: false,
      // CopilotKit / AG-UI provider wrapper. When true, ChatInterface mounts
      // <CopilotKit runtimeUrl="/api/copilotkit"> and shares cruise/guest/folio
      // state with the LLM via useCopilotReadable. Keep false until the
      // backend deps + endpoint are verified live (see SESSION_HANDOFF.md).
      useCopilotKit: false,
      defaultLanguage: "en",
      // Toggle between photo-realistic sprite-sheet Marina (true) and the
      // illustrated SVG Marina (false). Default true; flip to false to
      // revert to the SVG character without code changes. PhotoMarina
      // also auto-falls-back to the SVG if any sprite file is missing.
      useSpriteAvatar: true,
    }
  : {
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
    };

export default activeTheme;
