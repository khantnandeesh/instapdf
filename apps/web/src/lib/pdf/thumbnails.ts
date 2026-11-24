"use client";
/**
 * Thumbnail renderer shared by the page grid, file cards and result preview.
 * Renders only what is asked for (the grid asks for visible tiles), a few at a
 * time, newest priority first. Rendering itself happens in pdf.js's renderer
 * worker (OffscreenCanvas) when available, otherwise on the main thread.
 */
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { imagePlacement, type ImageFormat } from "./images";

/** A picture input: rendered without pdf.js, on the A4 page it becomes (spec F3 M-11 #6). */
type ImageEntry = { kind: "image"; blob: Blob; format: ImageFormat; frames: { width: number; height: number }[] };
type Entry = PDFDocumentProxy | ImageEntry;
const isImage = (e: Entry): e is ImageEntry => (e as ImageEntry).kind === "image";

type Request = {
  key: string;
  doc: Entry;
  index: number;
  cssSize: number;
  /** Device-pixel cap for this render (thumbnails stop at 2; the big page view goes to the screen's own). */
  maxDpr: number;
  priority: number;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
  /** Set while the render runs, so cancelling stops the pdf.js RenderTask. */
  handle?: RenderHandle;
};

const MAX_DPR = 2;

/** Device pixels per CSS pixel for a render: the screen's ratio, capped (never below 1). */
export function renderDpr(deviceRatio: number | undefined, cap = MAX_DPR): number {
  return Math.max(1, Math.min(cap, deviceRatio || 1));
}
const screenDpr = (cap: number) => renderDpr(typeof window === "undefined" ? 1 : window.devicePixelRatio, cap);
const CONCURRENCY = 3;

export class ThumbnailRenderer {
  private docs = new Map<string, Entry>();
  private queue: Request[] = [];
  private running = 0;
  private active = new Set<Request>();

  register(fileId: string, doc: PDFDocumentProxy): void {
    this.docs.set(fileId, doc);
  }

  registerImage(fileId: string, blob: Blob, format: ImageFormat, frames: { width: number; height: number }[]): void {
    this.docs.set(fileId, { kind: "image", blob, format, frames });
  }

  unregister(fileId: string): void {
    const entry = this.docs.get(fileId);
    this.docs.delete(fileId);
    dropBitmaps(fileId, !!entry && isImage(entry) && entry.format === "tiff");
    for (const r of [...this.queue, ...this.active]) {
      if (!r.key.startsWith(`${fileId}:`)) continue;
      r.cancelled = true;
      r.handle?.cancel();
    }
  }

  has(fileId: string): boolean {
    return this.docs.has(fileId);
  }

  /**
   * Renders page `index` so its longest side is `cssSize` CSS pixels, at up to `maxDpr` device pixels each.
   * Returns a cancel function; `onDone` is not called after cancel.
   */
  request(fileId: string, index: number, cssSize: number, priority: number, onDone: (canvas: HTMLCanvasElement) => void, maxDpr = MAX_DPR): () => void {
    const doc = this.docs.get(fileId);
    if (!doc) return () => {};
    let cancelled = false;
    const req: Request = {
      key: `${fileId}:${index}`,
      doc,
      index,
      cssSize,
      maxDpr,
      priority,
      cancelled: false,
      resolve: (canvas) => {
        if (!cancelled) onDone(canvas);
      },
      reject: () => {},
    };
    this.queue.push(req);
    this.pump();
    return () => {
      cancelled = true;
      req.cancelled = true;
      req.handle?.cancel();
    };
  }

  private pump(): void {
    while (this.running < CONCURRENCY && this.queue.length) {
      this.queue.sort((a, b) => a.priority - b.priority);
      const next = this.queue.shift()!;
      if (next.cancelled) continue;
      this.running++;
      const doc = next.doc;
      next.handle = isImage(doc) ? startImageRender(next.key.slice(0, next.key.lastIndexOf(":")), doc, next.index, next.cssSize, next.maxDpr) : startRender(doc, next.index, next.cssSize, next.maxDpr);
      this.active.add(next);
      next.handle.promise
        .then(next.resolve, next.reject)
        .finally(() => {
          next.handle = undefined;
          this.active.delete(next);
          this.running--;
          this.pump();
        });
    }
  }
}

export type RenderHandle = { promise: Promise<HTMLCanvasElement>; cancel: () => void };

/**
 * Starts rendering page `index` so its longest side is `cssSize` CSS pixels.
 * `cancel()` cancels the pdf.js RenderTask (the promise then rejects). The
 * page's resources are released with `page.cleanup()` when it settles.
 */
export function startRender(doc: PDFDocumentProxy, index: number, cssSize: number, maxDpr = MAX_DPR): RenderHandle {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page = await doc.getPage(index + 1);
    try {
      if (cancelled) throw new DOMException("Render cancelled", "AbortError");
      const base = page.getViewport({ scale: 1 });
      const dpr = screenDpr(maxDpr);
      const scale = (cssSize * dpr) / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      task = page.render({ canvas, viewport });
      await task.promise;
      return canvas;
    } finally {
      task = null;
      page.cleanup(); // pdf.js defers this itself while another render of the page is running
    }
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}

export function renderPage(doc: PDFDocumentProxy, index: number, cssSize: number): Promise<HTMLCanvasElement> {
  return startRender(doc, index, cssSize).promise;
}

/** Decoded bitmaps per image frame (longest side <= 800 px), a few kept for re-renders. */
const BITMAP_MAX = 800;
const BITMAP_CACHE = 12;
const bitmaps = new Map<string, Promise<ImageBitmap>>();

function dropBitmaps(fileId: string, tiff: boolean) {
  if (tiff) void import("./tiff-client").then((m) => m.forgetTiff(fileId)).catch(() => {});
  for (const [key, bmp] of bitmaps) {
    if (!key.startsWith(`${fileId}:`)) continue;
    bitmaps.delete(key);
    void bmp.then((b) => b.close()).catch(() => {});
  }
}

async function decodeFrame(fileId: string, entry: ImageEntry, index: number): Promise<ImageBitmap> {
  const frame = entry.frames[index] ?? entry.frames[0];
  const scale = Math.min(1, BITMAP_MAX / Math.max(frame.width, frame.height));
  const size = { resizeWidth: Math.max(1, Math.round(frame.width * scale)), resizeHeight: Math.max(1, Math.round(frame.height * scale)), resizeQuality: "medium" as const };
  if (entry.format === "tiff") {
    // Walked once per file and decoded in the TIFF worker; comes back downscaled.
    const { tiffThumb } = await import("./tiff-client");
    return tiffThumb(fileId, entry.blob, index, BITMAP_MAX);
  }
  const source: Blob = entry.blob;
  try {
    return await createImageBitmap(source, size);
  } catch {
    return createImageBitmap(source); // engines without resize options
  }
}

function bitmapFor(fileId: string, entry: ImageEntry, index: number): Promise<ImageBitmap> {
  const key = `${fileId}:${index}`;
  let p = bitmaps.get(key);
  if (!p) {
    p = decodeFrame(fileId, entry, index);
    p.catch(() => bitmaps.delete(key));
    bitmaps.set(key, p);
    if (bitmaps.size > BITMAP_CACHE) {
      const [oldest] = bitmaps.keys();
      const old = bitmaps.get(oldest);
      bitmaps.delete(oldest);
      void old?.then((b) => b.close()).catch(() => {});
    }
  } else {
    bitmaps.delete(key); // refresh its LRU position
    bitmaps.set(key, p);
  }
  return p;
}

/** Draws image frame `index` on its white A4 page, longest side `cssSize` CSS pixels. */
export function startImageRender(fileId: string, entry: ImageEntry, index: number, cssSize: number, maxDpr = MAX_DPR): RenderHandle {
  let cancelled = false;
  const promise = (async () => {
    const frame = entry.frames[index] ?? entry.frames[0];
    const place = imagePlacement(frame.width, frame.height);
    const bitmap = await bitmapFor(fileId, entry, index);
    if (cancelled) throw new DOMException("Render cancelled", "AbortError");
    const dpr = screenDpr(maxDpr);
    const k = (cssSize * dpr) / Math.max(place.page.width, place.page.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(place.page.width * k));
    canvas.height = Math.max(1, Math.floor(place.page.height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ip-paper").trim() || "white"; // the paper token
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // PDF y grows upwards; the canvas y grows downwards.
    ctx.drawImage(bitmap, place.x * k, (place.page.height - place.y - place.height) * k, place.width * k, place.height * k);
    return canvas;
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
    },
  };
}
