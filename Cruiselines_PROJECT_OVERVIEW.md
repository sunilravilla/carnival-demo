# AI Cruise Concierge — Carnival & Virgin Voyages Demos

A production-style, multi-brand **agentic AI concierge** for cruise lines: a mobile web app where a guest books dining, shows, spa, champagne, outfits and more by chatting (voice or text) with an LLM agent that renders rich generative-UI cards and takes real actions. One codebase reskins across **Carnival**, **Virgin Voyages**, and **HPE** brands. Shipped with a deployable backend/frontend, an e2e test suite, and a 5-minute Remotion sizzle video generated from *real* agent responses.

> **Stack at a glance:** React 18 + Vite PWA · FastAPI (Python) · Anthropic Claude Sonnet 4.5 (JSON tool-calling) · ElevenLabs ASR/TTS · Open-Meteo · HeyGen avatar · Playwright · Remotion · Vercel + Railway + Docker.

---

## Résumé / Portfolio bullets (copy-paste)

**Short bullets**
- Built an **agentic AI concierge** (Anthropic Claude Sonnet 4.5) with **30+ JSON tool-calls** that take real booking actions and stream **generative-UI cards** (dining, shows, spa, champagne, outfit, weather, voyage diary) into a React PWA.
- Designed a **single-codebase multi-brand system** (Carnival / Virgin Voyages / HPE) driven by one env var — theming, copy, personas, feature flags, and backend prompts all switch at build time.
- Engineered a **two-pass agent loop** (tool-selection → tool-dispatch → natural-language finalize) with **ephemeral prompt caching**, deterministic fallbacks, and humanized error handling so the avatar never shows a raw error.
- Implemented **voice-first, multilingual UX** — ElevenLabs Scribe ASR + Turbo TTS with viseme lip-sync, automatic Spanish detection, and translated speech output.
- Added signature interactions: **"shake-your-phone-for-champagne"** (DeviceMotion gesture), **"Tonight's Look"** outfit macro that books salon + table + cocktail in one turn, and live **port weather** on the dashboard.
- Stood up a **Playwright e2e suite (16 specs)** including an automated **brand-leak guard** that fails the build if one brand's copy bleeds into another.
- Produced a **5-minute Remotion marketing video** with a **data-driven timeline** auto-synced to measured TTS audio, using transcripts **captured live from the running agent**.
- Deployed via **Vercel (frontend) + Railway (backend) + Docker Compose**, with branch-scoped auto-deploy.

**One-paragraph project summary**
> Designed and built a multi-brand, voice-enabled AI concierge for cruise lines. A FastAPI backend wraps Anthropic Claude in a two-pass JSON tool-calling loop exposing 30+ real actions (bookings, folio, spa, champagne, multi-step "macro" experiences), returning rich cards rendered by a React 18 PWA. The same codebase reskins across Carnival, Virgin Voyages, and HPE from a single configuration switch. Hardened with prompt caching, deterministic fallbacks, a Playwright e2e suite with brand-leak detection, and a Remotion-generated demo video driven by transcripts captured from the live agent. Deployed on Vercel + Railway.

---

## 1. What these demos are

| | **Carnival demo** (`main`) | **Virgin Voyages demo** (`virgin-voyages`) |
|---|---|---|
| Persona | Marina, Carnival concierge | Marina (renamed from "Ruby"), "Sailor" concierge on *Scarlet Lady* |
| Scope | Foundational concierge: dining, shows, spa, folio, drink packages | Full reskin + **5 "waves"** of new capabilities, hero moments, QA |
| Signature features | Core bookings + live weather dashboard | Shake-for-Champagne, Tonight's Look macro, Manor Shazam, Surprise Mode, Squad Event, Voyage Diary, Recovery Menu, Packing List, Bimini pre-book, Spanish |
| Status | Base build | Active/deployed branch (Vercel auto-deploys this branch only) |

The Virgin branch adds **9 commits / 81 files / +7,556 −709** over `main` — a substantial agent + UI + asset + test + docs expansion, not just a paint job. A third brand, **HPE ARIA** (an AI product advisor), shares the same shell, showing the architecture generalizes beyond cruising.

## 2. Architecture

```
  Guest (mobile PWA)
        │  voice / text
        ▼
  React 18 + Vite frontend ──► branding.js (brand switch) ──► themed UI + generative cards
        │  POST /api/agent-respond(-stream)  (SSE)
        ▼
  FastAPI backend
        ├─ ASR (ElevenLabs Scribe)        ── voice → text (+ language)
        ├─ Agent (Claude Sonnet 4.5)      ── two-pass JSON tool-calling loop
        │     ├─ Phase 1: pick tool + args + "say" + hints
        │     ├─ dispatch one of 30+ tools (ship_data + external APIs)
        │     └─ Phase 2: finalize natural reply (+ card payload)
        ├─ TTS (ElevenLabs Turbo + visemes)
        ├─ Weather (Open-Meteo, live)
        └─ Avatar (HeyGen LiveAvatar, WebRTC)   [optional]
        ▼
  In-memory ship/guest data (JSON + mock registry), optional MongoDB config store
```

### Frontend (`frontend/`)
- **React 18 + Vite** PWA (manifest, maskable icons, standalone display, mobile viewport); inline-style design system, React Context for guest state (no heavy state lib).
- **Multi-brand theming** — `src/styles/branding.js` reads `VITE_DEMO_BRAND` and returns one object holding *all* per-brand logos, gradients, tier labels, copy, quick-chips, avatar identity, and **feature flags** (`useAgentEndpoint`, `useSpriteAvatar`, `useCopilotKit`, `enableShowThis`). Components never hardcode a brand.
- **Generative-UI card system** — `concierge/ConciergeCards.jsx` renders ~16 card types from agent payloads (dining, show, excursion, folio, weather two-column, drink-package picker, outfit suggestion, salon, champagne, spa, cancel, voyage diary, recovery menu, error), with `.ics` calendar export and entrance animations.
- **Dashboard** — hero, voyage progress, **TodayCard** (live Open-Meteo weather + port ETA countdown), reservations, folio, and Virgin-only modules (RockStar perks, Tonight's Look, Shake-for-Champagne, Now Playing at The Manor).
- **Voice & i18n** — mic capture with live waveform, ElevenLabs transcription, heuristic Spanish detection → translated TTS; UI chrome stays per-brand.

### Backend (`backend/`) — the agent
- **FastAPI** app; **Anthropic Claude Sonnet 4.5** via a thin SDK wrapper (`llm_client.py`) with **ephemeral prompt caching** of the ~12 KB system prompt.
- **`agent_service.py` (2,610 lines)** implements a deterministic **two-pass loop**: (1) JSON-mode call returns `{tool, args, say, hints}`; (2) dispatch the named tool, then a **finalize pass** rewrites the tool result into a warm, specific guest reply. A deterministic template and **humanized error pass** guarantee the concierge never emits raw errors or leaked reasoning.
- **System prompt** = static ship knowledge + tool registry + live session state (guest name, folio, reservations) + ~20 few-shot routing examples (e.g., time-change → `modify_dining`, never `book_dining`).
- **Supporting services**, honestly scoped: **real** — ElevenLabs ASR/TTS (with viseme alignment + fallback), Open-Meteo weather, HeyGen avatar, MongoDB-or-in-memory config store; **demo/stubbed for future** — Qwen vision captioning, Gemma translation, Qdrant/TEI RAG (graceful degradation throughout).
- **Data layer** — JSON ship data (cruise, restaurants, shows, excursions, drink packages) + a 10-persona mock guest registry with per-guest mutation and reset, so the demo behaves like a stateful system without a database.

### The agent tool catalog (30+)
Bookings & account: `book_dining`, `modify_dining`, `book_show`, `cancel_reservation`, `switch_reservation`, `get_my_reservations`, `get_folio`, `recommend_drink_packages`, `upgrade_drink_package`. Spa/wellness: `book_spa_treatment`, `get_spa_options`, `hangover_recovery_menu`, `book_recovery_item`. Experiences (Virgin "macros" returning multiple cards in one turn): `suggest_outfit`, `land_the_look` (outfit + salon + Manor table + cocktail), `arrange_surprise` (flowers + dining + champagne), `create_squad_event`, `prebook_bimini_day`, `get_voyage_diary`, `generate_packing_list`. Beverage & ship: `order_champagne`, `recommend_pre_show_drink`, `recommend_drink_now`, `identify_now_playing` (Shazam + Branson trivia), `get_weather`, `get_today_schedule`, `get_excursion`, `get_ship_info`, `get_wifi_options`.

## 3. Engineering highlights (the impressive bits)
- **Two-pass agent with safety nets** — tool-selection vs. natural-language are separated; every failure mode (bad JSON, tool error, leaked chain-of-thought) has a deterministic fallback, so the UX never breaks.
- **One codebase → three brands** — env-driven theming + feature flags + brand-specific backend personas; adding a brand is data, not forks.
- **Generative UI** — the backend drives the interface: tools return typed card payloads the frontend renders, including multi-card "macro" turns.
- **Live, stateful demo** — mutable in-memory guest/folio/reservations with reset; live weather; conflict warnings (e.g., dinner vs. show timing).
- **Quality gates** — Playwright e2e (16 specs) with a **brand-leak guard** (forbidden-string scan) preventing cross-brand copy bleed; perf audit docs (Sonnet single-card ≈8s, macros ≈11s, with caching).
- **Polished delivery** — PWA install, voice, gesture input, and a broadcast-quality video pipeline.

## 4. The demo video (`virgin-demo-video`, Remotion)
- **~5-minute, 1920×1080** flagship video built in **Remotion + TypeScript** as a dual-panel layout (recreated iPhone UI + narration / HPE×Virgin co-brand).
- **Authentic content** — `scripts/capture-app.mjs` hits the live backend's SSE endpoint and records the agent's *real* responses, cards, and audio into `src/captured/transcript.json`.
- **Data-driven timeline** — `scripts/generate-audio.mjs` synthesizes narrator + concierge voiceover (ElevenLabs) and measures every clip's duration; `sceneAudioMap.ts` computes scene/cut timings from those durations, so re-recording audio re-fits the edit automatically — **no manual keyframing**.
- **15 scenes (S01–S15)** walking cold-open → QR lookup → dashboard → each hero capability → multilingual → HPE×Virgin close; rendered to `out/virgin-demo.mp4`.

## 5. Deployment & infra
- **Frontend:** Vercel (Vite preset, `frontend/` root), branch-scoped auto-deploy (only `virgin-voyages` deploys; `main` ignored). Docker (nginx) alternative.
- **Backend:** Railway (Docker, Python 3.11 + ffmpeg, `/health` checks, `$PORT`).
- **Local:** `docker-compose` (MongoDB + backend + frontend).
- **Config:** env-driven secrets (Anthropic, ElevenLabs, admin), `VITE_DEMO_BRAND` + `DEMO_BRAND` to select brand.

## 6. Tech stack
| Layer | Tech |
|---|---|
| Frontend | React 18.2, Vite 5, PWA, lucide-react, axios, (CopilotKit 1.10 optional) |
| Backend | FastAPI, Python 3.11, Pydantic, httpx, loguru |
| AI | Anthropic Claude Sonnet 4.5 (JSON tool-calling, ephemeral caching) |
| Voice | ElevenLabs Scribe (ASR) + Turbo v2.5 (TTS, visemes) |
| Data/APIs | Open-Meteo (live weather), HeyGen LiveAvatar; Qwen/Gemma/Qdrant (stubbed) |
| Testing | Playwright (16 e2e specs, brand-leak guard) |
| Video | Remotion 4, TypeScript, ffmpeg-static, ElevenLabs |
| Deploy | Vercel, Railway, Docker / docker-compose |

## 7. Scope & notable problems solved
- **Scale:** agent service 2,610 lines; ~16 generative card types; 9 commits / 81 files / +7,556 lines for the Virgin layer; 10 guest personas; ~5-min video from 15 scenes.
- **Brand rename (Ruby → Marina):** executed across app *and* video — UI copy, backend prompts, tests (incl. updating the brand-leak allow-list), plus **regenerating only the affected TTS clips** and **re-rendering** the video; renamed the look to "Crimson Tuxedo" for thematic consistency.
- **Live weather fix:** dashboard weather silently failed when the port label wasn't in a lookup table; added coordinates + a safe fallback so live conditions always render.
- **Brand-leak prevention:** automated guard ensures zero cross-brand residue ships.

## 8. Skills demonstrated
Agentic LLM application design · tool-calling & function dispatch · prompt engineering + caching · generative UI · React PWA · FastAPI/Python services · voice (ASR/TTS) & multilingual UX · multi-tenant/multi-brand architecture · e2e testing & quality gates · creative-coding video automation (Remotion) · cloud deployment (Vercel/Railway/Docker).
