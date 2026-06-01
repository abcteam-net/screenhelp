// POST /api/transcribe
// Multipart form: file=<blob>, providerId=openai|groq|local, apiKey=..., model=whisper-1
// Returns JSON: { text: string, language?: string, durationMs?: number }

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/audio/transcriptions",
  groq: "https://api.groq.com/openai/v1/audio/transcriptions",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "whisper-1",
  groq: "whisper-large-v3-turbo",
  local: "Systran/faster-whisper-small",
};

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const providerId = String(form.get("providerId") || "groq");
  const apiKey = String(form.get("apiKey") || "");
  const baseUrl = String(form.get("baseUrl") || "");
  const language = form.get("language") ? String(form.get("language")) : undefined;
  const model = String(form.get("model") || DEFAULT_MODELS[providerId] || "whisper-1");

  if (!(file instanceof Blob)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (providerId !== "local" && !apiKey) {
    return Response.json({ error: `${providerId} API key missing` }, { status: 400 });
  }
  const endpoint = providerId === "local" ? baseUrl : ENDPOINTS[providerId];
  if (!endpoint) {
    return Response.json(
      { error: providerId === "local" ? "Local Whisper base URL missing" : `Unsupported provider: ${providerId}` },
      { status: 400 },
    );
  }

  console.info("[transcribe] request", {
    providerId,
    endpoint,
    model,
    fileType: file.type,
    fileSize: file.size,
  });

  // Re-build the multipart form for the upstream API
  const upstreamForm = new FormData();
  upstreamForm.append("file", file, audioFileName(file.type));
  upstreamForm.append("model", model);
  upstreamForm.append("response_format", "json");
  if (language) upstreamForm.append("language", language);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: providerId === "local" ? undefined : { authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[transcribe] upstream failed", {
      providerId,
      endpoint,
      model,
      status: res.status,
      body: text || res.statusText,
    });
    return Response.json(
      {
        error: `Groq/OpenAI transcription failed: upstream HTTP ${res.status}`,
        details: text || res.statusText,
      },
      { status: 502 },
    );
  }

  const data: any = await res.json();
  return Response.json({ text: data.text ?? "", language: data.language });
}

function audioFileName(mimeType: string): string {
  if (mimeType.includes("ogg")) return "chunk.ogg";
  if (mimeType.includes("mp4")) return "chunk.m4a";
  if (mimeType.includes("wav")) return "chunk.wav";
  return "chunk.webm";
}
