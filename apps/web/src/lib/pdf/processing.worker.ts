/// <reference lib="webworker" />
/**
 * Processing Web Worker: runs browser tools off the main thread.
 * Files arrive as Blobs (passed by reference) and never leave the device.
 */
import type { ImageFormat } from "./images";
import { encodePng } from "./png";
import { runJob, type Job, type JobEnv, type JobOutput } from "./jobs";
import type { FontManifest } from "./text";

export type WorkerRequest = { id: number; job: Job };
export type WorkerResponse =
  | { id: number; type: "progress"; value: number; phase?: "fonts" | "pages" }
  | { id: number; type: "done"; output: JobOutput }
  | { id: number; type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Fonts are static files on our own origin (public/fonts/noto, built by scripts/copy-fonts.mjs). */
const FONT_BASE = "/fonts/noto/";
let manifest: Promise<FontManifest> | null = null;
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

const env: JobEnv = {
  fonts: {
    manifest: () => {
      manifest ??= fetchBytes(`${FONT_BASE}manifest.json`).then((b) => JSON.parse(new TextDecoder().decode(b)) as FontManifest);
      manifest.catch(() => (manifest = null));
      return manifest;
    },
    load: (file) => fetchBytes(`${FONT_BASE}${encodeURIComponent(file)}`),
  },
  /** GIF (first frame), BMP and WebP: decoded by the browser, re-encoded as PNG. */
  async decodeImage(bytes: Uint8Array, format: ImageFormat) {
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: `image/${format}` }));
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      return encodePng(new Uint8Array(data.buffer, data.byteOffset, data.length), bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  },
};

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, job } = event.data;
  const post = (msg: WorkerResponse) => scope.postMessage(msg);
  try {
    let last = 0;
    let lastValue = 0;
    let lastPhase: "fonts" | "pages" | undefined;
    const output = await runJob(
      job,
      (value, phase) => {
        const now = performance.now();
        // About one update per frame, but never drop a step of 5% or more (or a phase
        // change): the step before a long save would otherwise be lost and the bar would stall.
        if (value < 1 && phase === lastPhase && now - last < 16 && value - lastValue < 0.05) return;
        last = now;
        lastValue = value;
        lastPhase = phase;
        post({ id, type: "progress", value, phase });
      },
      env,
    );
    post({ id, type: "done", output });
  } catch (error) {
    // Log the failure without any file content.
    const message = error instanceof Error ? error.message : String(error);
    post({ id, type: "error", message });
  }
};
