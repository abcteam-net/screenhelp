#!/usr/bin/env node
// ScreenHelp ↔ Claude Code local bridge.
//
// A minimal HTTP server (Node built-ins only, no deps) that exposes one
// endpoint:
//
//   POST /chat
//   body: {
//     model?: "sonnet" | "opus" | "haiku" | "<full-model-id>",
//     system?: string,           // system prompt (mapped to --append-system-prompt)
//     prompt: string,            // user message text
//     imageBase64?: string,      // optional PNG screenshot, base64-encoded
//     imageMime?: string,        // defaults to image/png
//   }
//   → streams newline-delimited JSON ChatChunk objects:
//     {"type":"text-delta","text":"..."}\n
//     {"type":"done"}\n
//     {"type":"error","error":"..."}\n
//
// The bridge spawns `claude -p --output-format stream-json --include-partial-messages`,
// parses Claude Code's stream-json events, and forwards the assistant text
// deltas to the HTTP response.
//
// Images are written to a temp file in $TMPDIR/screenhelp-bridge/ and the
// path is included in the prompt — Claude Code reads images by path when
// they're inside an --add-dir'd directory.
//
// Auth: bound to 127.0.0.1 only. A random per-process auth token is required
// in the X-Bridge-Token header; the web app reads it from /token on startup.

import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.SCREENHELP_BRIDGE_PORT || 8787);
const HOST = "127.0.0.1";
const CLAUDE_BIN = process.env.SCREENHELP_CLAUDE_BIN || "~/.local/bin/claude";
const CODEX_BIN = process.env.SCREENHELP_CODEX_BIN || "codex";
const TOKEN = process.env.SCREENHELP_BRIDGE_TOKEN || randomBytes(16).toString("hex");
const WORK_DIR = path.join(tmpdir(), "screenhelp-bridge");
const CAN_BYPASS_PERMISSIONS = typeof process.getuid !== "function" || process.getuid() !== 0;
let resolvedClaudeBin = null;

await mkdir(WORK_DIR, { recursive: true });
await cleanupWorkDir(30 * 60 * 1000);

function corsHeaders(req) {
  return {
    "access-control-allow-origin": req.headers.origin || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-bridge-token",
    "access-control-allow-credentials": "true",
    "vary": "origin",
  };
}

const server = http.createServer(async (req, res) => {
  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ ok: true, version: "0.1.0" }));
    return;
  }

  if (req.method === "GET" && req.url === "/token") {
    // Reveals the token to same-origin / localhost callers. Since the bridge
    // is bound to 127.0.0.1, only local code can reach it.
    res.writeHead(200, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ token: TOKEN }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    const tokenHeader = req.headers["x-bridge-token"];
    if (tokenHeader !== TOKEN) {
      res.writeHead(401, { "content-type": "application/json", ...corsHeaders(req) });
      res.end(JSON.stringify({ error: "Invalid bridge token" }));
      return;
    }
    await handleChat(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/codex-chat") {
    const tokenHeader = req.headers["x-bridge-token"];
    if (tokenHeader !== TOKEN) {
      res.writeHead(401, { "content-type": "application/json", ...corsHeaders(req) });
      res.end(JSON.stringify({ error: "Invalid bridge token" }));
      return;
    }
    await handleCodexChat(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/claude-sdk-chat") {
    const tokenHeader = req.headers["x-bridge-token"];
    if (tokenHeader !== TOKEN) {
      res.writeHead(401, { "content-type": "application/json", ...corsHeaders(req) });
      res.end(JSON.stringify({ error: "Invalid bridge token" }));
      return;
    }
    await handleClaudeSdkChat(req, res);
    return;
  }

  res.writeHead(404, { "content-type": "application/json", ...corsHeaders(req) });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ScreenHelp ↔ Claude Code bridge`);
  console.log(`  Listening: http://${HOST}:${PORT}`);
  console.log(`  Token:     ${TOKEN}\n`);
  console.log(`  In ScreenHelp Settings, Claude Code:`);
  console.log(`    URL:   http://${HOST}:${PORT}`);
  console.log(`    Token: <fetched automatically from /token>\n`);
  console.log(`  Codex CLI uses the same bridge URL.\n`);
  console.log(`  Claude Code SDK endpoint: /claude-sdk-chat\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set SCREENHELP_BRIDGE_PORT to override.`);
    process.exit(1);
  }
  throw err;
});

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

async function cleanupWorkDir(maxAgeMs = 0) {
  const now = Date.now();
  const entries = await readdir(WORK_DIR, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return;
    const fullPath = path.join(WORK_DIR, entry.name);
    if (maxAgeMs > 0) {
      const info = await stat(fullPath).catch(() => null);
      if (info && now - info.mtimeMs < maxAgeMs) return;
    }
    await rm(fullPath, { recursive: true, force: true }).catch(() => {});
  }));
}

function safeRequestId(value) {
  return String(value || randomBytes(6).toString("hex")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || randomBytes(6).toString("hex");
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { model, requestId, system, prompt, imageBase64, imageMime, imageParts } = body || {};
  if (!prompt || typeof prompt !== "string") {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Missing 'prompt'" }));
    return;
  }

  // Prepare temp working dir per request (so concurrent requests don't collide)
  const reqId = safeRequestId(requestId);
  const reqDir = path.join(WORK_DIR, `legacy-${reqId}-${randomBytes(3).toString("hex")}`);
  await mkdir(reqDir, { recursive: true });

  const images =
    Array.isArray(imageParts) && imageParts.length > 0
      ? imageParts
      : imageBase64
        ? [{ base64: imageBase64, mimeType: imageMime || "image/png" }]
        : [];

  const imagePaths = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img?.base64) continue;
    const ext = (img.mimeType || img.imageMime || "image/png").split("/")[1] || "png";
    const imagePath = path.join(reqDir, `frame-${i + 1}.${ext}`);
    imagePaths.push(imagePath);
    await writeFile(imagePath, Buffer.from(img.base64, "base64"));
  }

  // Build the prompt: when there's an image, tell Claude to read it.
  const fullPrompt = imagePaths.length
    ? `Isolated request id: ${reqId}. Use only the ${imagePaths.length} image file(s) listed here for this request. The last image is the current screen. Ignore any prior session, prior image, prior answer, and prior file path. Current image path(s): ${imagePaths.join(", ")}.\n\n${prompt}`
    : `Isolated request id: ${reqId}. Ignore any prior session, prior image, prior answer, and prior file path.\n\n${prompt}`;

  // Build CLI args
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose", // required by stream-json with partial messages
    "--bare", // no hooks, no auto-discovery, fastest path
    "--no-session-persistence",
  ];
  if (CAN_BYPASS_PERMISSIONS) args.push("--permission-mode", "bypassPermissions");
  if (model) args.push("--model", model);
  if (system) args.push("--append-system-prompt", system);
  if (imagePaths.length) args.push("--add-dir", reqDir);
  args.push(fullPrompt);

  // Stream NDJSON to the response
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });

  const send = (chunk) => res.write(JSON.stringify(chunk) + "\n");

  let child;
  try {
    child = spawn(CLAUDE_BIN, args, {
      cwd: reqDir,
      env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    send({ type: "error", error: `Failed to spawn ${CLAUDE_BIN}: ${e.message}` });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  // Cancel the subprocess if the client disconnects.
  req.on("close", () => {
    if (!child.killed) child.kill("SIGTERM");
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  // Parse stream-json events line-by-line.
  let buf = "";
  let alreadyEmitted = ""; // track what we've already streamed so result-event fallback doesn't double up
  let fatalError = null;

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line);

        // Detect auth/other fatal errors explicitly
        if (evt.error === "authentication_failed" || (evt.type === "result" && evt.is_error)) {
          const msg =
            (evt.message?.content?.[0]?.text) ||
            evt.result ||
            "Claude Code error";
          if (/not logged in|please run \/login/i.test(msg)) {
            fatalError =
              "Claude Code is not logged in. Run `claude /login` in a terminal, then retry.";
          } else if (!fatalError) {
            fatalError = msg;
          }
          continue;
        }

        const text = extractTextDelta(evt);
        if (text) {
          alreadyEmitted += text;
          send({ type: "text-delta", text });
        }
      } catch (e) {
        // ignore parse errors mid-stream
      }
    }
  });

  child.on("close", async (code) => {
    if (fatalError) {
      send({ type: "error", error: fatalError });
    } else if (code !== 0) {
      send({
        type: "error",
        error: stderr.trim() || `claude exited with code ${code}`,
      });
    } else if (!alreadyEmitted.trim()) {
      // We got no streamed text — bridge fallback: try to find a final
      // `result` event in the buffer or stderr that we missed.
      send({
        type: "error",
        error: "Claude Code returned no output. Try again, or run `claude /login` first.",
      });
    }
    send({ type: "done" });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
  });
}

async function handleCodexChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { model, requestId, system, prompt, imageParts, thinkingEnabled, reasoningEffort } = body || {};
  if (!prompt || typeof prompt !== "string") {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Missing 'prompt'" }));
    return;
  }

  const reqId = safeRequestId(requestId);
  const reqDir = path.join(WORK_DIR, `codex-${reqId}-${randomBytes(3).toString("hex")}`);
  await mkdir(reqDir, { recursive: true });

  const imagePaths = [];
  const images = Array.isArray(imageParts) ? imageParts : [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img?.base64) continue;
    const ext = (img.mimeType || "image/png").split("/")[1] || "png";
    const imagePath = path.join(reqDir, `frame-${i + 1}.${ext}`);
    imagePaths.push(imagePath);
    await writeFile(imagePath, Buffer.from(img.base64, "base64"));
  }

  const fullPrompt = [
    `Isolated request id: ${reqId}. This is a separate provider session. Do not continue any previous task. Use only the current request text and current attached image(s).`,
    system ? `System instructions:\n${system}` : "",
    imagePaths.length
      ? `Current request has ${imagePaths.length} attached image file(s). The last image is the current screen. Ignore all old image paths.`
      : "",
    prompt,
  ].filter(Boolean).join("\n\n");
  const outputPath = path.join(reqDir, "codex-last-message.txt");

  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--cd", reqDir,
    "--output-last-message", outputPath,
  ];
  if (model) args.push("--model", model);
  if (thinkingEnabled && reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${normalizeEffort(reasoningEffort)}"`);
  }
  for (const imagePath of imagePaths) args.push("--image", imagePath);
  args.push("-");

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });

  const send = (chunk) => res.write(JSON.stringify(chunk) + "\n");

  let child;
  try {
    child = spawn(CODEX_BIN, args, {
      cwd: reqDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
  } catch (e) {
    send({ type: "error", error: `Failed to spawn ${CODEX_BIN}: ${e.message}` });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  child.stdin.end(fullPrompt);

  req.on("close", () => {
    if (!child.killed) child.kill("SIGTERM");
  });

  let stderr = "";
  let stdout = "";
  let emitted = "";
  let finalText = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    let idx;
    while ((idx = stdout.indexOf("\n")) >= 0) {
      const line = stdout.slice(0, idx).trim();
      stdout = stdout.slice(idx + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        const text = extractCodexFinalText(evt);
        if (text) finalText = text;
      } catch {
        // ignore non-json progress
      }
    }
  });

  child.on("close", async (code) => {
    const outputFileText = await readFile(outputPath, "utf8").catch(() => "");
    if (outputFileText.trim() && !emitted.trim()) {
      emitted = outputFileText.trim();
      send({ type: "text-delta", text: emitted });
    } else if (finalText && !emitted.trim()) {
      emitted = finalText;
      send({ type: "text-delta", text: finalText });
    }
    if (code !== 0) {
      const msg = stderr.trim() || `codex exited with code ${code}`;
      if (!emitted.trim()) {
        send({ type: "error", error: /not logged in|login/i.test(msg) ? "Codex CLI is not logged in. Run `codex login`, then retry." : msg });
      }
    } else if (!emitted.trim()) {
      const fallback = extractLastPlainCodexMessage(stdout);
      if (fallback) send({ type: "text-delta", text: fallback });
      else send({ type: "error", error: "Codex CLI returned no output." });
    }
    send({ type: "done" });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
  });
}

async function handleClaudeSdkChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { model, requestId, system, prompt, imageParts, thinkingEnabled, reasoningEffort } = body || {};
  if (!prompt || typeof prompt !== "string") {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    res.end(JSON.stringify({ error: "Missing 'prompt'" }));
    return;
  }

  const reqId = safeRequestId(requestId);
  const reqDir = path.join(WORK_DIR, `claude-sdk-${reqId}-${randomBytes(3).toString("hex")}`);
  await mkdir(reqDir, { recursive: true });

  const imagePaths = [];
  const images = Array.isArray(imageParts) ? imageParts : [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img?.base64) continue;
    const ext = (img.mimeType || "image/png").split("/")[1] || "png";
    const imagePath = path.join(reqDir, `frame-${i + 1}.${ext}`);
    const imageBuffer = Buffer.from(img.base64, "base64");
    if (imageBuffer.length < 100) continue;
    imagePaths.push(imagePath);
    await writeFile(imagePath, imageBuffer);
  }

  const fullPrompt = imagePaths.length
    ? `Isolated request id: ${reqId}. Read and inspect only the ${imagePaths.length} image file(s) attached in this request. The last image is the current screen. Ignore every prior session, prior image, prior answer, and prior file path. Current image path(s): ${imagePaths.join(", ")}.\n\n${prompt}`
    : `Isolated request id: ${reqId}. This is a separate provider session. Ignore every prior session, prior image, prior answer, and prior file path.\n\n${prompt}`;

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });

  const send = (chunk) => res.write(JSON.stringify(chunk) + "\n");

  let query;
  try {
    ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
  } catch (e) {
    send({
      type: "error",
      error:
        "Claude Code SDK is not installed. Run `pnpm install`, then restart `pnpm bridge`. " +
        `(${e?.message || e})`,
    });
    send({ type: "done" });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  let claudePath;
  try {
    claudePath = await resolveExecutable(CLAUDE_BIN);
  } catch (e) {
    send({
      type: "error",
      error:
        `Claude Code binary was not found at "${CLAUDE_BIN}". ` +
        "Set SCREENHELP_CLAUDE_BIN to the absolute path from `which claude`, then restart `pnpm bridge`.",
    });
    send({ type: "done" });
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  const abortController = new AbortController();
  let responseFinished = false;
  res.on("close", () => {
    if (!responseFinished) abortController.abort();
  });

  let emitted = "";
  let sdkStderr = "";
  try {
    const stream = query({
      prompt: fullPrompt,
      options: {
        cwd: reqDir,
        model: model || undefined,
        maxThinkingTokens: thinkingEnabled ? thinkingTokensForEffort(reasoningEffort) : undefined,
        systemPrompt: system || undefined,
        pathToClaudeCodeExecutable: claudePath,
        settingSources: [],
        persistSession: false,
        continueConversation: false,
        ...(CAN_BYPASS_PERMISSIONS ? { permissionMode: "bypassPermissions" } : {}),
        allowedTools: ["Read"],
        disallowedTools: ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch"],
        additionalDirectories: imagePaths.length ? [reqDir] : [],
        includePartialMessages: true,
        abortController,
        stderr: (data) => {
          sdkStderr += String(data);
        },
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "screenhelp",
        },
      },
    });

    for await (const message of stream) {
      const text = extractClaudeSdkText(message);
      if (!text) continue;
      const delta = text.startsWith(emitted) ? text.slice(emitted.length) : text;
      if (delta) {
        emitted += delta;
        send({ type: "text-delta", text: delta });
      }
    }

    if (!emitted.trim()) {
      send({ type: "error", error: "Claude Code SDK returned no output. Try `claude /login`, then retry." });
    }
  } catch (e) {
    const msg = [e?.message || String(e), sdkStderr.trim()].filter(Boolean).join("\n");
    send({
      type: "error",
      error: /not logged in|login/i.test(msg)
        ? "Claude Code SDK is not logged in. Run `claude /login`, then retry."
        : msg,
    });
  } finally {
    send({ type: "done" });
    responseFinished = true;
    res.end();
    await rm(reqDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveExecutable(bin) {
  if (bin.startsWith("~/")) return path.join(homedir(), bin.slice(2));
  if (path.isAbsolute(bin)) return bin;
  if (bin === CLAUDE_BIN && resolvedClaudeBin) return resolvedClaudeBin;

  const resolved = await new Promise((resolve, reject) => {
    const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      const value = out.trim().split("\n")[0];
      if (code === 0 && value) resolve(value);
      else reject(new Error(`Could not resolve ${bin}`));
    });
    child.on("error", reject);
  });

  if (bin === CLAUDE_BIN) resolvedClaudeBin = resolved;
  return resolved;
}

function normalizeEffort(effort) {
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}

function thinkingTokensForEffort(effort) {
  switch (normalizeEffort(effort)) {
    case "low":
      return 1024;
    case "high":
      return 8192;
    case "xhigh":
      return 16000;
    case "medium":
    default:
      return 4096;
  }
}

/**
 * Claude Code's stream-json emits a few event shapes. We pull out anything
 * that looks like an assistant-text delta.
 *
 * Known shapes (across CC versions):
 *  - { type: "stream_event", event: { type: "content_block_delta", delta: { type:"text_delta", text:"..." } } }
 *  - { type: "assistant", message: { content: [ { type:"text", text:"..." } ] } }   // final
 *  - { type: "text_delta", text: "..." }
 *  - { type: "partial_assistant_message", delta: { text: "..." } }
 *  - { type: "result", result: "...full text..." }                                  // fallback
 */
// Tracks per-process: last assistant-message text we forwarded as a whole,
// so when a non-streaming `assistant` final lands we only emit the diff.
const _emitted = new WeakMap();

function extractTextDelta(evt) {
  if (!evt || typeof evt !== "object") return null;

  // Direct delta
  if (evt.type === "text_delta" && typeof evt.text === "string") return evt.text;

  // Nested stream_event from anthropic SDK passthrough
  if (evt.type === "stream_event" && evt.event) {
    const inner = evt.event;
    if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta") {
      return inner.delta.text || null;
    }
  }

  if (evt.type === "partial_assistant_message" && evt.delta?.text) {
    return evt.delta.text;
  }

  // Final assistant message (non-streamed path). Only emit if we haven't
  // already seen this text via partial deltas.
  if (evt.type === "assistant" && evt.message && Array.isArray(evt.message.content) && !evt.error) {
    const text = evt.message.content
      .filter((b) => b && b.type === "text")
      .map((b) => b.text || "")
      .join("");
    if (text) return text;
  }

  return null;
}

function extractClaudeSdkText(message) {
  if (!message || typeof message !== "object") return null;

  const candidates = [
    message.result,
    message.text,
    message.delta?.text,
    message.message?.content,
    message.content,
  ];

  for (const candidate of candidates) {
    const text = contentToText(candidate);
    if (text) return text;
  }

  if (message.type === "assistant" && message.message?.content) {
    return contentToText(message.message.content);
  }

  return null;
}

function extractCodexFinalText(evt) {
  if (!evt || typeof evt !== "object") return null;

  const type = String(evt.type || evt.event?.type || evt.item?.type || "");
  const role = String(evt.role || evt.item?.role || evt.message?.role || "");
  const isFinal =
    /final|result|last_message|agent_message|assistant_message|message_output/.test(type) ||
    (role === "assistant" && !/reason|thought|analysis|plan|progress/.test(type));

  if (!isFinal || /reason|thought|analysis|plan|progress/.test(type)) return null;

  const candidates = [
    evt.text,
    evt.content,
    evt.output_text,
    evt.final_answer,
    evt.result,
    evt.last_message,
    evt.message?.content,
    evt.item?.text,
    evt.item?.content,
    evt.data?.text,
    evt.data?.content,
  ];

  for (const candidate of candidates) {
    const text = contentToText(candidate);
    if (text) return text;
  }

  if (Array.isArray(evt.items)) {
    const text = evt.items.map(contentToText).filter(Boolean).join("");
    if (text) return text;
  }

  return null;
}

function contentToText(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(contentToText).filter(Boolean).join("");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return value.content.map(contentToText).filter(Boolean).join("");
  }
  return null;
}

function extractLastPlainCodexMessage(buffer) {
  const lines = buffer.split("\n").map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const text = extractCodexFinalText(JSON.parse(lines[i]));
      if (text) return text;
    } catch {
      if (!lines[i].startsWith("{")) return lines[i];
    }
  }
  return null;
}
