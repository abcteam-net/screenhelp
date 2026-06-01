"use client";

import { useEffect, useRef } from "react";
import { Copy, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { useSession } from "@/lib/session";
import { Markdown } from "./Markdown";
import { GlassPanel } from "./ui/GlassPanel";

export function AnswerPanel({ className = "" }: { className?: string }) {
  const current = useSession((s) => s.current);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [current?.answer]);

  if (!current) {
    return (
      <GlassPanel padding="lg" className={`text-center animate-fade-in ${className}`}>
        <div className="w-12 h-12 mx-auto rounded-lg bg-accent-glow flex items-center justify-center mb-3 border border-accent/20">
          <Sparkles size={20} className="text-accent" />
        </div>
        <div className="text-sm font-medium text-text mb-1.5">Ready when you are</div>
        <div className="text-xs text-text-muted leading-relaxed max-w-xs mx-auto">
          Share a window, then press <kbd>⌘/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>, or type a question above.
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel padding="none" className={`overflow-hidden animate-slide-up flex flex-col min-h-0 ${className}`}>
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between text-[11px] text-text-muted bg-bg-panel">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-text capitalize">{current.mode.replace("-", " ")}</span>
          <span className="text-text-subtle">/</span>
          <span className="truncate">{current.providerId} / {current.model}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {current.status === "streaming" && (
            <span className="flex items-center gap-1 text-accent">
              <Loader2 size={11} className="animate-spin" />
              streaming
            </span>
          )}
          {current.status === "done" && current.answer && (
            <button
              onClick={() => navigator.clipboard.writeText(current.answer)}
              className="hover:text-text flex items-center gap-1 transition-colors"
              title="Copy answer"
            >
              <Copy size={11} />
              Copy
            </button>
          )}
        </div>
      </div>

      <div ref={ref} className="p-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {current.question && (
          <div className="text-xs text-text-muted mb-3 italic border-l-2 border-border pl-3">
            {current.question}
          </div>
        )}

        {current.status === "error" ? (
          <div className="flex items-start gap-2 text-danger text-sm bg-danger/5 border border-danger/20 rounded-md p-3">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>{current.error || "Something went wrong."}</div>
          </div>
        ) : (
          <Markdown text={current.answer} />
        )}

        {current.status === "streaming" && !current.answer && (
          <div className="text-text-muted text-sm flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" />
            Thinking…
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
