import type { ChatChunk, ChatInput, Provider } from "../types";
import { streamThroughProxy } from "./base";

export class ClaudeCodeSdkProvider implements Provider {
  id = "claude-code-sdk" as const;
  label = "Claude Code SDK (local)";
  defaultModel = "sonnet";
  availableModels = ["sonnet", "opus", "haiku"];
  capabilities = { vision: true, audio: false, streaming: true };

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    yield* streamThroughProxy("claude-code-sdk", undefined, undefined, input);
  }
}
