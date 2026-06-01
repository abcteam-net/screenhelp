// Orchestrates: pick provider+key from settings, build messages, stream answer,
// persist to history. Returns a turn id so the UI can subscribe to updates.

import { create } from "zustand";
import type { ChatTurn, FeatureMode, Message } from "./types";
import { useSettings } from "./settings";
import { db } from "./db";
import { dataUrlToBase64 } from "./capture";
import { streamThroughProxy } from "./providers/base";
import { systemForMode, userPromptForMode } from "./prompts";

interface AskOptions {
  mode: FeatureMode;
  question?: string;
  imageDataUrl?: string;
  captureStrategy?: "instant" | "cumulative";
}

interface SessionState {
  turns: ChatTurn[];
  current: ChatTurn | null;
  loadHistory(): Promise<void>;
  ask(opts: AskOptions): Promise<string>; // returns turn id
  abortCurrent(): void;
}

let _abort: AbortController | null = null;

export const useSession = create<SessionState>((set, get) => ({
  turns: [],
  current: null,
  async loadHistory() {
    if (typeof window === "undefined") return;
    const rows = await db().turns.orderBy("createdAt").reverse().limit(50).toArray();
    set({ turns: rows });
  },
  async ask(opts) {
    const { settings } = useSettings.getState();
    const priorTurns = get().turns;
    const captureStrategy = opts.captureStrategy ?? (opts.mode === "answer-now" ? "instant" : undefined);
    const providerId = settings.featureProvider[opts.mode];
    const providerCfg = settings.providers[providerId];
    const apiKey = providerCfg?.apiKey;
    const model = providerCfg?.model || "claude-sonnet-4-6";
    const baseUrl = providerCfg?.baseUrl;

    const id = crypto.randomUUID();
    const turn: ChatTurn = {
      id,
      sessionId: "default",
      createdAt: Date.now(),
      mode: opts.mode,
      captureStrategy,
      question: opts.question || "",
      answer: "",
      providerId,
      model,
      status: "streaming",
    };
    set({ current: turn, turns: [turn, ...get().turns] });
    await db().turns.put(turn);

    const needsApiKey =
      providerId !== "ollama" &&
      providerId !== "claude-code-sdk" &&
      providerId !== "codex-cli";
    if (needsApiKey && !apiKey) {
      const errTurn = { ...turn, status: "error" as const, error: `${providerId} API key missing. Open Settings to add it.` };
      set({ current: errTurn, turns: [errTurn, ...get().turns.filter((t) => t.id !== id)] });
      await db().turns.put(errTurn);
      return id;
    }

    // Build messages. Instant captures are intentionally fresh. Cumulative
    // captures reuse previous extracted text, not previous images, so the
    // context stays compact and focused.
    const parts: Message["content"] = [];
    parts.push({
      type: "text",
      text: `Isolated request id: ${id}. This request has its own provider session. Do not continue or reuse any prior request, prior image, prior code, prior answer, or prior file path.`,
    });
    if (captureStrategy === "instant") {
      parts.push({
        type: "text",
        text: "Instant capture mode. This is a brand-new isolated task, not a continuation. Use only the current screenshot in this request. Ignore all previous captures, previous answers, cumulative memory, prior code, prior quiz options, and any provider-side conversation memory. For coding tasks, match the visible editor/starter-code language exactly. If Go code is visible, return Go only; never return Python unless Python is visible or no language is visible anywhere.",
      });
    } else if (captureStrategy === "cumulative") {
      const recentCumulative = priorTurns
        .filter((t) => t.captureStrategy === "cumulative" && t.status === "done" && t.answer)
        .slice(0, 8)
        .reverse();

      if (recentCumulative.length > 0) {
        parts.push({
          type: "text",
          text: [
            "Previous cumulative text context follows. Do not assume old screenshots are still visible; use this text as memory and update the final answer from the newest screenshot.",
            ...recentCumulative.map((recent, index) => `Capture ${index + 1} answer/context:\n${recent.answer}`),
          ].join("\n\n").slice(0, 6000),
        });
      }
    }

    if (opts.imageDataUrl) {
      const { mimeType, base64 } = dataUrlToBase64(opts.imageDataUrl);
      parts.push({ type: "image", mimeType, base64 });
    }
    parts.push({
      type: "text",
      text: userPromptForMode(opts.mode, {
        userQuestion: opts.question,
        captureStrategy,
      }),
    });

    _abort?.abort();
    _abort = new AbortController();

    try {
      const stream = streamThroughProxy(providerId, apiKey, baseUrl, {
        requestId: id,
        model,
        messages: [{ role: "user", content: parts }],
        system: systemForMode(opts.mode),
        maxTokens: 1500,
        thinkingEnabled: providerCfg?.thinkingEnabled,
        reasoningEffort: providerCfg?.reasoningEffort,
        signal: _abort.signal,
      });

      for await (const chunk of stream) {
        if (chunk.type === "text-delta" && chunk.text) {
          turn.answer += chunk.text;
          set({ current: { ...turn }, turns: get().turns.map((t) => (t.id === id ? { ...turn } : t)) });
        } else if (chunk.type === "error") {
          turn.status = "error";
          turn.error = chunk.error;
          break;
        }
      }

      if (turn.status !== "error") turn.status = "done";
      set({ current: { ...turn }, turns: get().turns.map((t) => (t.id === id ? { ...turn } : t)) });
      await db().turns.put(turn);
    } catch (err: any) {
      turn.status = "error";
      turn.error = err?.message || String(err);
      set({ current: { ...turn }, turns: get().turns.map((t) => (t.id === id ? { ...turn } : t)) });
      await db().turns.put(turn);
    }

    return id;
  },
  abortCurrent() {
    _abort?.abort();
  },
}));
