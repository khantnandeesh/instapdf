"use client";
/**
 * Page rasters from pdf.js, one queue for the whole editor: visible pages first, at most two
 * renders at a time, canvases capped at 16.7 megapixels (iOS limit) (U-E5).
 */
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

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
 * device pixel ratio. Resolves with the canvas, null if cancelled, or "failed".
 */
export function renderPage(pdf: PDFDocumentProxy, src: number, scale: number, rotation: number, priority = 0): { promise: Promise<HTMLCanvasElement | null | "failed">; cancel: () => void } {
  let task: RenderTask | null = null;
  let resolve!: (c: HTMLCanvasElement | null | "failed") => void;
  const promise = new Promise<HTMLCanvasElement | null | "failed">((r) => (resolve = r));
  const job: Job = {
    priority,
    cancelled: false,
    run: async () => {
      if (job.cancelled) return resolve(null);
      let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
      try {
        page = await pdf.getPage(src + 1);
        if (job.cancelled) return resolve(null);
        let dpr = Math.min(2, window.devicePixelRatio || 1);
        let viewport = page.getViewport({ scale: scale * dpr, rotation });
        if (viewport.width * viewport.height > MAX_PIXELS) {
          dpr *= Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height));
          viewport = page.getViewport({ scale: scale * dpr, rotation });
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        task = page.render({ canvas, viewport });
        await task.promise;
        resolve(job.cancelled ? null : canvas);
      } catch {
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
