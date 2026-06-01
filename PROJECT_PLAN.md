# ScreenHelp Clone — Project Plan

A web-first AI assistant that watches what's on your screen and answers your questions. Built as a full clone of ScreenHelp.ai with a polished v1.

---

## 1. Vision

A personal "co-pilot for anything on screen." User hits a hotkey or button, the app captures the current screen/window/region, and an AI provider of their choice returns an answer in an overlay. Optional always-on modes watch the screen continuously, listen to meetings, or act as a stealth interview helper.

---

## 2. Platform Decision

**Primary**: Progressive Web App (PWA) using `getDisplayMedia` for screen/window/tab sharing.
**Companion**: Chrome extension that adds global-ish hotkeys (the browser limits true OS-wide hotkeys, but the extension expands what the web app alone can do — page-level shortcuts, context menu, persistent capture session).

Why web + extension instead of a desktop app: user requested web/extension. This pair gets us ~80% of desktop functionality (screen share, window share, audio, hotkeys when the tab/extension is focused) without packaging. We document the trade-off: truly global "always-on top stealth overlay" needs Electron/Tauri — a possible future M7.

---

## 3. Feature Scope (v1)

### 3.1 Screenshot + Ask (foundation)
- User shares a screen, window, or tab via `navigator.mediaDevices.getDisplayMedia`.
- Hotkey (configurable, default `Ctrl/Cmd + Shift + Space`) or on-screen button captures a still frame from the live stream.
- A floating question box appears; user types or speaks a question.
- Captured frame + question are sent to the selected AI provider.
- Answer streams into an overlay panel; full history is kept in a side drawer.

### 3.2 One-Button / Hotkey "Answer Now"
- A single configurable trigger (keyboard combo OR a floating button OR an extension toolbar click) that:
  1. Grabs the current frame from the shared stream.
  2. Sends it to the AI with a default prompt ("Look at this screen and help me — answer any visible question, complete any visible task, or explain what I'm looking at").
  3. Shows the answer in an overlay panel without requiring the user to type anything.
- Power-user variant: hotkey + a quick-prompt presets menu (Explain / Solve / Summarize / Translate / Code review).

### 3.3 Window Share
- Built on top of `getDisplayMedia({ video: { displaySurface: "window" } })`.
- User picks one specific window (e.g., LeetCode, Zoom, a PDF reader). All captures and live-watch pull from that surface only — privacy by scope.

### 3.4 Live Screen Watching
- Sample the shared stream at a configurable interval (default every 2–5 seconds) and run a cheap perceptual-hash diff.
- When the diff exceeds a threshold (screen meaningfully changed), send the new frame to the AI with a "what's new / is the user stuck / anything I should proactively help with" prompt.
- A small floating chip surfaces proactive suggestions; clicking it expands the answer.
- User can pause / resume live watching at any time; obvious privacy indicator when it's on.

### 3.5 Audio / Meeting Assistant
- Captures system audio via `getDisplayMedia({ audio: true })` when the user shares a tab or the whole screen with audio, plus mic via `getUserMedia` for the user's own voice.
- Live transcription using the Web Speech API as a fallback and Whisper-via-provider (Groq/OpenAI) as primary for quality.
- Sliding-window summarizer running every ~30s feeds into a meeting notes panel.
- Question detector: when someone asks the user a question, a "suggested answer" card pops in.
- Post-meeting: exportable transcript + action items + summary.

### 3.6 Interview / Exam Mode (the flagship)
- A "stealth" UI mode: overlay rendered in a small, repositionable, very low-opacity window inside the app's tab; minimal chrome, dark theme, hotkey-driven.
- Optimized prompt template for coding interviews: "You are observing a coding interview. The candidate is the user. Given this screenshot of the problem and IDE, produce: (1) the answer / approach, (2) the code, (3) talking points the candidate can say out loud while typing."
- "Hide on screen-share-of-this-tab" heuristic: detect when the user is sharing the same tab we're rendered in, and hide the panel from the rendered DOM (best-effort — we make no stealth guarantees). This is mostly cosmetic since real proctored exams will catch it. We'll document this honestly.
- Click-through-to-clipboard: each answer block has a "copy as you type" mode that types out characters at a configurable WPM.

### 3.7 Multi-provider AI
- Settings page where the user pastes API keys for: Anthropic Claude, OpenAI, Google Gemini, Groq, plus a local Ollama endpoint URL.
- Per-feature model selection: e.g., "use Claude Sonnet for screen Q&A, use Whisper-via-Groq for transcription, use a small local Llama for the proactive watcher to save cost."
- Keys stored encrypted in `IndexedDB` using a passphrase the user sets (Web Crypto `AES-GCM`).

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + React 18 + TypeScript | Modern, fast iteration, great DX |
| Styling | Tailwind + shadcn/ui | Matches ScreenHelp's clean dark UI; quick to build |
| State | Zustand (UI) + TanStack Query (server) | Lightweight, fits SPA-style screens |
| Capture | `getDisplayMedia` + Canvas frame grab | Standard web APIs, no native code |
| Audio | `getUserMedia` + Web Audio + `MediaRecorder` | Cross-browser; chunked uploads for transcription |
| Hotkeys | `tinykeys` library + Chrome extension `commands` API | Page-level via tinykeys, OS-level via the extension |
| AI SDKs | Vercel AI SDK + `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, raw fetch for Ollama | Streaming, vision, tool use abstracted |
| Storage | IndexedDB (Dexie.js) for history; Web Crypto for keys | No backend required for a local-first MVP |
| Backend (optional) | Next.js route handlers as a proxy for providers that disallow CORS | Keeps API keys client-side by default; proxy is optional |
| Extension | MV3, side panel + commands | Adds global hotkeys + persistent context |
| Build | Vite for the extension, Next.js for the web app, single monorepo via pnpm workspaces | |

---

## 5. Architecture

Three packages in a pnpm monorepo:

```
screenhelp/
├── apps/
│   ├── web/                 # Next.js PWA (main product)
│   └── extension/           # MV3 Chrome extension
├── packages/
│   ├── core/                # Provider adapters, prompt templates, capture engine
│   ├── ui/                  # shadcn-based component library shared across apps
│   └── shared-types/        # TS types for sessions, settings, providers
```

### Data flow (single capture + ask)
1. `CaptureService` holds the active `MediaStream` from `getDisplayMedia`.
2. Trigger fires (hotkey, button, or extension command via `chrome.runtime.sendMessage`).
3. `CaptureService.grabFrame()` draws the current video frame to an `OffscreenCanvas`, returns a `Blob` (PNG or WEBP).
4. `Session.ask({ frame, question, mode })` selects a provider via `ProviderRouter`.
5. `ProviderRouter` builds the request (vision content block + prompt template for the mode) and streams the response.
6. UI subscribes to the stream and renders chunks; full turn is persisted to IndexedDB.

### Data flow (live watching)
- A `WatchLoop` web worker pulls a frame every N seconds, computes a pHash, compares to the previous frame. On significant change, it dispatches the same `Session.ask` with a "proactive" prompt template.
- Cost guardrails: max N requests per minute, with a visible counter.

### Data flow (audio assistant)
- `AudioCapture` produces 10s rolling chunks via `MediaRecorder`.
- Each chunk is POSTed to the chosen transcription provider; partial transcripts are streamed back.
- Every 30s, the accumulated transcript is summarized via the chat provider into the meeting notes panel.
- A `QuestionDetector` (regex + cheap LLM classifier) watches transcript chunks; when a question is detected, it generates a suggested answer.

---

## 6. Multi-Provider Abstraction

Single `Provider` interface in `packages/core/providers/types.ts`:

```ts
interface Provider {
  id: 'anthropic' | 'openai' | 'google' | 'groq' | 'ollama';
  chat(input: ChatInput): AsyncIterable<ChatChunk>;
  transcribe?(audio: Blob): Promise<TranscriptResult>;
  capabilities: { vision: boolean; audio: boolean; streaming: boolean };
}

interface ChatInput {
  model: string;
  messages: Message[];      // text + image_url + audio parts
  system?: string;
  temperature?: number;
  maxTokens?: number;
}
```

Concrete adapters: `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`, `GroqProvider`, `OllamaProvider`. Each normalizes its native SDK's streaming output to our `ChatChunk` shape.

`ProviderRouter` picks the right provider based on a per-feature setting; falls back gracefully when a feature isn't supported (e.g., Ollama with no vision model → friendly error and a link to settings).

---

## 7. UX & UI

- Dark theme by default, light theme toggleable.
- Three primary surfaces:
  - **Floating launcher** (small pill in the corner): start/stop sharing, trigger capture, toggle live watch.
  - **Side drawer**: chat history, current answer, copy buttons.
  - **Settings**: providers + keys, hotkeys, capture preferences, modes.
- A persistent "Sharing: [window name]" indicator + a red dot when audio/video capture is active. Privacy is visible at a glance.

---

## 8. Milestones

| Milestone | Scope | Estimate |
|---|---|---|
| **M0 — Skeleton** | Monorepo setup, Next.js app shell, shadcn theme, settings page stub | 3 days |
| **M1 — Capture + Ask (Claude only)** | `getDisplayMedia` flow, frame grab, Claude vision call, streaming answer panel, history in IndexedDB | 5 days |
| **M2 — Multi-provider** | Provider abstraction, OpenAI + Gemini + Groq + Ollama adapters, key vault with Web Crypto, settings UI | 4 days |
| **M3 — Hotkey + button trigger + window share** | tinykeys integration, `displaySurface: 'window'`, configurable bindings, prompt presets | 3 days |
| **M4 — Audio / Meeting assistant** | Audio capture, chunked transcription, live notes, question detector | 6 days |
| **M5 — Live screen watching** | Worker-based sampling, pHash diff, proactive prompts, rate limits | 4 days |
| **M6 — Interview mode** | Stealth-ish overlay, coding-interview prompt template, type-out-to-clipboard, hide-on-share heuristic | 4 days |
| **M7 — Chrome extension** | MV3 shell, global commands, side panel mirror of web app, deep link into the PWA | 5 days |
| **M8 — Polish** | Onboarding, empty states, error handling, telemetry opt-in, docs site, landing page | 5 days |

Total: ~39 working days (~8 calendar weeks for one person).

---

## 9. Risks & Open Questions

1. **No truly global hotkey in a browser.** Mitigation: extension provides browser-wide commands; document that fully OS-wide needs a future desktop build.
2. **Stealth in interview mode is best-effort.** Most proctored-exam software will still detect or block this. We'll be honest in the UI and docs.
3. **API costs in live-watch mode.** Mitigation: pHash gate, configurable interval, per-day spend cap, free local-model option.
4. **System audio capture is browser-dependent.** Chrome/Edge allow it on "share tab with audio"; Firefox/Safari don't. We gate the feature and explain it.
5. **Key storage is local-first.** A determined attacker with code execution can extract keys; the passphrase + Web Crypto raises the bar but isn't a vault. We document this.
6. **Legal / ToS.** A clone is fine for personal use; if the project is ever distributed, we audit licensing, name, and any trademark conflicts with ScreenHelp.ai before launch.

---

## 10. Out of Scope for v1

- Native desktop app (Electron/Tauri).
- Mobile (iOS/Android) — `getDisplayMedia` support is limited and inconsistent.
- Team / multiplayer sessions.
- Cloud-synced history (local-only for v1; can add later behind an opt-in).
- Fine-tuning or training custom models.

---

## 11. First Code Steps (when ready to build)

1. `pnpm create next-app apps/web --ts --tailwind --app` and scaffold the monorepo.
2. Set up shadcn/ui with a dark default theme.
3. Build a "Hello capture" page: button → `getDisplayMedia` → live `<video>` preview → "grab frame" → render `<img>` of the captured frame.
4. Wire Claude vision: paste an API key into a temporary input, send `{ frame, "What do you see?" }`, stream the answer.
5. Iterate from there following the milestone order.
