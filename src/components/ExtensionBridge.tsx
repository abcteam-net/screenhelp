"use client";

// Listens for postMessage events from the Chrome extension's side panel
// wrapper and triggers the same actions the in-page hotkeys do. Lives at
// the root of the page tree so it's always mounted.

import { useEffect } from "react";
import { getCapture } from "@/lib/capture";
import { useSession } from "@/lib/session";

interface CommandMessage {
  type: "screenhelp:command";
  command: "answer-now" | "interview-mode" | "open-side-panel";
  selectionText?: string;
  pageUrl?: string;
}

export function ExtensionBridge() {
  const ask = useSession((s) => s.ask);

  useEffect(() => {
    async function onMessage(ev: MessageEvent) {
      const data = ev.data as CommandMessage | undefined;
      if (!data || data.type !== "screenhelp:command") return;
      const cmd = data.command;
      if (cmd === "open-side-panel") return; // handled by the extension

      const c = getCapture();
      if (!c.isActive()) {
        window.dispatchEvent(
          new CustomEvent("screenhelp:toast", { detail: "Start sharing first." }),
        );
        return;
      }
      const frame = await c.grabFrame();
      const question = data.selectionText
        ? `Help me with this. Selected text on the page: "${data.selectionText}". Page: ${data.pageUrl || ""}`
        : undefined;

      if (cmd === "interview-mode") {
        await ask({ mode: "interview", imageDataUrl: frame?.dataUrl, question });
      } else {
        await ask({ mode: "answer-now", imageDataUrl: frame?.dataUrl, question });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ask]);

  return null;
}
