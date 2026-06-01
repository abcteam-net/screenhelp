// Settings store. Persists to IndexedDB via Dexie.
// Keys are stored in the same row for simplicity in this iteration; a future
// pass can layer Web Crypto encryption on top using a user passphrase.

import { create } from "zustand";
import type { ProviderId, Settings } from "./types";
import { db } from "./db";

export const DEFAULT_SETTINGS: Settings = {
  providers: {
    "claude-code-sdk": { model: "sonnet", baseUrl: "http://localhost:8787", thinkingEnabled: false, reasoningEffort: "medium" },
    "codex-cli": { model: "gpt-5.4", baseUrl: "http://localhost:8787", thinkingEnabled: false, reasoningEffort: "medium" },
    anthropic: { model: "claude-sonnet-4-6" },
    openai: { model: "gpt-4o" },
    google: { model: "gemini-1.5-pro" },
    groq: { model: "meta-llama/llama-4-scout-17b-16e-instruct" },
    ollama: { model: "llava", baseUrl: "http://localhost:11434" },
  },
  featureProvider: {
    ask: "claude-code-sdk",
    "answer-now": "claude-code-sdk",
    interview: "claude-code-sdk",
    "live-watch": "claude-code-sdk",
    meeting: "anthropic",
  },
  hotkey: "ControlRight",
  cumulativeHotkey: "$mod+Shift+C",
  interviewHotkey: "$mod+Shift+I",
  remote: {
    enabled: true,
    instantHotkey: "I",
    cumulativeHotkey: "C",
    toggleListeningHotkey: "T",
  },
  capturePreset: "window",
  liveWatch: {
    enabled: false,
    intervalMs: 4000,
    diffThreshold: 0.04,
  },
  meeting: {
    transcribeProvider: "local",
    transcribeBaseUrl: "http://localhost:9000/v1/audio/transcriptions",
    transcribeModel: "base",
    chunkMs: 10_000,
    summarizeIntervalMs: 30_000,
    captureMic: true,
    captureSystem: true,
  },
  interview: {
    overlayOpacity: 0.92,
    typeWpm: 80,
    overlayPinned: true,
  },
  ui: {
    theme: "dark",
    overlayOpacity: 1,
  },
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load(): Promise<void>;
  save(partial: Partial<Settings>): Promise<void>;
  setProviderKey(id: ProviderId, apiKey: string): Promise<void>;
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(patch as any)) {
    const v = (patch as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge((base as any)[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    if (typeof window === "undefined") return;
    try {
      const row = await db().settings.get("singleton");
      const merged = row?.value ? deepMerge(DEFAULT_SETTINGS, row.value) : DEFAULT_SETTINGS;
      for (const mode of Object.keys(merged.featureProvider) as Array<keyof Settings["featureProvider"]>) {
        if ((merged.featureProvider[mode] as any) === "claude-code") {
          merged.featureProvider[mode] = "claude-code-sdk";
        }
      }
      delete (merged.providers as any)["claude-code"];
      if (row?.value?.hotkey === "$mod+Shift+Space") {
        merged.hotkey = DEFAULT_SETTINGS.hotkey;
      }
      if (row?.value?.meeting?.transcribeBaseUrl === "http://localhost:8000/v1/audio/transcriptions") {
        merged.meeting.transcribeBaseUrl = DEFAULT_SETTINGS.meeting.transcribeBaseUrl;
        merged.meeting.transcribeModel = DEFAULT_SETTINGS.meeting.transcribeModel;
      }
      if (
        row?.value?.providers?.groq?.model === "llama-3.2-90b-vision-preview" ||
        row?.value?.providers?.groq?.model === "llama-3.2-11b-vision-preview"
      ) {
        merged.providers.groq.model = DEFAULT_SETTINGS.providers.groq.model;
      }
      if (merged.meeting.transcribeProvider === "groq" && !merged.meeting.transcribeModel?.startsWith("whisper-")) {
        merged.meeting.transcribeModel = "whisper-large-v3-turbo";
      }
      if (merged.meeting.transcribeProvider === "openai" && !merged.meeting.transcribeModel?.startsWith("whisper-")) {
        merged.meeting.transcribeModel = "whisper-1";
      }
      set({ settings: merged, loaded: true });
    } catch (e) {
      console.warn("settings load failed", e);
      set({ loaded: true });
    }
  },
  async save(partial) {
    const next = deepMerge(get().settings, partial);
    set({ settings: next });
    await db().settings.put({ id: "singleton", value: next });
    if (typeof window !== "undefined") {
      fetch("/api/remote-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "config", remote: next.remote }),
      }).catch(() => undefined);
    }
  },
  async setProviderKey(id, apiKey) {
    await get().save({
      providers: { [id]: { apiKey } } as any,
    });
  },
}));
