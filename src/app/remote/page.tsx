"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Clock3, Copy, Ear, EarOff, Layers, Loader2, RotateCcw } from "lucide-react";
import { Markdown } from "@/components/Markdown";

interface RemoteResult {
  id: number;
  commandId: number;
  type: "instant" | "cumulative";
  createdAt: number;
  status: "done" | "error";
  answer?: string;
  error?: string;
}

interface RemoteConfig {
  enabled: boolean;
  instantHotkey: string;
  cumulativeHotkey: string;
  toggleListeningHotkey: string;
}

const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  enabled: true,
  instantHotkey: "I",
  cumulativeHotkey: "C",
  toggleListeningHotkey: "T",
};

export default function RemotePage() {
  const [status, setStatus] = useState("Waiting for a capture");
  const [pendingType, setPendingType] = useState<"instant" | "cumulative" | null>(null);
  const [result, setResult] = useState<RemoteResult | null>(null);
  const [config, setConfig] = useState<RemoteConfig>(DEFAULT_REMOTE_CONFIG);
  const lastResultRef = useRef(0);

  const resetCumulative = async () => {
    try {
      await fetch("/api/remote-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reset-cumulative" }),
      });
      setPendingType(null);
      setResult(null);
      lastResultRef.current = 0;
      setStatus("Cumulative context reset");
    } catch {
      setStatus("Could not reset cumulative context");
    }
  };

  const trigger = async (type: "instant" | "cumulative") => {
    setPendingType(type);
    setStatus(type === "instant" ? "Instant capture requested" : "Cumulative capture requested");
    try {
      const res = await fetch("/api/remote-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      setPendingType(null);
      setStatus(err?.message || "Could not trigger ScreenHelp");
    }
  };

  const toggleListening = async () => {
    const enabled = !config.enabled;
    setConfig((current) => ({ ...current, enabled }));
    try {
      const res = await fetch("/api/remote-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "listening", enabled }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch {
      setStatus("Could not sync listening state");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/remote-control?afterResult=${lastResultRef.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.config) setConfig(data.config);
        const results = (data.results || []) as RemoteResult[];
        if (results.length === 0) return;
        const latest = results[results.length - 1];
        lastResultRef.current = Math.max(...results.map((item) => item.id));
        if (cancelled) return;
        setResult(latest);
        setPendingType(null);
        setStatus(latest.status === "error" ? "Capture failed" : "Answer ready");
      } catch {
        // Keep polling; the dev server may be refreshing.
      }
    };

    poll();
    const id = window.setInterval(poll, 800);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", poll);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", poll);
    };
  }, []);

  useEffect(() => {
    const unbind = bindRemoteHotkey(config.toggleListeningHotkey, () => { void toggleListening(); });
    return () => unbind?.();
  }, [config.toggleListeningHotkey]);

  useEffect(() => {
    if (!config.enabled) return;
    const unbinders = [
      bindRemoteHotkey(config.instantHotkey, () => trigger("instant")),
      bindRemoteHotkey(config.cumulativeHotkey, () => trigger("cumulative")),
    ].filter(Boolean) as Array<() => void>;

    return () => {
      for (const unbind of unbinders) unbind();
    };
  }, [config.enabled, config.instantHotkey, config.cumulativeHotkey]);

  const answer = result?.answer?.trim();

  return (
    <main className="min-h-screen bg-bg text-text pb-24">
      <div className="sticky top-0 z-20 flex border-b border-border bg-bg-elevated">
        <div className="flex-1 border-r border-border"><RemoteButton type="cumulative" hotkey={config.cumulativeHotkey} onClick={() => trigger("cumulative")} /></div>
        <div className="hidden md:block border-r border-border"><ListeningButton enabled={config.enabled} hotkey={config.toggleListeningHotkey} onClick={toggleListening} /></div>
        <div className="flex-1 border-r border-border"><ResetButton onClick={resetCumulative} /></div>
        <div className="flex-1"><RemoteButton type="instant" hotkey={config.instantHotkey} onClick={() => trigger("instant")} /></div>
      </div>

      <section className="px-4 py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Remote answer</h1>
            <div className="text-xs text-text-subtle mt-1">
              {status} · Keyboard {config.enabled ? "on" : "off"} · Toggle <kbd className="font-mono">{config.toggleListeningHotkey}</kbd> · Cumulative <kbd className="font-mono">{config.cumulativeHotkey}</kbd> · Instant <kbd className="font-mono">{config.instantHotkey}</kbd>
            </div>
          </div>
          {answer && (
            <button
              onClick={() => navigator.clipboard.writeText(answer)}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs font-medium flex items-center gap-1.5"
            >
              <Copy size={13} />
              Copy
            </button>
          )}
        </div>

        <article className="min-h-[55vh] rounded-lg border border-border bg-bg-elevated p-4">
          {pendingType ? (
            <div className="h-[45vh] flex flex-col items-center justify-center text-center text-text-muted">
              <Loader2 size={24} className="animate-spin mb-3 text-accent" />
              <div className="text-sm font-medium text-text">
                {pendingType === "instant" ? "Taking instant capture" : "Adding cumulative context"}
              </div>
              <div className="text-xs mt-1 max-w-xs">
                The main page will auto-select the right template after it sees the screenshot.
              </div>
            </div>
          ) : result?.status === "error" ? (
            <div className="flex gap-2 text-danger text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>{result.error || "Remote capture failed."}</div>
            </div>
          ) : answer ? (
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs text-text-subtle">
                <CheckCircle2 size={14} className="text-accent" />
                {result?.type === "cumulative" ? "Cumulative answer" : "Instant answer"}
              </div>
              <Markdown text={answer} />
            </div>
          ) : (
            <div className="h-[45vh] flex flex-col items-center justify-center text-center text-text-muted">
              <Clock3 size={24} className="mb-3 text-text-subtle" />
              <div className="text-sm font-medium text-text">No answer yet</div>
              <div className="text-xs mt-1 max-w-xs">
                Use the buttons above. This area stays empty until ScreenHelp captures the screen and fills the selected template.
              </div>
            </div>
          )}
        </article>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border bg-bg-elevated/95 backdrop-blur">
        <div className="flex-1 border-r border-border"><RemoteButton type="cumulative" hotkey={config.cumulativeHotkey} onClick={() => trigger("cumulative")} compact /></div>
        <div className="hidden md:block border-r border-border"><ListeningButton enabled={config.enabled} hotkey={config.toggleListeningHotkey} onClick={toggleListening} compact /></div>
        <div className="flex-1 border-r border-border"><ResetButton onClick={resetCumulative} compact /></div>
        <div className="flex-1"><RemoteButton type="instant" hotkey={config.instantHotkey} onClick={() => trigger("instant")} compact /></div>
      </div>
    </main>
  );
}

function ListeningButton({
  enabled,
  hotkey,
  onClick,
  compact,
}: {
  enabled: boolean;
  hotkey: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full ${compact ? "h-20" : "h-24"} flex flex-col items-center justify-center gap-1 text-sm font-semibold active:bg-bg-deep ${enabled ? "text-text" : "text-text-muted bg-bg-panel"}`}
    >
      {enabled ? <Ear size={compact ? 18 : 20} /> : <EarOff size={compact ? 18 : 20} />}
      <span>{enabled ? "Listening" : "Paused"}</span>
      <kbd className="text-[10px] text-text-subtle font-mono">{hotkey}</kbd>
    </button>
  );
}

function RemoteButton({
  type,
  hotkey,
  onClick,
  compact,
}: {
  type: "instant" | "cumulative";
  hotkey: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const isInstant = type === "instant";
  return (
    <button
      onClick={onClick}
      className={`w-full ${compact ? "h-20" : "h-24"} flex flex-col items-center justify-center gap-1 text-sm font-semibold active:bg-bg-deep`}
    >
      {isInstant ? <Camera size={compact ? 18 : 20} /> : <Layers size={compact ? 18 : 20} />}
      <span>{isInstant ? "Instant" : "Cumulative"}</span>
      <kbd className="text-[10px] text-text-subtle font-mono">{hotkey}</kbd>
    </button>
  );
}

function ResetButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full ${compact ? "h-20" : "h-24"} flex flex-col items-center justify-center gap-1 text-sm font-semibold text-text-muted active:bg-bg-deep`}
    >
      <RotateCcw size={compact ? 18 : 20} />
      <span>Reset</span>
    </button>
  );
}

function bindRemoteHotkey(hotkey: string, run: () => void): (() => void) | null {
  const key = hotkey.trim();
  if (!key) return null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || !matchesRemoteHotkey(event, key)) return;
    event.preventDefault();
    run();
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}

function matchesRemoteHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const modifierCode = modifierHotkeyCode(hotkey);
  if (modifierCode) return event.code === modifierCode;

  const parts = hotkey.split("+").map((part) => part.trim()).filter(Boolean);
  const keyPart = parts[parts.length - 1];
  const wantsMod = parts.includes("$mod");
  const wantsCtrl = parts.includes("Control") || parts.includes("Ctrl");
  const wantsAlt = parts.includes("Alt");
  const wantsShift = parts.includes("Shift");
  const wantsMeta = parts.includes("Meta");

  if (wantsMod && !(event.ctrlKey || event.metaKey)) return false;
  if (wantsCtrl && !event.ctrlKey) return false;
  if (wantsAlt && !event.altKey) return false;
  if (wantsShift && !event.shiftKey) return false;
  if (wantsMeta && !event.metaKey) return false;

  if (!keyPart || ["$mod", "Control", "Ctrl", "Alt", "Shift", "Meta"].includes(keyPart)) return false;
  if (keyPart === "Space") return event.code === "Space";
  if (keyPart === "Escape") return event.key === "Escape";
  if (/^[A-Z]$/.test(keyPart)) return event.key.toUpperCase() === keyPart;
  if (/^[0-9]$/.test(keyPart)) return event.key === keyPart;
  return event.key === keyPart || event.code === keyPart;
}

function modifierHotkeyCode(hotkey: string): string | null {
  const aliases: Record<string, string> = {
    Shift: "ShiftLeft",
    ShiftLeft: "ShiftLeft",
    ShiftRight: "ShiftRight",
    Control: "ControlLeft",
    Ctrl: "ControlLeft",
    ControlLeft: "ControlLeft",
    ControlRight: "ControlRight",
    Alt: "AltLeft",
    AltLeft: "AltLeft",
    AltRight: "AltRight",
    Meta: "MetaLeft",
    MetaLeft: "MetaLeft",
    MetaRight: "MetaRight",
  };
  return aliases[hotkey] || null;
}
