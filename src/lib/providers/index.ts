import type { Provider, ProviderId } from "../types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import { GroqProvider } from "./groq";
import { OllamaProvider } from "./ollama";
import { ClaudeCodeSdkProvider } from "./claudeCodeSdk";
import { CodexCliProvider } from "./codexCli";

export const PROVIDER_REGISTRY: Record<ProviderId, () => Provider> = {
  "claude-code-sdk": () => new ClaudeCodeSdkProvider(),
  "codex-cli": () => new CodexCliProvider(),
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  google: () => new GoogleProvider(),
  groq: () => new GroqProvider(),
  ollama: () => new OllamaProvider(),
};

export function getProvider(id: ProviderId): Provider {
  return PROVIDER_REGISTRY[id]();
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "claude-code-sdk": "Claude Code SDK (local)",
  "codex-cli": "Codex CLI (local)",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  google: "Google Gemini",
  groq: "Groq",
  ollama: "Ollama (local)",
};

export const ALL_PROVIDERS: ProviderId[] = [
  "claude-code-sdk",
  "codex-cli",
  "anthropic",
  "openai",
  "google",
  "groq",
  "ollama",
];
