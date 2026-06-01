import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class OpenAIProvider implements Provider {
  id = "openai" as const;
  label = "OpenAI";
  defaultModel = "gpt-4o";
  availableModels = ["gpt-5-mini", "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"];
  capabilities = { vision: true, audio: true, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("openai", undefined, undefined, input);
  }
}
