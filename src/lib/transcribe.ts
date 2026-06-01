// Browser-side transcription helper. Posts an audio Blob to /api/transcribe.

import type { ProviderId } from "./types";

export interface TranscribeOptions {
  providerId: Extract<ProviderId, "openai" | "groq"> | "local";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  language?: string;
}

export async function transcribeChunk(blob: Blob, opts: TranscribeOptions): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", blob, audioFileName(blob.type));
  form.append("providerId", opts.providerId);
  if (opts.apiKey) form.append("apiKey", opts.apiKey);
  if (opts.baseUrl) form.append("baseUrl", opts.baseUrl);
  if (opts.model) form.append("model", opts.model);
  if (opts.language) form.append("language", opts.language);

  const res = await fetch("/api/transcribe", { method: "POST", body: form, signal: opts.signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || data?.details || `HTTP ${res.status}`);
  }
  return (await res.json()) as TranscribeResult;
}

function audioFileName(mimeType: string): string {
  if (mimeType.includes("ogg")) return "chunk.ogg";
  if (mimeType.includes("mp4")) return "chunk.m4a";
  if (mimeType.includes("wav")) return "chunk.wav";
  return "chunk.webm";
}
