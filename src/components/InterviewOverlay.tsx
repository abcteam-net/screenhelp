"use client";

import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Eye, EyeOff, X, Copy, Keyboard, Loader2, Pin, PinOff, Code } from "lucide-react";
import { tinykeys } from "tinykeys";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { getCapture } from "@/lib/capture";
import { Markdown } from "./Markdown";

export function InterviewOverlay() {
  const settings = useSettings((s) => s.settings);
  const save = useSettings((s) => s.save);
  const ask = useSession((s) => s.ask);
  const current = useSession((s) => s.current);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 80 });
  const [size, setSize] = useState({ w: 380, h: 460 });
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizingRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const opacity = settings.interview.overlayOpacity;
  const pinned = settings.interview.overlayPinned;
  const wpm = settings.interview.typeWpm;
  const [typing, setTyping] = useState(false);

  // Hotkey to capture and ask in interview mode
  useEffect(() => {
    if (!settings.interviewHotkey) return;
    const unbind = tinykeys(window, {
      [settings.interviewHotkey]: async (e) => {
        e.preventDefault();
        const c = getCapture();
        if (!c.isActive()) {
          window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing first." }));
          return;
        }
        setOpen(true);
        const frame = await c.grabFrame();
        await ask({ mode: "interview", imageDataUrl: frame?.dataUrl });
      },
    });
    return unbind;
  }, [settings.interviewHotkey, ask]);

  // Drag
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (draggingRef.current) {
        setPos({ x: e.clientX - draggingRef.current.dx, y: e.clientY - draggingRef.current.dy });
      }
      if (resizingRef.current) {
        const r = resizingRef.current;
        setSize({
          w: Math.max(280, r.sw + (e.clientX - r.sx)),
          h: Math.max(240, r.sh + (e.clientY - r.sy)),
        });
      }
    }
    function onUp() { draggingRef.current = null; resizingRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const showAnswer = current?.mode === "interview" && (current.status === "streaming" || current.status === "done");
  const answer = showAnswer ? current.answer : "";

  const typeOut = async () => {
    if (!answer) return;
    setTyping(true);
    const delay = Math.max(8, Math.round(60_000 / (wpm * 5))); // ms per char (5 chars/word)
    try {
      // Best-effort: paste in small slices via clipboard
      for (let i = 0; i < answer.length; i += 4) {
        const slice = answer.slice(0, i + 4);
        await navigator.clipboard.writeText(slice);
        await new Promise((r) => setTimeout(r, delay * 4));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Clipboard blocked. Paste manually." }));
    }
    setTyping(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 bg-bg-elevated border border-border hover:border-accent text-text rounded-full px-3 py-2 text-xs flex items-center gap-1.5 shadow-lg"
      >
        <Code size={12} /> Interview mode
        <span className="text-text-subtle ml-1 font-mono text-[10px]">{settings.interviewHotkey.replace("$mod", "⌘/Ctrl")}</span>
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 select-none shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        opacity,
      }}
    >
      <div className="bg-bg-elevated border border-border rounded-xl h-full flex flex-col overflow-hidden">
        <div
          className="px-3 py-2 border-b border-border-subtle bg-bg-panel flex items-center justify-between cursor-move"
          onMouseDown={(e) => { draggingRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        >
          <div className="flex items-center gap-1.5 text-xs">
            <GripHorizontal size={12} className="text-text-subtle" />
            <span className="font-medium">Interview</span>
            {current?.status === "streaming" && current.mode === "interview" && (
              <Loader2 size={11} className="animate-spin text-accent" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              title="Toggle pin"
              onClick={() => save({ interview: { overlayPinned: !pinned } as any })}
              className="text-text-muted hover:text-text p-0.5"
            >
              {pinned ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
            <button
              title="Opacity"
              onClick={() => save({ interview: { overlayOpacity: opacity > 0.55 ? 0.5 : 0.95 } as any })}
              className="text-text-muted hover:text-text p-0.5"
            >
              {opacity > 0.55 ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button title="Close" onClick={() => setOpen(false)} className="text-text-muted hover:text-text p-0.5">
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 text-sm">
          {!answer ? (
            <div className="text-text-subtle text-xs">
              Press <kbd className="px-1 py-0.5 bg-bg-panel border border-border rounded font-mono">{settings.interviewHotkey.replace("$mod", "⌘/Ctrl")}</kbd> to capture the problem and get an interview-ready answer.
            </div>
          ) : current?.status === "error" ? (
            <div className="text-danger text-xs">{current.error}</div>
          ) : (
            <Markdown text={answer} />
          )}
        </div>

        <div className="px-3 py-2 border-t border-border-subtle bg-bg-panel flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => answer && navigator.clipboard.writeText(answer)}
              disabled={!answer}
              className="text-text-muted hover:text-text flex items-center gap-1 disabled:opacity-50"
            >
              <Copy size={11} /> Copy
            </button>
            <button
              onClick={typeOut}
              disabled={!answer || typing}
              className="text-text-muted hover:text-text flex items-center gap-1 disabled:opacity-50"
            >
              <Keyboard size={11} /> {typing ? "Streaming…" : "Stream to clipboard"}
            </button>
          </div>
          <span className="text-text-subtle font-mono text-[10px]">{wpm} wpm</span>
        </div>

        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
          onMouseDown={(e) => { resizingRef.current = { sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h }; }}
        >
          <div className="w-full h-full border-r-2 border-b-2 border-text-subtle/40 rounded-br" />
        </div>
      </div>
    </div>
  );
}
