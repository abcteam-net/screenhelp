"use client";

import { useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { getCapture } from "@/lib/capture";

// Simple downsampled hash for cheap frame-diff
async function fingerprint(dataUrl: string): Promise<number[]> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise((r) => (img.onload = r));
  const w = 16, h = 16;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3 / 16));
  }
  return out;
}

function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / (a.length * 16);
}

export function LiveWatcher() {
  const { enabled, intervalMs, diffThreshold } = useSettings((s) => s.settings.liveWatch);
  const ask = useSession((s) => s.ask);
  const lastFp = useRef<number[] | null>(null);
  const lastFiredAt = useRef(0);
  const pendingFrame = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const cooldownMs = Math.max(1500, intervalMs);
    const effectiveThreshold = Math.min(diffThreshold, 0.04);

    const fire = async (dataUrl: string) => {
      if (inFlight.current) {
        pendingFrame.current = dataUrl;
        return;
      }
      inFlight.current = true;
      lastFiredAt.current = Date.now();
      try {
        await ask({ mode: "live-watch", imageDataUrl: dataUrl });
      } finally {
        inFlight.current = false;
        const queued = pendingFrame.current;
        if (queued && !stop && Date.now() - lastFiredAt.current >= cooldownMs) {
          pendingFrame.current = null;
          void fire(queued);
        }
      }
    };

    const tick = async () => {
      if (stop) return;
      const c = getCapture();
      if (c.isActive()) {
        const frame = await c.grabFrame();
        if (frame) {
          const fp = await fingerprint(frame.dataUrl);
          const d = lastFp.current ? distance(lastFp.current, fp) : 1;
          lastFp.current = fp;
          const now = Date.now();
          const changed = d > effectiveThreshold;
          const ready = now - lastFiredAt.current > cooldownMs;

          if (changed && ready) {
            pendingFrame.current = null;
            await fire(frame.dataUrl);
          } else if (changed) {
            pendingFrame.current = frame.dataUrl;
          } else if (pendingFrame.current && ready) {
            const queued = pendingFrame.current;
            pendingFrame.current = null;
            await fire(queued);
          }
        }
      }
      if (!stop) setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stop = true; };
  }, [enabled, intervalMs, diffThreshold, ask]);

  return null;
}
