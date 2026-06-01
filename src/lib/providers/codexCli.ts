import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class CodexCliProvider implements Provider {
  id = "codex-cli" as const;
  label = "Codex CLI (local)";
  defaultModel = "gpt-5.4";
  availableModels = ["gpt-5.4", "gpt-5.4-mini", "gpt-5-mini", "gpt-5"];
  capabilities = { vision: true, audio: false, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("codex-cli", undefined, undefined, input);
  }
}
