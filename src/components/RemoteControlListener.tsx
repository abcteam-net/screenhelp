"use client";

import { useEffect, useRef } from "react";
import { getCapture } from "@/lib/capture";
import { useSession } from "@/lib/session";
import { db } from "@/lib/db";

interface RemoteCommand {
  id: number;
  type: "instant" | "cumulative" | "reset-cumulative";
}

export function RemoteControlListener() {
  const ask = useSession((s) => s.ask);
  const resetCumulative = async () => {
    const cumulativeIds = useSession.getState().turns
      .filter((t) => t.captureStrategy === "cumulative")
      .map((t) => t.id);
    useSession.setState((s) => ({
      turns: s.turns.filter((t) => t.captureStrategy !== "cumulative"),
    }));
    if (cumulativeIds.length > 0) await db().turns.bulkDelete(cumulativeIds);
  };
  const lastSeenRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const runCommand = async (command: RemoteCommand) => {
      if (command.type === "reset-cumulative") {
        await resetCumulative();
        window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Cumulative context reset." }));
        return;
      }

      const capture = getCapture();
      if (!capture.isActive()) {
        window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Remote trigger received. Start screen sharing first." }));
        await postResult(command, { status: "error", error: "Start screen sharing on the main ScreenHelp page first." });
        return;
      }

      try {
        const frame = await capture.grabFrame();
        const turnId = await ask({
          mode: "answer-now",
          imageDataUrl: frame?.dataUrl,
          captureStrategy: command.type,
          question:
            command.type === "cumulative"
              ? "Cumulative capture: use the saved text context plus the current screenshot, then update the final answer."
              : "Instant capture: answer the current screen using the best matching template.",
        });
        const turn = useSession.getState().turns.find((item) => item.id === turnId);
        await postResult(command, {
          status: turn?.status === "error" ? "error" : "done",
          answer: turn?.answer,
          error: turn?.error,
        });
      } catch (err: any) {
        await postResult(command, { status: "error", error: err?.message || "Remote capture failed." });
      }
    };

    const poll = async () => {
      if (runningRef.current || cancelled) return;
      runningRef.current = true;
      try {
        const res = await fetch(`/api/remote-control?after=${lastSeenRef.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const commands = (data.commands || []) as RemoteCommand[];
        for (const command of commands) {
          lastSeenRef.current = Math.max(lastSeenRef.current, command.id);
          await runCommand(command);
        }
      } catch {
        // The next poll will retry; keep the listener quiet during dev reloads.
      } finally {
        runningRef.current = false;
      }
    };

    poll();
    const id = window.setInterval(poll, 650);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ask]);

  return null;
}

async function postResult(
  command: RemoteCommand,
  result: { status: "done" | "error"; answer?: string; error?: string },
) {
  await fetch("/api/remote-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "result",
      commandId: command.id,
      type: command.type,
      ...result,
    }),
  }).catch(() => undefined);
}
