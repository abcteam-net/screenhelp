import type { ChatChunk, ChatInput } from "../types";

/**
 * Browser-side helper: POSTs to our /api/chat proxy with the chosen provider
 * and streams back deltas. Keeps API keys out of the URL/headers visible to
 * third-party scripts; keys themselves are only sent over our same-origin
 * proxy and never persisted server-side.
 */
export async function* streamThroughProxy(
  providerId: string,
  apiKey: string | undefined,
  baseUrl: string | undefined,
  input: ChatInput,
): AsyncIterable<ChatChunk> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      providerId,
      apiKey,
      baseUrl,
      requestId: input.requestId,
      model: input.model,
      messages: input.messages,
      system: input.system,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      thinkingEnabled: input.thinkingEnabled,
      reasoningEffort: input.reasoningEffort,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield { type: "error", error: `HTTP ${res.status}: ${text || res.statusText}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // newline-delimited JSON
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const chunk = JSON.parse(line) as ChatChunk;
        yield chunk;
      } catch {
        // ignore parse errors mid-stream
      }
    }
  }
  yield { type: "done" };
}
