"use client";
/**
 * Thumbnail renderer shared by the page grid, file cards and result preview.
 * Renders only what is asked for (the grid asks for visible tiles), a few at a
 * time, newest priority first. Rendering itself happens in pdf.js's renderer
 * worker (OffscreenCanvas) when available, otherwise on the main thread.
 */
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type Request = {
  key: string;
  doc: PDFDocumentProxy;
  index: number;
  cssSize: number;
  priority: number;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
  /** Set while the render runs, so cancelling stops the pdf.js RenderTask. */
  handle?: RenderHandle;
};

const MAX_DPR = 2;
const CONCURRENCY = 3;

export class ThumbnailRenderer {
  private docs = new Map<string, PDFDocumentProxy>();
  private queue: Request[] = [];
  private running = 0;
  private active = new Set<Request>();

  register(fileId: string, doc: PDFDocumentProxy): void {
    this.docs.set(fileId, doc);
  }

  unregister(fileId: string): void {
    this.docs.delete(fileId);
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
   * Renders page `index` so its longest side is `cssSize` CSS pixels.
   * Returns a cancel function; `onDone` is not called after cancel.
   */
  request(fileId: string, index: number, cssSize: number, priority: number, onDone: (canvas: HTMLCanvasElement) => void): () => void {
    const doc = this.docs.get(fileId);
    if (!doc) return () => {};
    let cancelled = false;
    const req: Request = {
      key: `${fileId}:${index}`,
      doc,
      index,
      cssSize,
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
      next.handle = startRender(next.doc, next.index, next.cssSize);
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
export function startRender(doc: PDFDocumentProxy, index: number, cssSize: number): RenderHandle {
  let task: RenderTask | null = null;
  let cancelled = false;
  const promise = (async () => {
    const page = await doc.getPage(index + 1);
    try {
      if (cancelled) throw new DOMException("Render cancelled", "AbortError");
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(MAX_DPR, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
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
