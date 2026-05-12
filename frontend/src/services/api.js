import axios from "axios";

// Use relative URL in production (goes through nginx proxy)
// Set VITE_API_BASE_URL for local dev (e.g. http://localhost:8000)
// Empty string = relative URLs, which nginx proxies to the backend
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

export const transcribeAudio = async (audioBlob) => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.wav");

  const response = await api.post("/api/transcribe", formData);
  return response.data;
};

export const checkHealth = async () => {
  const response = await axios.get(`${API_BASE_URL}/health`);
  return response.data;
};

export const generate2DResponseElevenLabs = async (
  conversationUuid,
  messageHistory,
  onProgress,
) => {
  console.log("Generating 2D Avatar response with ElevenLabs");
  console.log("Conversation UUID:", conversationUuid);
  console.log("Message history:", messageHistory.length, "messages");

  const payload = {
    uuid: conversationUuid,
    messages: messageHistory,
  };

  const response = await api.post(
    "/api/generate-response-elevenlabs",
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const { bot_text, audio_b64, mime, visemes } = response.data;

  // Decode base64 audio to ArrayBuffer
  const audioBytes = Uint8Array.from(atob(audio_b64), (c) => c.charCodeAt(0));
  const audio = audioBytes.buffer;

  console.log("ElevenLabs TTS complete:", {
    audioSize: audio.byteLength,
    mime,
    visemes: visemes?.length || 0,
  });

  return {
    bot_text: bot_text,
    audio: audio,
    mime: mime || "audio/mpeg",
    visemes: visemes,
  };
};

// Onboard concierge agent (Carnival demo).
// Optional: imagePropId loads a backend prop image through Qwen Omni Vision before
// the agent turn; language drives Gemma Translate before TTS (en passes through);
// computeVisemes=true asks the backend to return a per-phoneme timing array so the
// 2D avatar can lipsync (3D HeyGen does its own lipsync — leave false there).
export const generateAgentResponseElevenLabs = async (
  conversationUuid,
  messageHistory,
  {
    imagePropId = null,
    imagePromptHint = null,
    language = "en",
    computeVisemes = false,
  } = {},
) => {
  const response = await api.post(
    "/api/agent-respond-elevenlabs",
    {
      uuid: conversationUuid,
      messages: messageHistory,
      image_prop_id: imagePropId,
      image_prompt_hint: imagePromptHint,
      language,
      compute_visemes: computeVisemes,
    },
    { headers: { "Content-Type": "application/json" } },
  );

  const {
    bot_text,
    spoken_text,
    audio_b64,
    mime,
    visemes,
    card_payload,
    folio_balance,
    suggestions,
    vision_unavailable,
  } = response.data;
  const audioBytes = Uint8Array.from(atob(audio_b64), (c) => c.charCodeAt(0));

  return {
    bot_text,                              // English transcript content
    spoken_text: spoken_text || bot_text,  // what the avatar voiced (may be translated)
    audio: audioBytes.buffer,
    mime: mime || "audio/mpeg",
    visemes: visemes || [],
    card_payload: card_payload || null,
    folio_balance: folio_balance ?? null,
    suggestions: suggestions || [],
    vision_unavailable: !!vision_unavailable,
  };
};

export const generate3DResponseLiveAvatar = async (
  conversationUuid,
  messageHistory,
) => {
  console.log("Generating 3D Avatar response with LiveAvatar");
  console.log("Conversation UUID:", conversationUuid);
  console.log("Message history:", messageHistory.length, "messages");

  // Use endpoint that returns PCM 24kHz audio for LiveAvatar
  const response = await api.post(
    "/api/generate-response-liveavatar",
    {
      uuid: conversationUuid,
      messages: messageHistory,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const { bot_text, audio_b64, mime } = response.data;

  // Decode base64 audio to ArrayBuffer
  const audioBytes = Uint8Array.from(atob(audio_b64), (c) => c.charCodeAt(0));
  const audioBuffer = audioBytes.buffer;

  console.log("LiveAvatar audio complete:", {
    audioSize: audioBuffer.byteLength,
    mime,
  });

  return {
    bot_text: bot_text,
    audio: audioBuffer,
    mime: mime || "audio/pcm",
  };
};

// LiveAvatar session management
export const createLiveAvatarSession = async (avatarId = null) => {
  const response = await api.post(
    "/api/liveavatar/session",
    {
      avatar_id: avatarId,
      mode: "CUSTOM",
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
};

// Build a signaling URL for LiveAvatar. Prefer backend proxy to bypass corporate WebSocket blocking.
export const buildLiveAvatarSignalingUrl = (sessionPath) => {
  // sessionPath example: "v2-alpha/interactive-avatar/session/<session_id>"
  // Prefer proxy: /ws/liveavatar/<sessionPath>
  // If backend is HTTPS, use wss; if backend is http, use ws.

  // Handle empty or relative API_BASE_URL (default to current host)
  let backendHost = API_BASE_URL;
  if (!backendHost || backendHost === "" || backendHost.startsWith("/")) {
    // Use current browser location
    backendHost = `${window.location.protocol}//${window.location.host}`;
  }

  const backendUrl = backendHost.replace(/^https?:\/\//, ""); // host:port
  const isSecure = backendHost.startsWith("https://");
  const wsProto = isSecure ? "wss" : "ws";

  // Proxy URL points to backend path that will relay to HeyGen signaling
  const proxyUrl = `${wsProto}://${backendUrl.replace(
    /\/$/,
    "",
  )}/ws/liveavatar/${sessionPath}`;

  // Direct upstream URL (fallback)
  const directUrl = `wss://webrtc-signaling.heygen.io/${sessionPath}`;

  return { proxyUrl, directUrl };
};

export const getLiveAvatarAvatars = async () => {
  const response = await api.get("/api/liveavatar/avatars");
  return response.data.avatars;
};

/**
 * Fetch pre-generated filler audio files for LiveAvatar.
 * Returns array of { id, text, audioBuffer (ArrayBuffer, PCM 24kHz) }
 */
export const fetchFillerAudios = async (lang = "en") => {
  const response = await api.get(`/api/filler-audio?lang=${lang}`);
  const { fillers } = response.data;
  return fillers.map((f) => {
    const audioBytes = Uint8Array.from(atob(f.audio_b64), (c) =>
      c.charCodeAt(0),
    );
    return {
      id: f.id,
      text: f.text,
      audioBuffer: audioBytes.buffer,
    };
  });
};

// ==============================================================================
// Streaming agent response (SSE)
// ==============================================================================

/**
 * Stream the concierge agent reply over SSE.
 *
 * callbacks:
 *   onDelta(text)  — called for each text_delta chunk
 *   onDone(event)  — called once with { card_payload, folio_balance,
 *                    suggestions, audio_b64, mime }
 */
export async function generateAgentResponseStream(
  conversationUuid,
  messageHistory,
  { language = "en" } = {},
  { onDelta, onDone } = {},
) {
  const res = await fetch(`${API_BASE_URL}/api/agent-respond-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uuid: conversationUuid,
      messages: messageHistory,
      language,
    }),
  });

  if (!res.ok) throw new Error(`Stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const raw = part.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const event = JSON.parse(raw);
        if (event.type === "text_delta") onDelta?.(event.text ?? "");
        if (event.type === "done") onDone?.(event);
      } catch (_) { /* ignore malformed line */ }
    }
  }
}

// ==============================================================================
// User Access Code Authentication
// ==============================================================================

const USER_AUTH_KEY = "aria_user_auth";
const GUEST_PHONE_KEY = "carnival_guest_phone";

export const isUserAuthenticated = () => sessionStorage.getItem(USER_AUTH_KEY) === "true";
export const setUserAuthenticated = () => sessionStorage.setItem(USER_AUTH_KEY, "true");
export const clearUserAuthenticated = () => sessionStorage.removeItem(USER_AUTH_KEY);

export const getStoredGuestPhone = () => sessionStorage.getItem(GUEST_PHONE_KEY);
export const storeGuestPhone = (phone) => sessionStorage.setItem(GUEST_PHONE_KEY, phone);
export const clearStoredGuest = () => {
  sessionStorage.removeItem(GUEST_PHONE_KEY);
  sessionStorage.removeItem(USER_AUTH_KEY);
};

// ==============================================================================
// Guest Dashboard API Functions
// ==============================================================================

export const lookupGuest = async (identifier) => {
  const response = await api.post(
    "/api/guest/lookup",
    { identifier },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const getReservations = async () => {
  const response = await api.get("/api/guest/reservations");
  return response.data;
};

export const getFolio = async () => {
  const response = await api.get("/api/guest/folio");
  return response.data;
};

export const cancelReservation = async (name) => {
  const response = await api.post(
    "/api/guest/reservations/cancel",
    { name },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const resetGuest = async (phone) => {
  const response = await api.post(
    "/api/guest/reset",
    phone ? { phone } : {},
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const userLogin = async (accessCode) => {
  const response = await api.post(
    "/api/user/login",
    { code: accessCode },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// ==============================================================================
// Admin Panel API Functions
// ==============================================================================

const ADMIN_TOKEN_KEY = "aria_admin_token";

// Get stored admin token
export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);

// Store admin token
export const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);

// Clear admin token
export const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

// Admin login
export const adminLogin = async (password) => {
  const response = await api.post(
    "/api/admin/login",
    { password },
    { headers: { "Content-Type": "application/json" } }
  );
  if (response.data.token) {
    setAdminToken(response.data.token);
  }
  return response.data;
};

// Validate admin session
export const validateAdminSession = async () => {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const response = await api.get(`/api/admin/validate?token=${token}`);
    return response.data.valid === true;
  } catch {
    clearAdminToken();
    return false;
  }
};

// Admin logout
export const adminLogout = async () => {
  const token = getAdminToken();
  if (token) {
    try {
      await api.post(
        "/api/admin/logout",
        { token },
        { headers: { "Content-Type": "application/json" } }
      );
    } catch {
      // Ignore errors on logout
    }
  }
  clearAdminToken();
};

// ============================================================================
// Model Settings API
// ============================================================================

export const getLLMConfig = async () => {
  const response = await api.get("/api/admin/get_llm");
  return response.data;
};

export const updateLLM = async (profile) => {
  const response = await api.post(
    "/api/admin/update_llm",
    { LLM_PROFILE: profile },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const getSystemConfig = async () => {
  const response = await api.get("/api/admin/get_config");
  return response.data;
};

export const updateSystemConfig = async (systemPrompt) => {
  const response = await api.post(
    "/api/admin/update_config",
    { SYSTEM_PROMPT: systemPrompt },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// Repair system config with default prompt (use when config is corrupted)
export const repairSystemConfig = async () => {
  const defaultPrompt = `You are ARIA, an AI Training Advisor powered by HPE AI Services.

Your role is to help learners and teams with:
- Training courses, learning paths, and onboarding journeys
- Skills development and certification guidance
- Training schedule and enrollment information
- Detailed training content retrieval from knowledge bases

Be precise, professional, and helpful in your responses. Provide specific course details and recommendations when available.`;

  const response = await api.post(
    "/api/admin/update_config",
    { SYSTEM_PROMPT: defaultPrompt },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// ============================================================================
// TTS Settings API
// ============================================================================

export const getTTSConfig = async () => {
  const response = await api.get("/api/admin/get_tts");
  return response.data;
};

export const updateTTS = async (provider, voiceId = null) => {
  const body = { TTS_PROVIDER: provider };
  if (voiceId) body.VOICE_ID = voiceId;
  const response = await api.post(
    "/api/admin/update_tts",
    body,
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const regenerateFillers = async (voiceId = null) => {
  const body = voiceId ? { voice_id: voiceId } : {};
  const response = await api.post(
    "/api/admin/regenerate_fillers",
    body,
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// ============================================================================
// RAG Settings API
// ============================================================================

export const getRAGConfig = async () => {
  const response = await api.get("/api/admin/get_rag");
  return response.data;
};

export const updateRAGConfig = async (profile, collections) => {
  const response = await api.post(
    "/api/admin/update_rag",
    { RAG_PROFILE: profile, RAG_COLLECTION: collections },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// ============================================================================
// Content Management API
// ============================================================================

export const listCollections = async () => {
  const response = await api.get("/api/admin/list_collections");
  return response.data;
};

export const createCollection = async (name) => {
  const response = await api.post(`/api/admin/create_collection/${name}`);
  return response.data;
};

export const deleteCollection = async (name) => {
  const response = await api.delete(`/api/admin/delete_collection/${name}`);
  return response.data;
};

export const listCollectionDocs = async (collection) => {
  const response = await api.get(`/api/admin/list_collection_docs/${collection}`);
  return response.data;
};

export const uploadParsedDocument = async (file, collection, metadata = {}) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("collection", collection);
  formData.append("metadata", JSON.stringify(metadata));
  const response = await api.post("/api/admin/add_parsed_document", formData);
  return response.data;
};

export const uploadUnparsedDocument = async (file, collection, metadata = {}) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("collection", collection);
  formData.append("metadata", JSON.stringify(metadata));
  const response = await api.post("/api/admin/add_unparsed_document", formData);
  return response.data;
};

export const deleteDocument = async (collection, documentId) => {
  const response = await api.delete(`/api/admin/delete_document/${collection}/${documentId}`);
  return response.data;
};

export const getDocumentDownloadUrl = async (collection, documentId) => {
  const response = await api.post(
    "/api/admin/assign_url_to_download",
    { collection, document_id: documentId },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

export const parseDocuments = async (collection) => {
  const response = await api.post(
    "/api/admin/parse_documents",
    { collection },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

// ==============================================================================
// End Admin Panel API Functions
// ==============================================================================

