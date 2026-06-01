"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, MessageCircle, Loader2, AlertCircle, Copy } from "lucide-react";
import { useMeeting } from "@/lib/meeting";
import { Markdown } from "./Markdown";
import { GlassPanel, SectionHeader } from "./ui/GlassPanel";

export function MeetingPanel() {
  const active = useMeeting((s) => s.active);
  const segments = useMeeting((s) => s.segments);
  const summary = useMeeting((s) => s.summary);
  const summarizing = useMeeting((s) => s.summarizing);
  const suggestions = useMeeting((s) => s.suggestions);
  const start = useMeeting((s) => s.start);
  const stop = useMeeting((s) => s.stop);
  const clear = useMeeting((s) => s.clear);

  const [err, setErr] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [segments.length]);

  const toggle = async () => {
    setErr(null);
    try {
      if (active) await stop();
      else await start();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  return (
    <GlassPanel padding="none" className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-bg-panel">
        <SectionHeader
          icon={<Mic size={14} className={active ? "text-success" : ""} />}
          title="Meeting assistant"
          meta={
            active ? (
              <span className="flex items-center gap-1.5 text-success text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
                recording
              </span>
            ) : undefined
          }
        />
        <div className="flex items-center gap-2 -mt-3">
          {segments.length > 0 && (
            <button onClick={clear} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1">
              <Trash2 size={11} /> Clear
            </button>
          )}
          <button
            onClick={toggle}
            className={`text-[11px] px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-all ${
              active
                ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15"
                : "btn-primary"
            }`}
          >
            {active ? (<><Square size={10} fill="currentColor" />Stop</>) : (<><Mic size={11} />Start</>)}
          </button>
        </div>
      </div>

      {err && (
        <div className="px-4 py-2 bg-danger/5 border-b border-danger/20 text-danger text-[11px] flex items-start gap-2">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2 flex items-center justify-between">
            <span>Live transcript</span>
            {summarizing && (
              <span className="text-accent flex items-center gap-1 normal-case tracking-normal font-normal">
                <Loader2 size={10} className="animate-spin" /> summarizing
              </span>
            )}
          </div>
          <div ref={transcriptRef} className="max-h-[240px] overflow-y-auto scrollbar-thin text-[13px] leading-relaxed space-y-1.5">
            {segments.length === 0 ? (
              <div className="text-text-subtle text-xs">
                {active ? "Listening…" : "Press Start to begin live transcription."}
              </div>
            ) : (
              segments.map((s) => (
                <div key={s.id} className="text-text">
                  <span className="text-text-subtle text-[10px] mr-1.5 font-mono">{new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  {s.text}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2 flex items-center justify-between">
            <span>Rolling summary</span>
            {summary && (
              <button onClick={() => navigator.clipboard.writeText(summary)} className="text-text-muted hover:text-text flex items-center gap-1 normal-case tracking-normal font-normal">
                <Copy size={10} /> Copy
              </button>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
            {summary ? <Markdown text={summary} /> : (
              <div className="text-text-subtle text-xs">Summary appears once enough transcript is captured.</div>
            )}
          </div>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="border-t border-border p-4 bg-bg-panel">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2 flex items-center gap-1.5">
            <MessageCircle size={11} />
            Suggested answers
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-md border border-border bg-bg-elevated p-3">
                <div className="text-[11px] text-text-muted mb-1 italic">"{s.question}"</div>
                {s.status === "error" ? (
                  <div className="text-danger text-xs">{s.error}</div>
                ) : (
                  <div className="text-sm text-text">
                    {s.answer}{s.status === "streaming" && <span className="text-text-subtle">…</span>}
                  </div>
                )}
                {s.status === "done" && (
                  <button onClick={() => navigator.clipboard.writeText(s.answer)} className="text-[10px] text-text-muted hover:text-text mt-1.5 flex items-center gap-1">
                    <Copy size={10} /> Copy
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
