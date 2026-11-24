"use client";
/**
 * Page rasters from pdf.js, one queue for the whole editor: visible pages first, at most two
 * renders at a time, canvases capped at 16.7 megapixels (iOS limit) (U-E5).
 */
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from "pdfjs-dist";

const MAX_PIXELS = 16_700_000;

type Job = { run: () => Promise<void>; priority: number; cancelled: boolean };
const queue: Job[] = [];
let running = 0;

function pump() {
  while (running < 2 && queue.length) {
    queue.sort((a, b) => a.priority - b.priority);
    const job = queue.shift()!;
    if (job.cancelled) continue;
    running++;
    void job.run().finally(() => {
      running--;
      pump();
    });
  }
}

/**
 * Renders source page `src` (zero-based) at `scale` CSS px per point, turned to `rotation`, at the
 * device pixel ratio (`forms`: the page's form fields are drawn by the editor, not here). Resolves with the canvas, null if cancelled, or "failed".
 */
export function renderPage(pdf: PDFDocumentProxy, src: number, scale: number, rotation: number, priority = 0, forms = false): { promise: Promise<HTMLCanvasElement | null | "failed">; cancel: () => void } {
  let task: RenderTask | null = null;
  let resolve!: (c: HTMLCanvasElement | null | "failed") => void;
  const promise = new Promise<HTMLCanvasElement | null | "failed">((r) => (resolve = r));
  const job: Job = {
    priority,
    cancelled: false,
    run: async () => {
      if (job.cancelled) return resolve(null);
      let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
      let canvas: HTMLCanvasElement | null = null;
      try {
        page = await pdf.getPage(src + 1);
        if (job.cancelled) return resolve(null);
        let dpr = Math.min(2, window.devicePixelRatio || 1);
        let viewport = page.getViewport({ scale: scale * dpr, rotation });
        if (viewport.width * viewport.height > MAX_PIXELS) {
          dpr *= Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height));
          viewport = page.getViewport({ scale: scale * dpr, rotation });
        }
        canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        // With the form loaded, its fields are drawn live by the field layer: leave them off the raster
        // (pdf.js AnnotationMode.ENABLE_FORMS), so a changed, moved or deleted field never shows twice.
        // Annotations pdf.js gives their own canvas (check boxes, radios, read-only text, no-rotate
        // notes) go to `own` instead of the page; the ones that aren't fields are drawn back.
        const own = forms ? new Map<string, HTMLCanvasElement>() : undefined;
        task = page.render({ canvas, viewport, annotationMode: forms ? 2 : 1, annotationCanvasMap: own });
        await task.promise;
        if (own?.size && !job.cancelled) await drawOwnCanvases(page, viewport, canvas, own);
        if (job.cancelled) release(canvas);
        resolve(job.cancelled ? null : canvas);
      } catch {
        if (canvas) release(canvas);
        resolve(job.cancelled ? null : "failed");
      } finally {
        page?.cleanup();
      }
    },
  };
  queue.push(job);
  pump();
  return {
    promise,
    cancel: () => {
      job.cancelled = true;
      task?.cancel();
    },
  };
}

/**
 * Puts `next` (or nothing) in `holder`, zeroing the canvases it replaces: iOS keeps a canvas's
 * backing store until its size is 0, and counts it against a small per-page budget.
 */
export function release(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

export function swapCanvas(holder: HTMLElement, next: HTMLCanvasElement | null) {
  for (const old of Array.from(holder.querySelectorAll("canvas"))) {
    if (old !== next) release(old);
  }
  if (next) holder.replaceChildren(next);
  else holder.replaceChildren();
}

const WIDGET = 20; // pdf.js AnnotationType.WIDGET

/** Draws the non-field annotations pdf.js painted on canvases of their own back onto the page. */
async function drawOwnCanvases(page: PDFPageProxy, viewport: PageViewport, canvas: HTMLCanvasElement, own: Map<string, HTMLCanvasElement>) {
  try {
    const ctx = canvas.getContext("2d");
    const annots = await page.getAnnotations({ intent: "display" });
    for (const a of annots) {
      const c = own.get(a.id);
      if (!c || !ctx || a.annotationType === WIDGET) continue;
      const [x0, y0] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]) as number[];
      const [x1, y1] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]) as number[];
      ctx.drawImage(c, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  } finally {
    for (const c of own.values()) release(c);
  }
}
