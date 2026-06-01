# ScreenHelp

A web-based AI co-pilot that watches your screen and answers questions about it. ScreenHelp.ai-style — full clone in progress.

**Current status:** Milestones M0–M7 done. M8 (final polish/onboarding) is the last one.

## Features (working)

- Share a **screen, window, or tab** via the browser's `getDisplayMedia` API.
- **Hotkey "Answer now"** (default `⌘/Ctrl + Shift + Space`) — instant capture + AI answer.
- **Ask bar** — type any question about what's on screen.
- **Prompt presets** — Answer now, Interview, Explain, Summarize.
- **Multi-provider AI** — Claude Code local CLI, Codex CLI, Anthropic Claude, OpenAI, Google Gemini, Groq, and local Ollama. Per-feature provider routing.
- **Live screen watching** (opt-in) — samples the shared stream and proactively flags meaningful changes.
- **Meeting / audio assistant** — mixes mic + system audio, streams ~10s chunks to Groq or OpenAI Whisper, runs a rolling Markdown summary every 30s and surfaces suggested answers for direct questions.
- **Interview mode** — floating, draggable, opacity-adjustable overlay with a dedicated hotkey (`⌘/Ctrl + Shift + I`). One-press captures the problem and renders an interview-ready answer with Approach / Solution / Talking points. Stream-to-clipboard at a configurable WPM.
- **History** — all answers persisted locally in IndexedDB.
- **API keys live only in your browser.** They're posted same-origin to the Next.js proxies (`/api/chat`, `/api/transcribe`) on each request; nothing is logged or stored server-side.
- **Chrome extension** — companion in `extension/` adds true browser-wide hotkeys (`chrome.commands`), a side panel that mirrors the web app, and a right-click "Ask ScreenHelp about this page" context menu. See [`extension/README.md`](./extension/README.md).

## Setup

```bash
pnpm install            # or npm install
pnpm dev                # next dev on http://localhost:3000
```

For the default Claude Code provider, sign in with `claude /login`, then run `pnpm bridge` in a second terminal. Open the app, click **Settings**, test the Claude Code bridge, then **Start sharing**. Pick a window for the tightest privacy scope.

To use Codex CLI as a provider, sign in with `codex login`, keep the same `pnpm bridge` process running, then choose **Codex CLI (local)** in **Provider per feature**.

For the Meeting assistant transcription, ScreenHelp is configured for a local Whisper Docker server by default:

```bash
docker run --name whisper --rm \
  -p 9000:9000 \
  -e WHISPER_MODEL=base \
  -v whisper-data:/var/lib/whisper \
  hwdsl2/whisper-server
```

The matching Settings values are:

```text
Transcription provider: Local Whisper
Local transcription URL: http://localhost:9000/v1/audio/transcriptions
Local model: base
```

Cloud providers are still available from **Settings** if you prefer API-key based routing.

## Docker

The container image includes the web app, the ScreenHelp bridge, Claude Code CLI, and Codex CLI. The bridge runs inside the same container as Next.js, so the default local provider URL stays `http://localhost:8787` from the app server's point of view.

```bash
docker compose up --build screenhelp
```

Open:

```text
http://localhost:3000
```

Optional local Whisper transcription:

```bash
docker compose --profile meeting up --build
```

Claude/Codex auth is intentionally not baked into the image. Use one of these approaches:

- Pass API keys through the environment before `docker compose up`:

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
docker compose up --build screenhelp
```

- Or log in inside the container, with auth persisted in Docker volumes:

```bash
docker compose run --rm screenhelp claude /login
docker compose run --rm screenhelp codex login
docker compose up screenhelp
```

Useful files:

- [`Dockerfile`](./Dockerfile) installs `@anthropic-ai/claude-code` and `@openai/codex`.
- [`docker-compose.yml`](./docker-compose.yml) starts ScreenHelp and optionally Whisper.
- [`scripts/start-container.mjs`](./scripts/start-container.mjs) starts both `pnpm bridge` behavior and `next start`.

## Tech

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · Zustand · Dexie (IndexedDB) · tinykeys. All capture work uses standard web APIs — no native code.

## Roadmap

See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full milestone plan. Done: **M0–M7**. Next up:

- **M8** — Onboarding flow, error handling, landing page, telemetry opt-in.

## Caveats

- True global hotkeys aren't possible from a plain web app — the page hotkey only fires while a ScreenHelp tab is focused. The future Chrome extension will fix this for browser-wide.
- System audio capture works on Chromium-based browsers when you share a **tab with audio**. Other surfaces are mic-only.
- Stealth-mode features (M6) are best-effort cosmetic only. Real proctored exams will detect them.
