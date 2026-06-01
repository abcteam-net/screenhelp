"use client";

import { useEffect, useState } from "react";
import { Monitor, Square, AppWindow, MonitorPlay, MicOff, Mic, ScanLine } from "lucide-react";
import { getCapture } from "@/lib/capture";
import { useSettings } from "@/lib/settings";
import { GlassPanel, SectionHeader } from "./ui/GlassPanel";

export function CaptureControls() {
  const settings = useSettings((s) => s.settings);
  const save = useSettings((s) => s.save);
  const [active, setActive] = useState(false);
  const [withAudio, setWithAudio] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const c = getCapture();
    setActive(c.isActive());
    const unsubscribe = c.onChange(setActive);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!active) { setPreviewUrl(null); return; }
    let stop = false;
    const tick = async () => {
      const f = await getCapture().grabFrame();
      if (f && !stop) setPreviewUrl(f.dataUrl);
      if (!stop) setTimeout(tick, 1500);
    };
    tick();
    return () => { stop = true; };
  }, [active]);

  const start = async () => {
    try {
      await getCapture().start({ surface: settings.capturePreset, audio: withAudio });
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Capture cancelled or blocked." }));
    }
  };

  const stop = async () => { await getCapture().stop(); };

  return (
    <GlassPanel padding="md" className="animate-fade-in">
      <SectionHeader
        icon={<ScanLine size={14} />}
        title="Capture"
        meta={active ? "Live" : "Off"}
      />

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <PresetButton
          icon={<Monitor size={13} />}
          label="Screen"
          active={settings.capturePreset === "screen"}
          onClick={() => save({ capturePreset: "screen" })}
        />
        <PresetButton
          icon={<AppWindow size={13} />}
          label="Window"
          active={settings.capturePreset === "window"}
          onClick={() => save({ capturePreset: "window" })}
        />
        <PresetButton
          icon={<MonitorPlay size={13} />}
          label="Tab"
          active={settings.capturePreset === "tab"}
          onClick={() => save({ capturePreset: "tab" })}
        />
      </div>

      <button
        onClick={() => setWithAudio((v) => !v)}
        className={`w-full text-[11px] px-2.5 py-1.5 rounded-md border flex items-center justify-center gap-1.5 transition-all mb-3 ${
          withAudio
            ? "border-accent/30 bg-accent-glow text-accent"
            : "border-border bg-bg-panel text-text-muted hover:border-border-strong hover:bg-bg-deep"
        }`}
      >
        {withAudio ? <Mic size={11} /> : <MicOff size={11} />}
        Capture audio
      </button>

      {active ? (
        <button
          onClick={stop}
          className="w-full text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-2 border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15 transition-all"
        >
          <Square size={13} fill="currentColor" />
          Stop sharing
        </button>
      ) : (
        <button
          onClick={start}
          className="w-full btn-primary text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-2"
        >
          <Monitor size={13} />
          Start sharing
        </button>
      )}

      {previewUrl && (
        <div className="mt-3 rounded-md overflow-hidden border border-border animate-fade-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="w-full block" />
        </div>
      )}
    </GlassPanel>
  );
}

function PresetButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all ${
        active
          ? "border-accent/30 bg-accent-glow text-accent"
          : "border-border bg-bg-panel text-text-muted hover:bg-bg-deep hover:border-border-strong"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
