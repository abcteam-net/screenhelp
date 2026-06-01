"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Zap, Code, MessageCircleQuestion, Sparkles, Layers, Camera } from "lucide-react";
import { getCapture } from "@/lib/capture";
import { useSession } from "@/lib/session";
import type { FeatureMode } from "@/lib/types";
import { GlassPanel } from "./ui/GlassPanel";

type Preset = { label: string; mode: FeatureMode; icon: React.ReactNode; question?: string };

const PRESETS: Preset[] = [
  { label: "Answer", mode: "answer-now", icon: <Zap size={12} /> },
  { label: "Interview", mode: "interview", icon: <Code size={12} /> },
  { label: "Explain", mode: "ask", icon: <MessageCircleQuestion size={12} />, question: "Explain what's on this screen." },
  { label: "Summarize", mode: "ask", icon: <Sparkles size={12} />, question: "Summarize what's visible in 3 bullets." },
];

export function AskBar({ showPresets = true }: { showPresets?: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useSession((s) => s.ask);
  const inputRef = useRef<HTMLInputElement>(null);

  const fire = async (mode: FeatureMode, presetQuestion?: string) => {
    if (busy) return;
    const c = getCapture();
    if (!c.isActive()) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing your screen first." }));
      return;
    }
    setBusy(true);
    try {
      const frame = await c.grabFrame();
      await ask({ mode, question: presetQuestion || q || undefined, imageDataUrl: frame?.dataUrl });
      setQ("");
    } finally {
      setBusy(false);
    }
  };

  const captureAnswer = async (strategy: "instant" | "cumulative") => {
    if (busy) return;
    const c = getCapture();
    if (!c.isActive()) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing your screen first." }));
      return;
    }
    setBusy(true);
    try {
      const frame = await c.grabFrame();
      await ask({
        mode: "answer-now",
        imageDataUrl: frame?.dataUrl,
        captureStrategy: strategy,
        question:
          strategy === "cumulative"
            ? "Cumulative capture: use all collected screenshots and update the final answer."
            : "Instant capture: answer the current screen using the best matching template.",
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("screenhelp:focus-ask", onFocus);
    return () => window.removeEventListener("screenhelp:focus-ask", onFocus);
  }, []);

  return (
    <GlassPanel padding="sm" className="animate-slide-up">
      {showPresets && (
        <div className="flex gap-1.5 mb-2.5 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => fire(p.mode, p.question)}
              disabled={busy}
              className="text-[11px] px-2.5 py-1 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fire("ask"); }}
          placeholder="Ask anything about what's on your screen…"
          className="input flex-1"
        />
        <button
          onClick={() => fire("ask")}
          disabled={busy}
          className="btn-primary px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1.5"
        >
          <Send size={13} />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => captureAnswer("cumulative")}
          disabled={busy}
          className="text-xs px-2.5 py-2 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Layers size={13} />
          Cumulative
        </button>
        <button
          onClick={() => captureAnswer("instant")}
          disabled={busy}
          className="text-xs px-2.5 py-2 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Camera size={13} />
          Instant
        </button>
      </div>
    </GlassPanel>
  );
}

export function QuickAskActions() {
  const [busy, setBusy] = useState(false);
  const ask = useSession((s) => s.ask);

  const fire = async (mode: FeatureMode, presetQuestion?: string) => {
    if (busy) return;
    const c = getCapture();
    if (!c.isActive()) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing your screen first." }));
      return;
    }
    setBusy(true);
    try {
      const frame = await c.grabFrame();
      await ask({ mode, question: presetQuestion, imageDataUrl: frame?.dataUrl });
    } finally {
      setBusy(false);
    }
  };

  const captureAnswer = async (strategy: "instant" | "cumulative") => {
    if (busy) return;
    const c = getCapture();
    if (!c.isActive()) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing your screen first." }));
      return;
    }
    setBusy(true);
    try {
      const frame = await c.grabFrame();
      await ask({
        mode: "answer-now",
        imageDataUrl: frame?.dataUrl,
        captureStrategy: strategy,
        question:
          strategy === "cumulative"
            ? "Cumulative capture: use all collected screenshots and update the final answer."
            : "Instant capture: answer the current screen using the best matching template.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold mb-2">Quick actions</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => captureAnswer("cumulative")}
          disabled={busy}
          className="text-xs px-2.5 py-2 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Layers size={12} />
          Cumulative
        </button>
        <button
          onClick={() => captureAnswer("instant")}
          disabled={busy}
          className="text-xs px-2.5 py-2 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Camera size={12} />
          Instant
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => fire(p.mode, p.question)}
            disabled={busy}
            className="text-xs px-2.5 py-2 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep hover:border-border-strong transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {p.icon}
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
