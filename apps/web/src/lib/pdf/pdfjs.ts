"use client";
/**
 * Lazy pdf.js loader (never part of the route's first-load JS).
 * Parsing runs in pdf.js's own worker; page rendering runs in pdf.js's
 * renderer worker with OffscreenCanvas where the browser supports it, and
 * pdf.js falls back to main-thread canvas rendering by itself otherwise.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker } from "pdfjs-dist";
import type { Permission } from "@/tools/registry";

type PdfjsModule = typeof import("pdfjs-dist");

let modulePromise: Promise<PdfjsModule> | null = null;
let sharedWorker: PDFWorker | null = null;

/** pdf.js's parsing and rendering workers (content-hashed static files, cached for a year). */
export const workerUrls = () => [new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString(), new URL("pdfjs-dist/build/pdf.renderer.min.mjs", import.meta.url).toString()] as const;

export function loadPdfjs(): Promise<PdfjsModule> {
  // The editor's idle prefetch (tools/editor/idle-prefetch.ts) names this same specifier; keep them
  // equal (idle-prefetch.test.ts checks).
  modulePromise ??= import("pdfjs-dist").then((pdfjs) => {
    const [worker, renderer] = workerUrls();
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    pdfjs.GlobalWorkerOptions.rendererSrc = renderer;
    return pdfjs;
  });
  modulePromise.catch(() => (modulePromise = null));
  return modulePromise;
}

/** Warm-up on hover/focus of the picker so parsing starts with pdf.js loaded. */
export function prefetchPdfjs(): void {
  void loadPdfjs().catch(() => {});
}

export type PageSize = { width: number; height: number };

export type OpenedPdf = {
  task: PDFDocumentLoadingTask;
  doc: PDFDocumentProxy;
  pageCount: number;
  wasEncrypted: boolean;
  denied: Permission[];
};

export type OpenResult = { ok: true; pdf: OpenedPdf } | { ok: false; reason: "needPassword" | "wrongPassword" | "corrupt" };

/** pdf.js PermissionFlag values for each permission we name. */
const PERMISSION_FLAGS: Record<Permission, number> = {
  print: 4,
  modify: 8,
  copy: 16,
  annotate: 32,
  fillForms: 256,
  assemble: 1024,
};

/** A worker for plain picture data, started ahead of the run that will need it (`warmPlainImages`). */
let spare: InstanceType<PdfjsModule["PDFWorker"]> | null = null;

/** Starts the worker `openPdf(…, { plainImages: true })` needs, so a run that reads pictures does not wait for it. */
export function warmPlainImages(): void {
  if (!spare) void loadPdfjs().then((pdfjs) => (spare ??= new pdfjs.PDFWorker())).catch(() => {});
}

/**
 * Opens a PDF for reading (page sizes and thumbnails). `data` is transferred to
 * pdf.js, so pass a buffer the caller no longer needs.
 */
export async function openPdf(data: Uint8Array, password?: string, options?: { /** Pictures come back as exact pixel data, never through a canvas (which some browsers falsify or shrink). */ plainImages?: boolean }): Promise<OpenResult> {
  const pdfjs = await loadPdfjs();
  // pdf.js settles how it decodes pictures once per worker, so plain data needs a worker of its own.
  const own = options?.plainImages ? (spare ?? new pdfjs.PDFWorker()) : null;
  if (own) spare = null;
  const task = pdfjs.getDocument({ data, password, worker: own ?? (sharedWorker ??= new pdfjs.PDFWorker()), verbosity: 0, ...(own ? { isOffscreenCanvasSupported: false, isImageDecoderSupported: false } : {}) });
  if (own) {
    const destroy = task.destroy.bind(task);
    task.destroy = async () => {
      await destroy();
      own.destroy();
    };
  }
  try {
    const doc = await task.promise;
    const [metadata, allowed] = await Promise.all([doc.getMetadata().catch(() => null), doc.getPermissions().catch(() => null)]);
    const info = (metadata?.info ?? {}) as { EncryptFilterName?: string | null };
    const denied = allowed
      ? (Object.keys(PERMISSION_FLAGS) as Permission[]).filter((p) => !allowed.has(PERMISSION_FLAGS[p]))
      : [];
    return { ok: true, pdf: { task, doc, pageCount: doc.numPages, wasEncrypted: !!info.EncryptFilterName, denied } };
  } catch (error) {
    void task.destroy();
    const e = error as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      return { ok: false, reason: e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? "wrongPassword" : "needPassword" };
    }
    return { ok: false, reason: "corrupt" };
  }
}

/**
 * Reads every page's displayed size (its own /Rotate applied), in parallel
 * batches. Page boxes are needed to size placeholders before any render.
 */
export async function readPageSizes(doc: PDFDocumentProxy, signal?: AbortSignal): Promise<PageSize[]> {
  const sizes: PageSize[] = new Array(doc.numPages);
  const BATCH = 50;
  for (let start = 0; start < doc.numPages; start += BATCH) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const end = Math.min(doc.numPages, start + BATCH);
    await Promise.all(
      Array.from({ length: end - start }, async (_, k) => {
        const page = await doc.getPage(start + k + 1);
        try {
          const vp = page.getViewport({ scale: 1 });
          sizes[start + k] = { width: vp.width, height: vp.height };
        } finally {
          page.cleanup();
        }
      }),
    );
  }
  return sizes;
}
