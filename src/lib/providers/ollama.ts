import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class OllamaProvider implements Provider {
  id = "ollama" as const;
  label = "Ollama (local)";
  defaultModel = "llava";
  availableModels = ["llava", "llava:13b", "llama3.2-vision", "bakllava"];
  capabilities = { vision: true, audio: false, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("ollama", undefined, undefined, input);
  }
}
