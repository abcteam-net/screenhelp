# ScreenHelp Chrome Extension

A thin companion to the ScreenHelp web app that adds browser-wide hotkeys, a side panel that mirrors the web app, and a right-click "Ask ScreenHelp about this page" menu item.

## Install (unpacked, for development)

1. Make sure the web app is running:

   ```bash
   cd ..
   pnpm dev:all   # starts the web app and local bridge
   ```

2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick this `extension/` folder.
5. The ScreenHelp icon appears in your toolbar. Click it to open the side panel — it loads the local web app in an iframe.

## Hotkeys (browser-wide while Chrome is focused)

| Hotkey                         | Action                                   |
|--------------------------------|------------------------------------------|
| `⌘/Ctrl + Shift + Space`       | Capture + answer now                     |
| `⌘/Ctrl + Shift + I`           | Capture + interview-mode answer          |
| `⌘/Ctrl + Shift + H`           | Open / focus the ScreenHelp side panel   |

You can rebind these at `chrome://extensions/shortcuts`. Chrome does not allow every key as an extension shortcut; a lone `Right Ctrl` key is handled by the web app only while the app is focused.

## How it works

The extension is intentionally minimal — all AI logic lives in the web app.

- `background.js` (MV3 service worker) listens for `chrome.commands` and `chrome.contextMenus` events and forwards them via `chrome.runtime.sendMessage`.
- `sidepanel.html` / `sidepanel.js` is the side panel page. It probes whether the web app is running on `localhost:3000`; if yes, embeds it in an iframe and relays extension events into the iframe via `postMessage`.
- The web app's `ExtensionBridge` component listens for those `postMessage` events and triggers the same `Session.ask(...)` flow the in-page hotkeys do.

## Switching to production

When you host the web app somewhere other than `localhost:3000`, edit two places:

- `extension/manifest.json` → add your domain to `host_permissions`.
- `extension/background.js` and `extension/sidepanel.js` → change the `APP_URL` constant.

You'll also want to confirm the web app sends a `Content-Security-Policy: frame-ancestors chrome-extension://* ...` header (already configured in `next.config.mjs`).

## Caveats

- Chrome only routes `chrome.commands` shortcuts to extensions while Chrome itself is the focused window. For true OS-wide hotkeys, a desktop (Electron/Tauri) build is required — that's a future milestone.
- The side panel only works in Chrome 114+.
- The side panel probes `localhost:3000` through `localhost:3003`, so it still connects when Next chooses another dev port.
- We don't request `<all_urls>` host permissions — the extension only talks to `localhost:3000` by default.
