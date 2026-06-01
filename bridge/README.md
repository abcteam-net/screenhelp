# ScreenHelp ↔ Claude Code bridge

A tiny zero-dependency Node HTTP server that lets the ScreenHelp web app use your local `claude` CLI as a chat provider — **no API key required**. If you're already signed in to Claude Code, your screen questions go through your existing Claude Code session.

## Run it

From the project root:

```bash
pnpm bridge
```

You'll see:

```
  ScreenHelp ↔ Claude Code bridge
  Listening: http://127.0.0.1:8787
  Token:     <random>
```

Leave it running in its own terminal. The web app fetches the token from `/token` automatically — no copy-paste required.

## Configure in ScreenHelp

1. Open ScreenHelp (`pnpm dev`).
2. Click **Settings** → the **Claude Code (local CLI)** card.
3. Confirm the bridge URL is `http://localhost:8787` and click **Test** — you should see `connected · bridge v0.1.0`.
4. (Optional) Set **Provider per feature** to `Claude Code (local CLI)` for any feature you want it to handle.

That's it — capture, hotkey, interview mode, and live watch will all route through your local `claude` CLI.

## How it works

For each chat request the bridge:

1. Writes the captured screenshot (if any) to a fresh temp dir under `$TMPDIR/screenhelp-bridge/<random>/`.
2. Spawns `claude -p --output-format stream-json --include-partial-messages --bare [--permission-mode bypassPermissions] [--model …] [--append-system-prompt …] [--add-dir <tmpdir>] "<prompt>"`.
3. Parses the streaming JSON events and forwards assistant text deltas to the web app as newline-delimited `{"type":"text-delta", "text":"…"}` chunks.
4. Cleans up the temp dir when the request closes.

The bridge binds only to `127.0.0.1` and requires an `X-Bridge-Token` header. The token regenerates every process restart and is fetched by the Next.js server route at startup via a same-origin `GET /token` call.

When the bridge is started as root, it omits Claude Code's bypass-permissions mode because Claude Code refuses that mode under root/sudo.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SCREENHELP_BRIDGE_PORT` | `8787` | TCP port to bind to. |
| `SCREENHELP_BRIDGE_TOKEN` | random | Pin the bridge token (useful for restart-stable setups). |
| `SCREENHELP_CLAUDE_BIN` | `claude` | Path to the `claude` binary. Override if it's not on `$PATH`. |

## Troubleshooting

- **"Claude Code is not logged in"** — Run `claude /login` in any terminal, then retry.
- **`EADDRINUSE`** — Another process is already on `8787`. Set `SCREENHELP_BRIDGE_PORT=8788` and update the URL in Settings.
- **Empty answer** — Re-run with `pnpm bridge` in a fresh terminal and watch stderr. The bridge surfaces the underlying CLI error verbatim.
- **Model selection** — The `Model` dropdown in Settings sends `sonnet | opus | haiku` to the CLI's `--model` flag. You can also pass a full id like `claude-sonnet-4-6`.
