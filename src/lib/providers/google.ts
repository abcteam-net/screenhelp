import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class GoogleProvider implements Provider {
  id = "google" as const;
  label = "Google Gemini";
  defaultModel = "gemini-1.5-pro";
  availableModels = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"];
  capabilities = { vision: true, audio: true, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("google", undefined, undefined, input);
  }
}
