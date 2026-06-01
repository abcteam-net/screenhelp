// Screen / window / tab capture engine.
// Holds a single MediaStream and offers frame grabs as PNG blobs / data URLs.

export type CaptureSurface = "screen" | "window" | "tab" | "any";

export interface CaptureOptions {
  surface?: CaptureSurface;
  audio?: boolean;
}

export class CaptureService {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private listeners = new Set<(active: boolean) => void>();

  isActive() {
    return this.stream !== null && this.stream.active;
  }

  onChange(cb: (active: boolean) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const cb of this.listeners) cb(this.isActive());
  }

  async start(opts: CaptureOptions = {}): Promise<MediaStream> {
    if (this.stream) await this.stop();

    const displayMediaOptions: DisplayMediaStreamOptions = {
      // displaySurface is a browser hint, not in the strict DOM types yet
      video: ({
        displaySurface: opts.surface === "any" ? undefined : opts.surface,
      } as MediaTrackConstraints),
      audio: opts.audio ?? false,
    };

    const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    this.stream = stream;

    // Build a hidden video element to read frames from
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
    this.video = video;

    // Detect user-stopped share
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => this.stop());
    }

    this.emit();
    return stream;
  }

  async stop() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    this.stream = null;
    this.video = null;
    this.emit();
  }

  getStream() {
    return this.stream;
  }

  getVideo() {
    return this.video;
  }

  /**
   * Grab the current frame as a PNG data URL.
   * Returns null if no active capture or the video isn't ready.
   */
  async grabFrame(): Promise<{ dataUrl: string; width: number; height: number } | null> {
    if (!this.video || !this.stream) return null;
    const v = this.video;
    if (v.readyState < 2) {
      // wait one frame
      await new Promise<void>((r) => {
        const onReady = () => {
          v.removeEventListener("loadeddata", onReady);
          r();
        };
        v.addEventListener("loadeddata", onReady, { once: true });
      });
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    return { dataUrl, width: w, height: h };
  }
}

// Singleton instance for app-wide use
let _instance: CaptureService | null = null;
export function getCapture(): CaptureService {
  if (typeof window === "undefined") {
    // SSR-safe stub
    return new CaptureService();
  }
  if (!_instance) _instance = new CaptureService();
  return _instance;
}

// Helpers
export function dataUrlToBase64(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("Invalid data URL");
  return { mimeType: match[1], base64: match[2] };
}
