import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class GroqProvider implements Provider {
  id = "groq" as const;
  label = "Groq";
  defaultModel = "meta-llama/llama-4-scout-17b-16e-instruct";
  availableModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ];
  capabilities = { vision: true, audio: true, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("groq", undefined, undefined, input);
  }
}
