/**
 * Browser entry for Detect fields: a lazily created worker for the analysis and a canvas factory.
 * Import this module with `import()` from the editor, so none of it is in the editor's first load.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AnalyzeInput, Found } from "./analyze";
import { detectFields, type DetectOptions, type DetectResult } from "./run";

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (f: Found[]) => void; reject: (e: Error) => void }>();

function analyzeInWorker(input: AnalyzeInput): Promise<Found[]> {
  if (!worker) {
    worker = new Worker(new URL("./detect.worker.ts", import.meta.url), { type: "module", name: "berry-detect" });
    // A crash in the worker (out of memory on a huge page, say) fails the waiting pages instead of
    // leaving them pending; the next page starts a fresh worker.
    const fail = (message: string) => {
      worker?.terminate();
      worker = null;
      for (const w of waiting.values()) w.reject(new Error(message));
      waiting.clear();
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail(e.message || "Detect fields stopped");
    };
    worker.onmessageerror = () => fail("Detect fields could not read a page");
    worker.onmessage = (e: MessageEvent<{ id: number; found?: Found[]; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else w.resolve(e.data.found ?? []);
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, input }, [input.gray.data.buffer]);
  });
}

const makeCanvas = (w: number, h: number) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h) as unknown as ReturnType<DetectOptions["makeCanvas"]>;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function detectInBrowser(pdf: PDFDocumentProxy, opts: Omit<DetectOptions, "analyze" | "makeCanvas">): Promise<DetectResult> {
  return detectFields(pdf, { ...opts, analyze: analyzeInWorker, makeCanvas, locale: opts.locale ?? navigator.language });
}

/** Ends the worker (when the editor closes). */
export function disposeDetect() {
  worker?.terminate();
  worker = null;
  for (const w of waiting.values()) w.reject(new Error("closed"));
  waiting.clear();
}
