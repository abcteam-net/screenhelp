"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { Bot, BookOpen, Keyboard, Mic, MonitorUp, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings2, Workflow } from "lucide-react";
import { CaptureControls } from "@/components/CaptureControls";
import { AskBar, QuickAskActions } from "@/components/AskBar";
import { AnswerPanel } from "@/components/AnswerPanel";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { SettingsPanel } from "@/components/SettingsPanel";
import { HotkeyManager } from "@/components/HotkeyManager";
import { LiveWatcher } from "@/components/LiveWatcher";
import { Toaster } from "@/components/Toaster";
import { MeetingPanel } from "@/components/MeetingPanel";
import { InterviewOverlay } from "@/components/InterviewOverlay";
import { ExtensionBridge } from "@/components/ExtensionBridge";
import { RemoteControlListener } from "@/components/RemoteControlListener";
import { RemoteQrCard } from "@/components/RemoteQrCard";
import { useSettings } from "@/lib/settings";
import { useMeeting } from "@/lib/meeting";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Workspace = "answer" | "meeting" | "live" | "setup";

const WORKSPACES: { id: Workspace; label: string; icon: React.ReactNode }[] = [
  { id: "answer", label: "Answers", icon: <MonitorUp size={14} /> },
  { id: "meeting", label: "Meeting notes", icon: <BookOpen size={14} /> },
  { id: "live", label: "Live watch", icon: <Workflow size={14} /> },
  { id: "setup", label: "Setup", icon: <Settings2 size={14} /> },
];

export default function Home() {
  const load = useSettings((s) => s.load);
  const hotkey = useSettings((s) => s.settings.hotkey);
  const liveWatch = useSettings((s) => s.settings.liveWatch);
  const saveSettings = useSettings((s) => s.save);
  const meetingActive = useMeeting((s) => s.active);
  const [workspace, setWorkspace] = useState<Workspace>("answer");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-bg-elevated/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#37352f] flex items-center justify-center">
              <Bot size={15} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold">screenhelp.ai</div>
              <div className="text-[10px] text-text-subtle leading-none">contextual AI for what is on screen</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLeftOpen((v) => !v)}
                className="text-text-muted hover:text-text p-1 rounded-md hover:bg-bg-panel"
                title={leftOpen ? "Hide left side" : "Show left side"}
              >
                {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
              <button
                onClick={() => setRightOpen((v) => !v)}
                className="text-text-muted hover:text-text p-1 rounded-md hover:bg-bg-panel"
                title={rightOpen ? "Hide right side" : "Show right side"}
              >
                {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </div>
            <span className="text-xs text-text-subtle hidden sm:inline">
              Hotkey: <kbd className="px-1.5 py-0.5 rounded bg-bg-panel border border-border text-text font-mono">{hotkey}</kbd>
            </span>
            <HistoryDrawer />
            <SettingsPanel />
          </div>
        </div>
      </header>

      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-5 py-5 grid grid-cols-1 gap-5 lg:h-[calc(100dvh-57px)] lg:overflow-hidden ${
          leftOpen && rightOpen
            ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]"
            : leftOpen
              ? "lg:grid-cols-[240px_minmax(0,1fr)]"
              : rightOpen
                ? "lg:grid-cols-[minmax(0,1fr)_280px]"
                : "lg:grid-cols-1"
        }`}
      >
        {leftOpen && <aside className="space-y-3 lg:overflow-y-auto scrollbar-thin">
          <div className="rounded-lg border border-border bg-bg-elevated p-3">
            <div className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold mb-2">Workspace</div>
            <nav className="space-y-1 text-sm">
              {WORKSPACES.map((item) => (
                <WorkspaceItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={workspace === item.id}
                  onClick={() => setWorkspace(item.id)}
                />
              ))}
            </nav>
          </div>
          {workspace !== "meeting" && <CaptureControls />}
        </aside>}

        <section className="space-y-4 min-w-0 min-h-0 lg:overflow-hidden">
          {workspace === "answer" && (
            <div className="h-full min-h-0 flex flex-col gap-4">
              <AskBar showPresets={false} />
              <AnswerPanel className="flex-1" />
            </div>
          )}

          {workspace === "meeting" && <MeetingWorkspace />}

          {workspace === "live" && (
            <LiveWorkspace
              enabled={liveWatch.enabled}
              intervalMs={liveWatch.intervalMs}
              onToggle={(enabled) => saveSettings({ liveWatch: { enabled } as any })}
              onInterval={(intervalMs) => saveSettings({ liveWatch: { intervalMs } as any })}
            />
          )}

          {workspace === "setup" && (
            <>
              <CaptureControls />
              <GlassPanel padding="md">
                <div className="text-sm font-semibold mb-2">Remote control</div>
                <div className="text-xs text-text-muted leading-relaxed">
                  Open <code>/remote</code> on another device to trigger instant or cumulative captures. Configure its hotkeys in Settings.
                </div>
              </GlassPanel>
            </>
          )}
        </section>

        {rightOpen && <aside className="space-y-3 lg:overflow-y-auto scrollbar-thin">
          <RemoteQrCard />
          <QuickAskActions />
          <div className="rounded-lg border border-border bg-bg-elevated p-4 text-sm">
            <div className="font-semibold text-text mb-3 flex items-center gap-2">
              <Keyboard size={14} />
              Status
            </div>
            <div className="space-y-2 text-xs text-text-muted">
              <div className="flex items-center justify-between"><span>Answer hotkey</span><kbd className="font-mono text-text">{hotkey}</kbd></div>
              <div className="flex items-center justify-between"><span>Live watch</span><span className={liveWatch.enabled ? "text-success" : ""}>{liveWatch.enabled ? "On" : "Off"}</span></div>
              <div className="flex items-center justify-between"><span>Meeting</span><span className={meetingActive ? "text-success" : ""}>{meetingActive ? "Recording" : "Idle"}</span></div>
            </div>
          </div>
        </aside>}
      </main>

      <HotkeyManager />
      <LiveWatcher />
      <RemoteControlListener />
      <InterviewOverlay />
      <ExtensionBridge />
      <Toaster />
    </div>
  );
}

function WorkspaceItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${active ? "bg-bg-deep text-text" : "text-text-muted hover:bg-bg-panel"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MeetingWorkspace() {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("screenhelp:meeting-notes");
    if (saved) setNotes(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("screenhelp:meeting-notes", notes);
  }, [notes]);

  return (
    <div className="space-y-4">
      <GlassPanel padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-bg-panel flex items-center gap-2">
          <Mic size={14} />
          <div className="text-sm font-semibold">Meeting notes</div>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write decisions, follow-ups, names, links, and anything you want to keep from the meeting..."
          className="w-full min-h-[260px] resize-y bg-transparent p-4 text-sm text-text outline-none"
        />
      </GlassPanel>
      <MeetingPanel />
    </div>
  );
}

function LiveWorkspace({
  enabled,
  intervalMs,
  onToggle,
  onInterval,
}: {
  enabled: boolean;
  intervalMs: number;
  onToggle: (enabled: boolean) => void;
  onInterval: (intervalMs: number) => void;
}) {
  return (
    <div className="space-y-4">
      <GlassPanel padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Live watch</div>
            <div className="text-xs text-text-muted mt-1">Watch the shared screen and answer only when something actionable appears.</div>
          </div>
          <button
            onClick={() => onToggle(!enabled)}
            className={`px-3 py-2 rounded-md text-xs font-medium border ${
              enabled ? "border-success/30 bg-success/10 text-success" : "border-border bg-bg-panel text-text-muted hover:text-text"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <label className="text-xs text-text-muted block mt-4">
          Sample interval
          <input
            type="number"
            min={1500}
            step={500}
            value={intervalMs}
            onChange={(e) => onInterval(Number(e.target.value))}
            className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
          />
        </label>
      </GlassPanel>
      <AnswerPanel />
    </div>
  );
}
