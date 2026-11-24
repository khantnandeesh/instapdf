"use client";
/** Main-thread side of the TIFF worker (created on the first TIFF, never on page load). */
import type { TiffRequest, TiffResponse } from "./tiff.worker";

export const TIFF_PROBE_TIMEOUT_MS = 5000;
/** A thumbnail slower than this stops the worker, so a stuck decode can't fail the next probe. */
export const TIFF_THUMB_TIMEOUT_MS = 20000;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: TiffResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./tiff.worker.ts", import.meta.url), { type: "module", name: "instapdf-tiff" });
    worker.onmessage = (e: MessageEvent<TiffResponse>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data);
    };
    worker.onerror = () => reset();
  }
  return worker;
}

/** Stops a stuck worker; everything in flight is answered "unreadable". */
function reset() {
  worker?.terminate();
  worker = null;
  for (const [id, done] of pending) done({ id, ok: false, problem: "unreadable" });
  pending.clear();
}

type Ask = { op: "probe"; blob: Blob } | { op: "thumb"; key: string; blob: Blob; frame: number; max: number };

function ask(req: Ask, timeoutMs?: number): Promise<TiffResponse> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    pending.set(id, (r) => {
      if (timer) clearTimeout(timer);
      resolve(r);
    });
    if (timeoutMs) timer = setTimeout(reset, timeoutMs);
    w.postMessage({ ...req, id } as TiffRequest);
  });
}

/** Frame sizes, or why the file is refused. A probe that takes too long counts as unreadable. */
export async function probeTiff(blob: Blob): Promise<{ frames: { width: number; height: number }[] } | { problem: "unreadable" | "tooLarge" }> {
  const r = await ask({ op: "probe", blob }, TIFF_PROBE_TIMEOUT_MS);
  return r.ok ? { frames: r.frames ?? [] } : { problem: r.problem };
}

/** One frame as a bitmap whose longest side is at most `max` pixels. */
export async function tiffThumb(key: string, blob: Blob, frame: number, max: number): Promise<ImageBitmap> {
  const r = await ask({ op: "thumb", key, blob, frame, max }, TIFF_THUMB_TIMEOUT_MS);
  if (!r.ok || !r.bitmap) throw new Error("TIFF frame could not be decoded");
  return r.bitmap;
}

export function forgetTiff(key: string) {
  worker?.postMessage({ id: 0, op: "forget", key } satisfies TiffRequest);
}
