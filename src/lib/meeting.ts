// Meeting session: owns the rolling transcript, periodic summarization,
// and a question-detector that produces "suggested answer" cards.

import { create } from "zustand";
import { getAudio } from "./audio";
import { transcribeChunk } from "./transcribe";
import { useSettings } from "./settings";
import { streamThroughProxy } from "./providers/base";

export interface TranscriptSegment {
  id: string;
  startedAt: number;
  text: string;
  // origin only known if separately tracked; for now we mix into one stream.
}

export interface SuggestedAnswer {
  id: string;
  createdAt: number;
  question: string;
  answer: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

interface MeetingState {
  active: boolean;
  startedAt: number;
  segments: TranscriptSegment[];
  summary: string;
  summarizing: boolean;
  suggestions: SuggestedAnswer[];
  start(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

const TRANSCRIBE_DEFAULT_MODELS = {
  groq: "whisper-large-v3-turbo",
  openai: "whisper-1",
  local: "base",
} as const;

function resolveTranscribeModel(provider: keyof typeof TRANSCRIBE_DEFAULT_MODELS, saved?: string) {
  if (!saved) return TRANSCRIBE_DEFAULT_MODELS[provider];
  if (provider === "groq" && !saved.startsWith("whisper-")) return TRANSCRIBE_DEFAULT_MODELS.groq;
  if (provider === "openai" && !saved.startsWith("whisper-")) return TRANSCRIBE_DEFAULT_MODELS.openai;
  return saved;
}

let _summaryTimer: any = null;
let _unbindChunk: (() => boolean) | null = null;

function fullTranscript(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ").trim();
}

function tail(transcript: string, max = 1200): string {
  return transcript.length <= max ? transcript : transcript.slice(-max);
}

function looksLikeQuestion(text: string): string | null {
  // Take the last sentence; flag a question if it ends with "?" or starts
  // with a question word and is reasonably short.
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (!sentences.length) return null;
  const last = sentences[sentences.length - 1].trim();
  if (!last) return null;
  if (last.endsWith("?")) return last;
  if (/^(what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i.test(last) && last.length < 240) {
    return last;
  }
  return null;
}

export const useMeeting = create<MeetingState>((set, get) => ({
  active: false,
  startedAt: 0,
  segments: [],
  summary: "",
  summarizing: false,
  suggestions: [],

  async start() {
    if (get().active) return;
    const settings = useSettings.getState().settings;
    const audio = getAudio();

    set({ active: true, startedAt: Date.now(), segments: [], summary: "", suggestions: [] });

    const transcribeProvider = settings.meeting.transcribeProvider;
    const transcribeKey = transcribeProvider === "local" ? undefined : settings.providers[transcribeProvider]?.apiKey;
    if (transcribeProvider !== "local" && !transcribeKey) {
      set({ active: false });
      throw new Error(
        `Add a ${transcribeProvider === "groq" ? "Groq" : "OpenAI"} API key in Settings to enable transcription.`,
      );
    }

    // Receive chunks → transcribe → push to transcript
    let inFlight = 0;
    _unbindChunk = audio.onChunk(async (blob) => {
      if (inFlight > 2) return; // backpressure: drop if we're behind
      inFlight++;
      try {
        const res = await transcribeChunk(blob, {
          providerId: transcribeProvider,
          apiKey: transcribeKey,
          baseUrl: settings.meeting.transcribeBaseUrl,
          model: resolveTranscribeModel(transcribeProvider, settings.meeting.transcribeModel),
        });
        const text = res.text.trim();
        if (text) {
          const seg: TranscriptSegment = {
            id: crypto.randomUUID(),
            startedAt: Date.now(),
            text,
          };
          set({ segments: [...get().segments, seg] });
          // Lightweight question detection
          const q = looksLikeQuestion(text);
          if (q) maybeAnswerQuestion(q);
        }
      } catch (e) {
        console.warn("transcribe error", e);
      } finally {
        inFlight--;
      }
    });

    await audio.start({
      mic: settings.meeting.captureMic,
      system: settings.meeting.captureSystem,
      chunkMs: settings.meeting.chunkMs,
    });

    // Periodic summarizer
    _summaryTimer = setInterval(runSummary, settings.meeting.summarizeIntervalMs);
  },

  async stop() {
    await getAudio().stop();
    if (_unbindChunk) { _unbindChunk(); _unbindChunk = null; }
    if (_summaryTimer) { clearInterval(_summaryTimer); _summaryTimer = null; }
    set({ active: false });
  },

  clear() {
    set({ segments: [], summary: "", suggestions: [] });
  },
}));

async function runSummary() {
  const { segments, summarizing } = useMeeting.getState();
  if (summarizing) return;
  const transcript = fullTranscript(segments);
  if (transcript.length < 200) return;

  const settings = useSettings.getState().settings;
  const providerId = settings.featureProvider.meeting;
  const cfg = settings.providers[providerId];
  const apiKey = cfg?.apiKey;
  if (providerId !== "ollama" && providerId !== "claude-code-sdk" && providerId !== "codex-cli" && !apiKey) return;

  useMeeting.setState({ summarizing: true });
  let buf = "";
  try {
    for await (const chunk of streamThroughProxy(providerId, apiKey, cfg?.baseUrl, {
      model: cfg?.model || "claude-sonnet-4-6",
      system:
        "You are summarizing an ongoing meeting transcript. Produce a tight, well-formatted Markdown digest with:\n## Recent\n2-3 bullets on the last segment.\n## Decisions\nAny decisions made (or 'None yet').\n## Action items\nBulleted list of tasks + the apparent owner (or 'None yet').\nKeep it under 150 words.",
      messages: [{ role: "user", content: [{ type: "text", text: tail(transcript, 4000) }] }],
      maxTokens: 600,
      thinkingEnabled: cfg?.thinkingEnabled,
      reasoningEffort: cfg?.reasoningEffort,
    })) {
      if (chunk.type === "text-delta" && chunk.text) {
        buf += chunk.text;
        useMeeting.setState({ summary: buf });
      }
    }
  } catch (e) {
    console.warn("summary error", e);
  } finally {
    useMeeting.setState({ summarizing: false });
  }
}

async function maybeAnswerQuestion(question: string) {
  const { suggestions } = useMeeting.getState();
  // Don't double-fire on near-identical questions
  if (suggestions.some((s) => s.question === question)) return;

  const settings = useSettings.getState().settings;
  const providerId = settings.featureProvider.meeting;
  const cfg = settings.providers[providerId];
  const apiKey = cfg?.apiKey;
  if (providerId !== "ollama" && providerId !== "claude-code-sdk" && providerId !== "codex-cli" && !apiKey) return;

  const id = crypto.randomUUID();
  const initial: SuggestedAnswer = {
    id,
    createdAt: Date.now(),
    question,
    answer: "",
    status: "streaming",
  };
  useMeeting.setState({ suggestions: [initial, ...suggestions].slice(0, 8) });

  try {
    for await (const chunk of streamThroughProxy(providerId, apiKey, cfg?.baseUrl, {
      model: cfg?.model || "claude-sonnet-4-6",
      system:
        "You're whispering a suggested answer to the user in a live meeting. They were just asked a question. Give a sharp, professional answer in 2-3 sentences. No preamble.",
      messages: [{ role: "user", content: [{ type: "text", text: question }] }],
      maxTokens: 250,
      thinkingEnabled: cfg?.thinkingEnabled,
      reasoningEffort: cfg?.reasoningEffort,
    })) {
      if (chunk.type === "text-delta" && chunk.text) {
        const list = useMeeting.getState().suggestions.map((s) =>
          s.id === id ? { ...s, answer: s.answer + chunk.text } : s,
        );
        useMeeting.setState({ suggestions: list });
      } else if (chunk.type === "error") {
        const list = useMeeting.getState().suggestions.map((s) =>
          s.id === id ? { ...s, status: "error" as const, error: chunk.error } : s,
        );
        useMeeting.setState({ suggestions: list });
        return;
      }
    }
    const list = useMeeting.getState().suggestions.map((s) => (s.id === id ? { ...s, status: "done" as const } : s));
    useMeeting.setState({ suggestions: list });
  } catch (e: any) {
    const list = useMeeting.getState().suggestions.map((s) =>
      s.id === id ? { ...s, status: "error" as const, error: e?.message || String(e) } : s,
    );
    useMeeting.setState({ suggestions: list });
  }
}
