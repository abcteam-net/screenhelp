"use client";

import { useEffect } from "react";
import { tinykeys } from "tinykeys";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { getCapture } from "@/lib/capture";

export function HotkeyManager() {
  const hotkey = useSettings((s) => s.settings.hotkey);
  const cumulativeHotkey = useSettings((s) => s.settings.cumulativeHotkey);
  const ask = useSession((s) => s.ask);

  useEffect(() => {
    if (!hotkey) return;
    if (hotkey === "ControlRight") {
      const onKeyDown = async (e: KeyboardEvent) => {
        if (e.code !== "ControlRight" || e.repeat) return;
        e.preventDefault();
        const c = getCapture();
        if (!c.isActive()) {
          window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing first." }));
          return;
        }
        const frame = await c.grabFrame();
        await ask({ mode: "answer-now", imageDataUrl: frame?.dataUrl });
      };
      window.addEventListener("keydown", onKeyDown, true);
      return () => window.removeEventListener("keydown", onKeyDown, true);
    }

    const unbind = tinykeys(window, {
      [hotkey]: async (e) => {
        e.preventDefault();
        const c = getCapture();
        if (!c.isActive()) {
          window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing first." }));
          return;
        }
        const frame = await c.grabFrame();
        await ask({ mode: "answer-now", imageDataUrl: frame?.dataUrl });
      },
    });
    return unbind;
  }, [hotkey, ask]);

  useEffect(() => {
    if (!cumulativeHotkey) return;

    const run = async (e: KeyboardEvent) => {
      e.preventDefault();
      const c = getCapture();
      if (!c.isActive()) {
        window.dispatchEvent(new CustomEvent("screenhelp:toast", { detail: "Start sharing first." }));
        return;
      }
      const frame = await c.grabFrame();
      await ask({
        mode: "answer-now",
        imageDataUrl: frame?.dataUrl,
        captureStrategy: "cumulative",
        question: "Cumulative capture: use all collected screenshots and update the final answer.",
      });
    };

    if (isModifierOnlyHotkey(cumulativeHotkey)) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== cumulativeHotkey || e.repeat) return;
        void run(e);
      };
      window.addEventListener("keydown", onKeyDown, true);
      return () => window.removeEventListener("keydown", onKeyDown, true);
    }

    const unbind = tinykeys(window, { [cumulativeHotkey]: run });
    return unbind;
  }, [cumulativeHotkey, ask]);

  return null;
}

function isModifierOnlyHotkey(hotkey: string): boolean {
  return [
    "ControlRight",
    "ControlLeft",
    "ShiftRight",
    "ShiftLeft",
    "AltRight",
    "AltLeft",
    "MetaRight",
    "MetaLeft",
  ].includes(hotkey);
}
