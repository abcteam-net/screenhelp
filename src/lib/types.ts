// Shared types for ScreenHelp

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "groq"
  | "ollama"
  | "claude-code-sdk"
  | "codex-cli";

export type FeatureMode =
  | "ask"
  | "answer-now"
  | "interview"
  | "live-watch"
  | "meeting";

export interface ImagePart {
  type: "image";
  mimeType: string; // e.g. "image/png"
  base64: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

export type MessagePart = TextPart | ImagePart;

export interface Message {
  role: "user" | "assistant" | "system";
  content: MessagePart[];
}

export interface ChatInput {
  requestId?: string;
  model: string;
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  signal?: AbortSignal;
}

export interface ChatChunk {
  type: "text-delta" | "done" | "error";
  text?: string;
  error?: string;
}

export interface ProviderCapabilities {
  vision: boolean;
  audio: boolean;
  streaming: boolean;
}

export interface Provider {
  id: ProviderId;
  label: string;
  chat(input: ChatInput): AsyncIterable<ChatChunk>;
  capabilities: ProviderCapabilities;
  defaultModel: string;
  availableModels: string[];
}

// Settings stored in IndexedDB
export interface ProviderSettings {
  apiKey?: string;
  baseUrl?: string; // for Ollama or custom endpoints
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
}

export interface Settings {
  providers: Record<ProviderId, ProviderSettings>;
  featureProvider: Record<FeatureMode, ProviderId>;
  hotkey: string;
  cumulativeHotkey: string;
  interviewHotkey: string;
  remote: {
    enabled: boolean;
    instantHotkey: string;
    cumulativeHotkey: string;
    toggleListeningHotkey: string;
  };
  capturePreset: "screen" | "window" | "tab";
  liveWatch: {
    enabled: boolean;
    intervalMs: number;
    diffThreshold: number;
  };
  meeting: {
    transcribeProvider: "openai" | "groq" | "local";
    transcribeBaseUrl?: string;
    transcribeModel?: string;
    chunkMs: number;
    summarizeIntervalMs: number;
    captureMic: boolean;
    captureSystem: boolean;
  };
  interview: {
    overlayOpacity: number;
    typeWpm: number;
    overlayPinned: boolean;
  };
  ui: {
    theme: "dark" | "light";
    overlayOpacity: number;
  };
}

export interface ChatTurn {
  id: string;
  sessionId: string;
  createdAt: number;
  mode: FeatureMode;
  captureStrategy?: "instant" | "cumulative";
  question: string;
  imageDataUrl?: string;
  answer: string;
  providerId: ProviderId;
  model: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface SessionInfo {
  id: string;
  startedAt: number;
  label?: string;
}
