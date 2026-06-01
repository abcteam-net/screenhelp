"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { Markdown } from "./Markdown";
import { IconButton } from "./ui/GlassPanel";

export function HistoryDrawer() {
  const [open, setOpen] = useState(false);
  const turns = useSession((s) => s.turns);
  const loadHistory = useSession((s) => s.loadHistory);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <>
      <IconButton title="History" onClick={() => setOpen(true)}>
        <History size={14} />
      </IconButton>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-text/20 backdrop-blur-sm animate-fade-in">
          <button
            type="button"
            aria-label="Close history"
            className="hidden sm:block flex-1 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="glass-strong w-full sm:max-w-[480px] h-dvh max-h-dvh flex flex-col border-l border-border shadow-glass-lg">
            <div className="shrink-0 glass-strong px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-semibold tracking-normal">History</div>
                <div className="text-xs text-text-subtle mt-0.5">Recent screen questions and answers</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
              {turns.length === 0 && (
                <div className="text-sm text-text-muted py-16 text-center">Nothing here yet.</div>
              )}
              {turns.map((t) => (
                <div key={t.id} className="rounded-md border border-border bg-bg-elevated p-3">
                  <div className="text-[10px] text-text-muted mb-1.5 flex items-center gap-2 uppercase tracking-wider font-medium">
                    <span>{t.mode.replace("-", " ")}</span>
                    <span className="text-text-subtle">/</span>
                    <span className="normal-case tracking-normal font-normal">{new Date(t.createdAt).toLocaleString()}</span>
                  </div>
                  {t.question && (
                    <div className="text-xs mb-2 italic text-text-muted border-l-2 border-border pl-2.5">{t.question}</div>
                  )}
                  <Markdown text={t.answer.slice(0, 600) + (t.answer.length > 600 ? "…" : "")} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
