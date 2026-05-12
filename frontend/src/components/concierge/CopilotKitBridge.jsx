// CopilotKit bridge for the Carnival concierge.
//
// Two responsibilities:
//   1. Push readable state (cruise/guest/folio/language) into the LLM's
//      context via useCopilotReadable so Marina answers questions like
//      "what's my cabin number" without our hand-rolled system prompt.
//   2. Expose a `runViaCopilot` function that ChatInterface uses INSTEAD of
//      its fetch to /api/agent-respond-elevenlabs when branding.useCopilotKit
//      is true. The function appends the user message to the LangGraph
//      messages list, runs the agent, and returns the same shape the legacy
//      helper does (bot_text, audio, mime, visemes, card_payload).
//
// The legacy fetch path stays in ChatInterface as the default — flipping
// branding.useCopilotKit to true switches every 2D request to this bridge.
import { useCallback, useEffect, useRef } from "react";
import { useCoAgent, useCopilotReadable } from "@copilotkit/react-core";

const GUEST_PROFILE = {
  name: "Mr. and Mrs. Garcia",
  primary_first_name: "Diego",
  cabin: "8245",
  deck: 8,
  vifp_tier: "Gold",
  party_size: 2,
};

const CRUISE_CONTEXT = {
  ship: "Carnival Celebration",
  itinerary: "7-Night Western Caribbean",
  current_day: 4,
  total_days: 7,
  next_port: "Cozumel, Mexico",
  next_port_arrival: "2026-05-06 09:00",
};

export function useCarnivalCopilotKitBridge({ language, computeVisemes = true }) {
  // ----- Readable state injected into Marina's system prompt -----
  useCopilotReadable({
    description:
      "Currently sailing Carnival cruise. Day count and next port matter for any " +
      "scheduling or excursion questions.",
    value: JSON.stringify(CRUISE_CONTEXT),
  });

  useCopilotReadable({
    description:
      "Guest profile of the person speaking — name, cabin, party size, VIFP tier. " +
      "Use cabin number when asked.",
    value: JSON.stringify(GUEST_PROFILE),
  });

  useCopilotReadable({
    description: "Spoken language preference for TTS playback.",
    value: language,
  });

  // ----- LangGraph state mirror -----
  const { state, setState, run } = useCoAgent({
    name: "marina",
    initialState: {
      language,
      compute_visemes: computeVisemes,
      cruise: CRUISE_CONTEXT,
      guest: GUEST_PROFILE,
    },
  });

  // Keep LangGraph state in sync with React-side language toggle.
  const lastLangRef = useRef(language);
  useEffect(() => {
    if (lastLangRef.current !== language) {
      setState({ ...state, language });
      lastLangRef.current = language;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Replacement for ChatInterface's _run2DPipeline. Appends the user message,
  // runs the graph, waits for the assistant message, returns the response in
  // the legacy shape so call-sites don't have to fork their handlers.
  const runViaCopilot = useCallback(
    async ({ userText, imagePropId = null, imagePromptHint = null } = {}) => {
      const messages = [...(state?.messages || [])];
      if (userText) {
        messages.push({
          id: `m-${Date.now()}`,
          role: "user",
          content: userText,
        });
      }

      // run() is async and resolves when the LangGraph reaches END.
      await run(() => ({
        ...state,
        messages,
        language,
        compute_visemes: computeVisemes,
        image_prop_id: imagePropId,
        image_prompt_hint: imagePromptHint,
      }));

      // After run() resolves, state holds the latest STATE_SNAPSHOT.
      const finalState = state;
      const assistantMsg = (finalState?.messages || [])
        .slice()
        .reverse()
        .find((m) => m.role === "assistant" || m.type === "ai");
      const botText = assistantMsg?.content || "How can I help?";

      const audioB64 = finalState?.audio_b64 || "";
      const audioBytes = audioB64
        ? Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0))
        : new Uint8Array();

      return {
        bot_text: botText,
        spoken_text: finalState?.spoken_text || botText,
        audio: audioBytes.buffer,
        mime: finalState?.mime || "audio/mpeg",
        visemes: finalState?.visemes || [],
        card_payload: finalState?.card_payload || null,
        vision_unavailable: !!finalState?.vision_unavailable,
      };
    },
    [state, run, language, computeVisemes],
  );

  return { runViaCopilot, copilotState: state, setCopilotState: setState };
}
