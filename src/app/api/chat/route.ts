// Server-side proxy: receives a provider-agnostic request, dispatches to the
// right SDK, and streams back newline-delimited JSON ChatChunk objects.
//
// Keys are passed per-request from the client. Nothing is persisted server-side.

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatChunk, Message, MessagePart, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  providerId: ProviderId;
  requestId?: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
}

function chunkToLine(chunk: ChatChunk): string {
  return JSON.stringify(chunk) + "\n";
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (c: ChatChunk) => controller.enqueue(encoder.encode(chunkToLine(c)));
      try {
        switch (body.providerId) {
          case "claude-code-sdk":
            await streamClaudeCodeSdk(body, send);
            break;
          case "codex-cli":
            await streamCodexCli(body, send);
            break;
          case "anthropic":
            await streamAnthropic(body, send);
            break;
          case "openai":
            await streamOpenAI(body, send);
            break;
          case "google":
            await streamGoogle(body, send);
            break;
          case "groq":
            await streamOpenAICompatible(body, send, "https://api.groq.com/openai/v1");
            break;
          case "ollama":
            await streamOllama(body, send);
            break;
          default:
            send({ type: "error", error: `Unknown provider: ${body.providerId}` });
        }
        send({ type: "done" });
      } catch (err: any) {
        send({ type: "error", error: err?.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function streamCodexCli(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  await streamLocalBridgeProvider(body, send, "codex-chat", "Codex CLI");
}

// ---- Anthropic ---------------------------------------------------------

async function streamAnthropic(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  if (!body.apiKey) throw new Error("Anthropic API key missing");
  const client = new Anthropic({
    apiKey: body.apiKey,
    baseURL: body.baseUrl || undefined,
  });

  const messages = body.messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content.map(toAnthropicPart),
  })) as Anthropic.MessageParam[];

  const stream = await client.messages.stream({
    model: body.model,
    max_tokens: body.maxTokens ?? 1024,
    temperature: body.temperature,
    system: body.system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      send({ type: "text-delta", text: event.delta.text });
    }
  }
}

function toAnthropicPart(p: MessagePart): any {
  if (p.type === "text") return { type: "text", text: p.text };
  return {
    type: "image",
    source: { type: "base64", media_type: p.mimeType, data: p.base64 },
  };
}

// ---- OpenAI ------------------------------------------------------------

async function streamOpenAI(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  if (!body.apiKey) throw new Error("OpenAI API key missing");
  const client = new OpenAI({
    apiKey: body.apiKey,
    baseURL: body.baseUrl || undefined,
  });
  await streamOpenAILike(client, body, send);
}

async function streamOpenAICompatible(
  body: ChatRequestBody,
  send: (c: ChatChunk) => void,
  baseUrl: string,
) {
  if (!body.apiKey) throw new Error("API key missing");
  const client = new OpenAI({ apiKey: body.apiKey, baseURL: baseUrl });
  await streamOpenAILike(client, body, send);
}

async function streamOpenAILike(
  client: OpenAI,
  body: ChatRequestBody,
  send: (c: ChatChunk) => void,
) {
  const messages: any[] = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const m of body.messages) {
    messages.push({
      role: m.role,
      content: m.content.map((p) =>
        p.type === "text"
          ? { type: "text", text: p.text }
          : { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.base64}` } },
      ),
    });
  }

  const stream = await client.chat.completions.create({
    model: body.model,
    messages,
    temperature: body.temperature,
    max_tokens: body.maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      send({ type: "text-delta", text: delta });
    }
  }
}

// ---- Google Gemini -----------------------------------------------------

async function streamGoogle(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  if (!body.apiKey) throw new Error("Google API key missing");
  const genAI = new GoogleGenerativeAI(body.apiKey);
  const model = genAI.getGenerativeModel({
    model: body.model,
    systemInstruction: body.system,
  });

  const contents = body.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.content.map((p) =>
      p.type === "text"
        ? { text: p.text }
        : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
    ),
  }));

  const result = await model.generateContentStream({ contents });
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) send({ type: "text-delta", text });
  }
}

// ---- Claude Code (local CLI bridge) ------------------------------------
//
// Talks to the local `screenhelp-bridge` (bridge/server.mjs). The bridge URL
// comes from settings (default http://localhost:8787). We fetch /token once
// per URL and cache it; if a 401 comes back later we refresh it.

const _tokenCache = new Map<string, string>();

async function getBridgeToken(baseUrl: string): Promise<string> {
  const cached = _tokenCache.get(baseUrl);
  if (cached) return cached;
  const res = await fetch(baseUrl.replace(/\/$/, "") + "/token", { cache: "no-store" });
  if (!res.ok) throw new Error(`Bridge not reachable at ${baseUrl} (HTTP ${res.status})`);
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new Error("Bridge returned no token");
  _tokenCache.set(baseUrl, j.token);
  return j.token;
}

async function streamClaudeCodeSdk(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  await streamLocalBridgeProvider(
    { ...body, model: normalizeClaudeCodeModel(body.model) },
    send,
    "claude-sdk-chat",
    "Claude Code SDK",
  );
}

function normalizeClaudeCodeModel(model: string): string {
  const value = model.trim().toLowerCase();
  if (!value) return "sonnet";
  if (value === "claude-sonnet-4.6" || value === "claude-sonnet-4-6" || value.includes("sonnet")) return "sonnet";
  if (value.includes("opus")) return "opus";
  if (value.includes("haiku")) return "haiku";
  return model;
}

async function streamLocalBridgeProvider(
  body: ChatRequestBody,
  send: (c: ChatChunk) => void,
  path: "chat" | "claude-sdk-chat" | "codex-chat",
  label: string,
) {
  const baseUrl = (body.baseUrl || "http://localhost:8787").replace(/\/$/, "");

  // Collapse our message[] shape into a single user prompt + the visible images.
  const last = body.messages[body.messages.length - 1];
  if (!last) throw new Error("No messages provided");

  let prompt = "";
  const imageParts: Array<{ base64: string; mimeType: string }> = [];
  for (const part of last.content) {
    if (part.type === "text") prompt += (prompt ? "\n" : "") + part.text;
    else if (part.type === "image") imageParts.push({ base64: part.base64, mimeType: part.mimeType });
  }
  if (!prompt) prompt = "Help me with what's on this screen.";

  let token: string;
  try {
    token = await getBridgeToken(baseUrl);
  } catch (e: any) {
    send({
      type: "error",
      error:
        `Can't reach the ${label} bridge at ${baseUrl}. ` +
        `Run \`pnpm bridge\` in the project folder, then retry. (${e?.message || e})`,
    });
    return;
  }

  const callOnce = async (authToken: string) => {
    return fetch(baseUrl + "/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-token": authToken },
      body: JSON.stringify({
        model: body.model,
        requestId: body.requestId,
        system: body.system,
        prompt,
        imageParts,
        thinkingEnabled: body.thinkingEnabled,
        reasoningEffort: body.reasoningEffort,
      }),
    });
  };

  let res = await callOnce(token);
  if (res.status === 401) {
    // Token rotated (e.g. bridge restarted) — refresh once.
    _tokenCache.delete(baseUrl);
    try {
      token = await getBridgeToken(baseUrl);
    } catch (e: any) {
      send({ type: "error", error: `Bridge auth failed: ${e?.message || e}` });
      return;
    }
    res = await callOnce(token);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    if (res.status === 404 && path === "claude-sdk-chat") {
      send({
        type: "error",
        error:
          "Claude Code SDK endpoint is missing on the running bridge. " +
          "Restart `pnpm bridge` or `pnpm dev:all` so the bridge loads `/claude-sdk-chat`.",
      });
      return;
    }
    send({ type: "error", error: `${label} bridge HTTP ${res.status}: ${text || res.statusText}` });
    return;
  }

  // Bridge already returns our NDJSON ChatChunk format — relay it as-is.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const chunk = JSON.parse(line) as ChatChunk;
        if (chunk.type === "text-delta" && chunk.text) send({ type: "text-delta", text: chunk.text });
        else if (chunk.type === "error") send({ type: "error", error: chunk.error });
        // swallow {type:"done"} — our outer caller emits its own
      } catch {}
    }
  }
}

// ---- Ollama (local) ----------------------------------------------------

async function streamOllama(body: ChatRequestBody, send: (c: ChatChunk) => void) {
  const baseUrl = body.baseUrl || "http://localhost:11434";

  // Ollama's /api/chat accepts messages with images (base64 array)
  const messages = body.messages.map((m) => {
    const texts = m.content.filter((p) => p.type === "text").map((p) => (p as any).text).join("\n");
    const images = m.content
      .filter((p) => p.type === "image")
      .map((p) => (p as any).base64);
    return { role: m.role, content: texts, images: images.length ? images : undefined };
  });
  if (body.system) {
    messages.unshift({ role: "system", content: body.system, images: undefined });
  }

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: body.model,
      messages,
      stream: true,
      options: { temperature: body.temperature },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        const text = j?.message?.content;
        if (text) send({ type: "text-delta", text });
      } catch {}
    }
  }
}
