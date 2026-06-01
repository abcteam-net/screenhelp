"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, X, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Terminal, Keyboard } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { ALL_PROVIDERS, PROVIDER_LABELS, getProvider } from "@/lib/providers";
import type { FeatureMode, ProviderId, Settings } from "@/lib/types";

const FEATURE_MODES: { id: FeatureMode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "answer-now", label: "Answer now" },
  { id: "interview", label: "Interview" },
  { id: "live-watch", label: "Live watch" },
  { id: "meeting", label: "Meeting" },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const settings = useSettings((s) => s.settings);
  const save = useSettings((s) => s.save);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("claude-code-sdk");

  const current = draft || settings;
  const dirty = draft ? JSON.stringify(draft) !== JSON.stringify(settings) : false;

  const openSettings = () => {
    setDraft(structuredClone(settings));
    setSaveState("idle");
    setOpen(true);
  };

  const updateDraft = (partial: Partial<Settings>) => {
    setDraft((prev) => deepMerge(prev || settings, partial));
    setSaveState("idle");
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaveState("saving");
    await save(draft);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1200);
  };

  const resetDraft = () => {
    setDraft(structuredClone(settings));
    setSaveState("idle");
  };

  return (
    <>
      <button
        onClick={openSettings}
        className="text-sm text-text-muted hover:text-text flex items-center gap-1.5"
      >
        <SettingsIcon size={14} />
        Settings
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-text/25 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close settings"
            className="hidden sm:block flex-1 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="bg-bg-elevated border-l border-border w-full sm:max-w-2xl h-dvh max-h-dvh flex flex-col shadow-glass-lg">
            <div className="shrink-0 bg-bg-elevated px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-medium">Settings</div>
                <div className="text-xs text-text-subtle mt-0.5">Providers, shortcuts, and live screen behavior</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-subtle">
                  {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : dirty ? "Unsaved changes" : "No changes"}
                </span>
                <button
                  onClick={resetDraft}
                  disabled={!dirty || saveState === "saving"}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-panel text-text-muted hover:text-text disabled:opacity-40"
                >
                  Reset
                </button>
                <button
                  onClick={saveDraft}
                  disabled={!dirty || saveState === "saving"}
                  className="btn-primary text-xs px-3 py-1.5 rounded-md disabled:opacity-40"
                >
                  Save
                </button>
                <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3">Providers & API keys</h3>
                <ProviderConfigPanel
                  id={selectedProvider}
                  current={current}
                  reveal={reveal}
                  onSelectProvider={setSelectedProvider}
                  onToggleReveal={(id) => setReveal((r) => ({ ...r, [id]: !r[id] }))}
                  updateDraft={updateDraft}
                />
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">Provider per feature</h3>
                <div className="grid grid-cols-2 gap-2">
                  {FEATURE_MODES.map((f) => (
                    <label key={f.id} className="flex items-center justify-between gap-2 border border-border-subtle bg-bg-panel rounded-md px-3 py-2">
                      <span className="text-sm">{f.label}</span>
                      <select
                        value={current.featureProvider[f.id]}
                        onChange={(e) => updateDraft({ featureProvider: { [f.id]: e.target.value as ProviderId } as any })}
                        className="bg-bg-elevated border border-border rounded px-2 py-1 text-xs"
                      >
                        {ALL_PROVIDERS.map((p) => (
                          <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">Hotkeys</h3>
                <div className="space-y-2">
                  <HotkeyRecorder
                    label="Answer now"
                    value={current.hotkey}
                    onChange={(hotkey) => updateDraft({ hotkey })}
                  />
                  <HotkeyRecorder
                    label="Cumulative answer"
                    value={current.cumulativeHotkey}
                    onChange={(cumulativeHotkey) => updateDraft({ cumulativeHotkey })}
                  />
                  <HotkeyRecorder
                    label="Interview mode"
                    value={current.interviewHotkey}
                    onChange={(interviewHotkey) => updateDraft({ interviewHotkey })}
                  />
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={current.remote.enabled}
                      onChange={(e) => updateDraft({ remote: { enabled: e.target.checked } as any })}
                    />
                    Remote keyboard listening
                  </label>
                  <HotkeyRecorder
                    label="Remote instant capture"
                    value={current.remote.instantHotkey}
                    onChange={(instantHotkey) => updateDraft({ remote: { instantHotkey } as any })}
                  />
                  <HotkeyRecorder
                    label="Remote cumulative capture"
                    value={current.remote.cumulativeHotkey}
                    onChange={(cumulativeHotkey) => updateDraft({ remote: { cumulativeHotkey } as any })}
                  />
                  <HotkeyRecorder
                    label="Remote toggle listening"
                    value={current.remote.toggleListeningHotkey}
                    onChange={(toggleListeningHotkey) => updateDraft({ remote: { toggleListeningHotkey } as any })}
                  />
                </div>
                <div className="text-xs text-text-subtle mt-1">
                  Click Record, press a key combination, or edit the field manually. Remote keys work on the /remote page while that page is focused. <code>$mod</code> = ⌘ on macOS, Ctrl elsewhere.
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">Meeting assistant</h3>
                <label className="text-xs text-text-muted block mb-2">
                  Transcription provider
                  <select
                    value={current.meeting.transcribeProvider}
                    onChange={(e) => {
                      const transcribeProvider = e.target.value as "openai" | "groq" | "local";
                      updateDraft({
                        meeting: {
                          transcribeProvider,
                          transcribeModel:
                            transcribeProvider === "groq"
                              ? "whisper-large-v3-turbo"
                              : transcribeProvider === "openai"
                                ? "whisper-1"
                                : "base",
                        } as any,
                      });
                    }}
                    className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                  >
                    <option value="groq">Groq Whisper</option>
                    <option value="openai">OpenAI Whisper</option>
                    <option value="local">Local Whisper (OpenAI-compatible)</option>
                  </select>
                </label>
                {current.meeting.transcribeProvider !== "local" && (
                  <label className="text-xs text-text-muted block mb-2">
                    Transcription model
                    <input
                      list="transcription-model-options"
                      value={current.meeting.transcribeModel || ""}
                      onChange={(e) => updateDraft({ meeting: { transcribeModel: e.target.value } as any })}
                      placeholder={
                        current.meeting.transcribeProvider === "groq"
                          ? "whisper-large-v3-turbo"
                          : "whisper-1"
                      }
                      className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                    />
                    <datalist id="transcription-model-options">
                      <option value="whisper-large-v3-turbo" />
                      <option value="whisper-large-v3" />
                      <option value="whisper-1" />
                    </datalist>
                  </label>
                )}
                {current.meeting.transcribeProvider === "local" && (
                  <div className="space-y-2 mb-2">
                    <label className="text-xs text-text-muted block">
                      Local transcription URL
                      <input
                        value={current.meeting.transcribeBaseUrl || ""}
                        onChange={(e) => updateDraft({ meeting: { transcribeBaseUrl: e.target.value } as any })}
                        placeholder="http://localhost:8000/v1/audio/transcriptions"
                        className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-xs text-text-muted block">
                      Local model
                      <input
                        value={current.meeting.transcribeModel || ""}
                        onChange={(e) => updateDraft({ meeting: { transcribeModel: e.target.value } as any })}
                        placeholder="Systran/faster-whisper-small"
                        className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={current.meeting.captureMic}
                      onChange={(e) => updateDraft({ meeting: { captureMic: e.target.checked } as any })}
                    />
                    Capture mic
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={current.meeting.captureSystem}
                      onChange={(e) => updateDraft({ meeting: { captureSystem: e.target.checked } as any })}
                    />
                    Capture system audio
                  </label>
                </div>
                <label className="text-xs text-text-muted block mt-2">
                  Chunk size (ms) — smaller = lower latency
                  <input
                    type="number"
                    min={3000}
                    step={1000}
                    value={current.meeting.chunkMs}
                    onChange={(e) => updateDraft({ meeting: { chunkMs: Number(e.target.value) } as any })}
                    className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                  />
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">Interview overlay</h3>
                <label className="text-xs text-text-muted block mb-2">
                  Opacity ({Math.round(current.interview.overlayOpacity * 100)}%)
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={current.interview.overlayOpacity}
                    onChange={(e) => updateDraft({ interview: { overlayOpacity: Number(e.target.value) } as any })}
                    className="w-full"
                  />
                </label>
                <label className="text-xs text-text-muted block">
                  Type-out speed (wpm)
                  <input
                    type="number"
                    min={20}
                    max={300}
                    value={current.interview.typeWpm}
                    onChange={(e) => updateDraft({ interview: { typeWpm: Number(e.target.value) } as any })}
                    className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                  />
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">Live watch</h3>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={current.liveWatch.enabled}
                    onChange={(e) => updateDraft({ liveWatch: { enabled: e.target.checked } as any })}
                  />
                  Watch screen continuously and suggest help when it changes
                </label>
                <label className="text-xs text-text-muted block">
                  Sample interval (ms)
                  <input
                    type="number"
                    value={current.liveWatch.intervalMs}
                    min={1500}
                    step={500}
                    onChange={(e) => updateDraft({ liveWatch: { intervalMs: Number(e.target.value) } as any })}
                    className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
                  />
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3">YAML config</h3>
                <textarea
                  readOnly
                  value={toYaml(current)}
                  className="w-full min-h-[320px] resize-y rounded-md border border-border bg-bg-panel px-3 py-2 font-mono text-xs text-text focus:outline-none"
                />
                <div className="text-xs text-text-subtle mt-1">
                  Read-only preview of the settings draft. Use Save to apply changes above.
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(patch as any)) {
    const value = (patch as any)[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge((base as any)[key] ?? {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function toYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return `${pad}-\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}- ${formatYamlScalar(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const safeKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
        if (item && typeof item === "object") {
          return `${pad}${safeKey}:\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}${safeKey}: ${formatYamlScalar(item)}`;
      })
      .join("\n");
  }

  return `${pad}${formatYamlScalar(value)}`;
}

function formatYamlScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (text === "") return '""';
  if (/^[A-Za-z0-9_./:@+$-]+$/.test(text) && !["true", "false", "null"].includes(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function ProviderConfigPanel({
  id,
  current,
  reveal,
  onSelectProvider,
  onToggleReveal,
  updateDraft,
}: {
  id: ProviderId;
  current: Settings;
  reveal: Record<string, boolean>;
  onSelectProvider: (id: ProviderId) => void;
  onToggleReveal: (id: ProviderId) => void;
  updateDraft: (partial: Partial<Settings>) => void;
}) {
  const provider = getProvider(id);
  const cfg = current.providers[id] || {};

  return (
    <div className="space-y-3">
      <label className="text-xs text-text-muted block">
        Provider
        <select
          value={id}
          onChange={(e) => onSelectProvider(e.target.value as ProviderId)}
          className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mt-1 focus:outline-none focus:border-accent"
        >
          {ALL_PROVIDERS.map((providerId) => (
            <option key={providerId} value={providerId}>{PROVIDER_LABELS[providerId]}</option>
          ))}
        </select>
      </label>

      <div className="border border-border-subtle rounded-md p-3 bg-bg-panel">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">{PROVIDER_LABELS[id]}</div>
          <div className="text-xs text-text-subtle">
            {provider.capabilities.vision && "vision · "}
            {provider.capabilities.audio && "audio · "}
            streaming
          </div>
        </div>

        {id === "claude-code-sdk" ? (
          <ClaudeCodeConfig
            baseUrl={cfg.baseUrl || "http://localhost:8787"}
            onChange={(url) => updateDraft({ providers: { [id]: { baseUrl: url } } as any })}
          />
        ) : id === "codex-cli" ? (
          <CodexCliConfig
            baseUrl={cfg.baseUrl || "http://localhost:8787"}
            onChange={(url) => updateDraft({ providers: { [id]: { baseUrl: url } } as any })}
          />
        ) : id !== "ollama" ? (
          <div className="space-y-2 mb-2">
            <div className="relative">
              <input
                type={reveal[id] ? "text" : "password"}
                value={cfg.apiKey || ""}
                onChange={(e) => updateDraft({ providers: { [id]: { apiKey: e.target.value } } as any })}
                placeholder={`${PROVIDER_LABELS[id]} API key`}
                className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm pr-9 focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => onToggleReveal(id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
              >
                {reveal[id] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {(id === "openai" || id === "anthropic") && (
              <input
                value={cfg.baseUrl || ""}
                onChange={(e) => updateDraft({ providers: { [id]: { baseUrl: e.target.value } } as any })}
                placeholder={
                  id === "openai"
                    ? "Custom base URL, e.g. https://api.openai.com/v1"
                    : "Custom base URL, e.g. https://api.anthropic.com"
                }
                className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
              />
            )}
          </div>
        ) : (
          <input
            value={cfg.baseUrl || "http://localhost:11434"}
            onChange={(e) => updateDraft({ providers: { [id]: { baseUrl: e.target.value } } as any })}
            placeholder="http://localhost:11434"
            className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm mb-2 focus:outline-none focus:border-accent"
          />
        )}

        <input
          list={`${id}-model-options`}
          value={cfg.model || provider.defaultModel}
          onChange={(e) => updateDraft({ providers: { [id]: { model: e.target.value } } as any })}
          placeholder="Model id"
          className="w-full bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <datalist id={`${id}-model-options`}>
          {provider.availableModels.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {(id === "claude-code-sdk" || id === "codex-cli") && (
          <ThinkingControls
            enabled={Boolean(cfg.thinkingEnabled)}
            effort={cfg.reasoningEffort || "medium"}
            onEnabled={(thinkingEnabled) => updateDraft({ providers: { [id]: { thinkingEnabled } } as any })}
            onEffort={(reasoningEffort) => updateDraft({ providers: { [id]: { reasoningEffort } } as any })}
          />
        )}
      </div>
    </div>
  );
}

function ThinkingControls({
  enabled,
  effort,
  onEnabled,
  onEffort,
}: {
  enabled: boolean;
  effort: "low" | "medium" | "high" | "xhigh";
  onEnabled: (enabled: boolean) => void;
  onEffort: (effort: "low" | "medium" | "high" | "xhigh") => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-border bg-bg-elevated p-2.5">
      <label className="flex items-center justify-between gap-3 text-xs text-text">
        <span>
          <span className="font-medium">Thinking / reasoning</span>
          <span className="block text-text-subtle mt-0.5">Override model reasoning effort for this local provider.</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
        />
      </label>
      <label className="text-xs text-text-muted block mt-2">
        Effort
        <select
          value={effort}
          disabled={!enabled}
          onChange={(e) => onEffort(e.target.value as "low" | "medium" | "high" | "xhigh")}
          className="w-full bg-bg-panel border border-border rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="xhigh">Extra high</option>
        </select>
      </label>
    </div>
  );
}

function HotkeyRecorder({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    let pendingModifier: string | null = null;
    let recorded = false;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      const modifier = modifierCodeToHotkey(event.code);
      if (modifier && isBareModifierEvent(event)) {
        pendingModifier = modifier;
        return;
      }

      const hotkey = keyboardEventToTinykeys(event);
      if (!hotkey) return;

      recorded = true;
      onChange(hotkey);
      setRecording(false);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!pendingModifier || recorded) return;
      if (modifierCodeToHotkey(event.code) !== pendingModifier) return;
      recorded = true;
      onChange(pendingModifier);
      setRecording(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [onChange, recording]);

  return (
    <label className="text-xs text-text-muted block">
      <span>{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          value={recording ? "Press keys..." : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setRecording(true)}
          readOnly={recording}
          className={`flex-1 bg-bg-elevated border rounded-md px-3 py-1.5 text-sm focus:outline-none font-mono ${
            recording
              ? "border-accent text-accent shadow-glow"
              : "border-border focus:border-accent text-text"
          }`}
        />
        <button
          type="button"
          onClick={() => setRecording((v) => !v)}
          className={`shrink-0 px-3 py-1.5 rounded-md border text-xs flex items-center gap-1.5 ${
            recording
              ? "border-accent/30 bg-accent-glow text-accent"
              : "border-border bg-bg-panel text-text-muted hover:text-text hover:bg-bg-deep"
          }`}
        >
          <Keyboard size={12} />
          {recording ? "Listening" : "Record"}
        </button>
      </div>
    </label>
  );
}

function keyboardEventToTinykeys(event: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("$mod");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const key = normalizeHotkeyKey(event.key, event.code);
  if (!key) return null;

  return [...modifiers, key].join("+");
}

function normalizeHotkeyKey(key: string, code: string): string | null {
  const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta", "OS"]);
  if (modifierKeys.has(key)) return null;

  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  if (key.length === 1) return key.toUpperCase();

  if (/^Key[A-Z]$/.test(code)) return code.replace("Key", "");
  if (/^Digit[0-9]$/.test(code)) return code.replace("Digit", "");

  return key;
}

function modifierCodeToHotkey(code: string): string | null {
  if (
    code === "ControlRight" ||
    code === "ControlLeft" ||
    code === "ShiftRight" ||
    code === "ShiftLeft" ||
    code === "AltRight" ||
    code === "AltLeft" ||
    code === "MetaRight" ||
    code === "MetaLeft"
  ) {
    return code;
  }
  return null;
}

function isBareModifierEvent(event: KeyboardEvent): boolean {
  return ["Shift", "Control", "Alt", "Meta", "OS"].includes(event.key);
}

// Compact panel for the Claude Code provider: no API key, just a bridge URL
// and a live health-check.
function ClaudeCodeConfig({
  baseUrl,
  onChange,
}: {
  baseUrl: string;
  onChange: (url: string) => void;
}) {
  const [url, setUrl] = useState(baseUrl);
  const [status, setStatus] = useState<"unknown" | "checking" | "ok" | "down">("unknown");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { setUrl(baseUrl); }, [baseUrl]);

  const check = async () => {
    setStatus("checking"); setInfo(null);
    try {
      const base = url.replace(/\/$/, "");
      const r = await fetch("/api/bridge-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: base }),
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || `bridge HTTP ${r.status}`);
      setStatus("ok");
      setInfo(`bridge v${j.version || "?"} ready`);
    } catch (e: any) {
      setStatus("down");
      setInfo(e?.message || "bridge not reachable");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-xs text-text-muted bg-bg-panel border border-border-subtle rounded-md p-2.5">
        <Terminal size={13} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-text font-medium mb-0.5">Uses your local Claude Code CLI</div>
          No API key needed if you're already signed in (<code className="font-mono text-[11px]">claude /login</code>). Start the bridge with <code className="font-mono text-[11px]">pnpm bridge</code>, then click Test.
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => onChange(url)}
          placeholder="http://localhost:8787"
          className="flex-1 bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={check}
          className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-panel hover:bg-bg-deep text-text"
        >
          Test
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        {status === "checking" && <><Loader2 size={12} className="animate-spin text-text-muted" /><span className="text-text-muted">checking…</span></>}
        {status === "ok" && <><CheckCircle2 size={12} className="text-success" /><span className="text-success">connected{info ? ` · ${info}` : ""}</span></>}
        {status === "down" && <><AlertCircle size={12} className="text-danger" /><span className="text-danger">{info || "bridge not reachable"}</span></>}
        {status === "unknown" && <span className="text-text-subtle">click Test to verify</span>}
      </div>
    </div>
  );
}

function CodexCliConfig({
  baseUrl,
  onChange,
}: {
  baseUrl: string;
  onChange: (url: string) => void;
}) {
  const [url, setUrl] = useState(baseUrl);
  const [status, setStatus] = useState<"unknown" | "checking" | "ok" | "down">("unknown");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { setUrl(baseUrl); }, [baseUrl]);

  const check = async () => {
    setStatus("checking"); setInfo(null);
    try {
      const base = url.replace(/\/$/, "");
      const r = await fetch("/api/bridge-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: base }),
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || `bridge HTTP ${r.status}`);
      setStatus("ok");
      setInfo(`bridge v${j.version || "?"} ready`);
    } catch (e: any) {
      setStatus("down");
      setInfo(e?.message || "bridge not reachable");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-xs text-text-muted bg-bg-panel border border-border-subtle rounded-md p-2.5">
        <Terminal size={13} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-text font-medium mb-0.5">Uses your local Codex CLI</div>
          No API key needed if you're already signed in (<code className="font-mono text-[11px]">codex login</code>). Start the bridge with <code className="font-mono text-[11px]">pnpm bridge</code>, then click Test.
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => onChange(url)}
          placeholder="http://localhost:8787"
          className="flex-1 bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={check}
          className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-panel hover:bg-bg-deep text-text"
        >
          Test
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        {status === "checking" && <><Loader2 size={12} className="animate-spin text-text-muted" /><span className="text-text-muted">checking…</span></>}
        {status === "ok" && <><CheckCircle2 size={12} className="text-success" /><span className="text-success">connected{info ? ` · ${info}` : ""}</span></>}
        {status === "down" && <><AlertCircle size={12} className="text-danger" /><span className="text-danger">{info || "bridge not reachable"}</span></>}
        {status === "unknown" && <span className="text-text-subtle">click Test to verify</span>}
      </div>
    </div>
  );
}
