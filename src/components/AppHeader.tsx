"use client";

import { Sparkles } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { getCapture } from "@/lib/capture";
import { useEffect, useState } from "react";
import { HistoryDrawer } from "./HistoryDrawer";
import { SettingsPanel } from "./SettingsPanel";

export function AppHeader() {
  const hotkey = useSettings((s) => s.settings.hotkey);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const c = getCapture();
    setSharing(c.isActive());
    const unsubscribe = c.onChange(setSharing);
    return () => { unsubscribe(); };
  }, []);

  return (
    <header className="sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 pt-4">
        <div className="glass-strong rounded-2xl flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-accent via-accent-glow to-pink-400 flex items-center justify-center shadow-glow">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight leading-tight">ScreenHelp</div>
              <div className="text-[10px] text-text-subtle leading-tight">on-screen AI co-pilot</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusPill sharing={sharing} />
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-text-muted px-2 py-1 rounded-md bg-white/[0.03] border border-white/5">
              <kbd>{hotkey.replace("$mod", "⌘")}</kbd>
              <span>answer</span>
            </div>
            <div className="w-px h-5 bg-white/10" />
            <HistoryDrawer />
            <SettingsPanel />
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ sharing }: { sharing: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
        sharing
          ? "border-success/30 bg-success/10 text-success"
          : "border-white/8 bg-white/[0.03] text-text-muted"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${sharing ? "bg-success pulse-dot" : "bg-text-subtle"}`}
      />
      {sharing ? "Sharing" : "Idle"}
    </div>
  );
}
