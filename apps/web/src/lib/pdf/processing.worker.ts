/// <reference lib="webworker" />
/**
 * Processing Web Worker: runs browser tools off the main thread.
 * Files arrive as Blobs (passed by reference) and never leave the device.
 */
import { runJob, USER_ERROR, warmJobs, type Job, type JobEnv, type JobOutput } from "./jobs";
import type { FontManifest } from "./text";

/** `warm`: no job yet, only the code these kinds of job will need. */
export type WorkerRequest = { id: number; job: Job } | { warm: Job["kind"][] };
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
  /**
   * GIF (first frame), BMP and WebP: decoded by the browser to RGBA, read back in
   * bands of rows so no single canvas goes past the area limit some engines have
   * (about 16.7 megapixels). If the browser still cannot hand the pixels back,
   * the user gets a clear message instead of a generic failure.
   */
  async decodeImage(bytes, format, name) {
    const tooLarge = () => new Error(`${USER_ERROR}${name} is too large for this browser to read. Save it as PNG or JPEG and try again.`);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: `image/${format}` }));
    } catch {
      throw tooLarge();
    }
    try {
      const { width, height } = bitmap;
      const rgba = new Uint8Array(width * height * 4);
      const rows = Math.max(1, Math.min(height, Math.floor(4_000_000 / width)));
      const canvas = new OffscreenCanvas(width, rows);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw tooLarge();
      for (let y = 0; y < height; y += rows) {
        const h = Math.min(rows, height - y);
        ctx.clearRect(0, 0, width, rows);
        ctx.drawImage(bitmap, 0, y, width, h, 0, 0, width, h);
        const data = ctx.getImageData(0, 0, width, h).data;
        rgba.set(data, y * width * 4);
      }
      return { rgba, width, height };
    } catch (e) {
      throw e instanceof Error && e.message.startsWith(USER_ERROR) ? e : tooLarge();
    } finally {
      bitmap.close();
    }
  },
};

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if ("warm" in event.data) return warmJobs(event.data.warm);
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
