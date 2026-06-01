import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class AnthropicProvider implements Provider {
  id = "anthropic" as const;
  label = "Anthropic Claude";
  defaultModel = "claude-sonnet-4-6";
  availableModels = [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ];
  capabilities = { vision: true, audio: false, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("anthropic", undefined, undefined, input);
  }
}
