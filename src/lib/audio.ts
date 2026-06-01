// Audio capture: mixes mic + system audio (from the active display stream if it
// has an audio track) into one MediaRecorder. Emits ~10s chunks as opus/webm
// blobs to a registered listener.
//
// On Chromium, system audio is only available when the user shares a tab with
// the "Share audio" checkbox; we gracefully fall back to mic-only otherwise.

import { getCapture } from "./capture";

export type AudioChunkListener = (blob: Blob, durationMs: number) => void;

export class AudioCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkMs = 10_000;
  private stopping = false;
  private listeners = new Set<AudioChunkListener>();
  private stateListeners = new Set<(active: boolean) => void>();
  private startedAt = 0;

  isActive() {
    return this.recorder?.state === "recording";
  }

  onChunk(cb: AudioChunkListener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onChange(cb: (active: boolean) => void) {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private emit() {
    for (const cb of this.stateListeners) cb(this.isActive());
  }

  async start(opts: { mic?: boolean; system?: boolean; chunkMs?: number } = {}) {
    const { mic = true, system = true, chunkMs = 10_000 } = opts;
    if (this.recorder) await this.stop();
    this.stopping = false;
    this.chunkMs = chunkMs;

    const sources: MediaStream[] = [];

    if (mic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        sources.push(micStream);
      } catch (e) {
        console.warn("Mic unavailable", e);
      }
    }

    if (system) {
      const cap = getCapture().getStream();
      if (cap && cap.getAudioTracks().length > 0) {
        // Reuse the system-audio track from the existing display capture
        sources.push(new MediaStream(cap.getAudioTracks()));
      }
    }

    if (sources.length === 0) {
      throw new Error("No audio source available. Enable Mic, or share a tab with audio.");
    }

    // Mix all sources into a single output stream via Web Audio
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    for (const s of sources) {
      const node = ctx.createMediaStreamSource(s);
      node.connect(dest);
    }
    this.ctx = ctx;
    this.stream = dest.stream;

    this.startedAt = Date.now();
    this.startRecorderChunk();
    this.emit();
  }

  async stop() {
    this.stopping = true;
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    if (this.ctx) await this.ctx.close().catch(() => {});
    this.recorder = null;
    this.stream = null;
    this.ctx = null;
    this.emit();
  }

  private startRecorderChunk() {
    if (!this.stream || this.stopping) return;

    const mime = pickMimeType();
    const recorder = new MediaRecorder(this.stream, { mimeType: mime });
    const chunkStart = Date.now();
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        const dur = Date.now() - chunkStart;
        for (const cb of this.listeners) cb(e.data, dur);
      }
    };

    recorder.onstop = () => {
      if (!this.stopping && this.stream) {
        this.startRecorderChunk();
      } else {
        this.emit();
      }
    };

    recorder.start();
    this.chunkTimer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, this.chunkMs);
  }
}

function pickMimeType(): string {
  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

let _instance: AudioCapture | null = null;
export function getAudio(): AudioCapture {
  if (!_instance) _instance = new AudioCapture();
  return _instance;
}
