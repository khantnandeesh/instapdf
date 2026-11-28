/**
 * Flatten to pictures (spec F10 §2b): every page is drawn with pdf.js at the chosen resolution and
 * the picture becomes the whole page of a new PDF. Nothing on it can be selected, copied or edited
 * afterwards: text, fields, annotations and hidden layers are gone, only what the page showed stays.
 * The pages are drawn in this tab (a canvas is needed), one at a time; the processing worker puts
 * the pictures into the new files.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { canvasBlob, drawPage } from "./page-images";
import type { PictureDpi } from "./picture-dpi";
import { openPdf } from "./pdfjs";
import { USER_ERROR } from "./user-error";
import { runInWorker } from "./worker-client";

export type PictureSource = { name: string; source: Blob; password?: string; pageCount: number };

const JPG_QUALITY = 0.85;
/** Drawing is most of the work; building the files is the rest of the bar. */
const DRAWN = 0.85;
const aborted = () => new DOMException("Cancelled", "AbortError");

export async function flattenToPictures(sources: readonly PictureSource[], dpi: PictureDpi, zipName: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pageCount, 0) || 1;
  let done = 0;
  let reduced = 0;
  const files: { name: string; title?: string; encrypted: boolean; pages: { jpg: Blob; width: number; height: number }[] }[] = [];
  for (const src of sources) {
    const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
    if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
    const { doc, task } = opened.pdf;
    try {
      // The title survives, so the file still says what it is; nothing else is carried over.
      const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: unknown } | undefined;
      const pages: { jpg: Blob; width: number; height: number }[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (signal.aborted) throw aborted();
        const page = await doc.getPage(n);
        let canvas: HTMLCanvasElement | undefined;
        try {
          // The page as shown: its own rotation is already in the picture.
          const size = page.getViewport({ scale: 1 });
          const drawn = await drawPage(page as never, dpi, signal, (c) => canvasBlob(c, "image/jpeg", JPG_QUALITY), `Page ${n} of ${src.name}`);
          canvas = drawn.canvas;
          if (drawn.reduced) reduced++;
          pages.push({ jpg: drawn.blob, width: size.width, height: size.height });
        } finally {
          if (canvas) canvas.width = canvas.height = 0;
          page.cleanup();
        }
        onProgress((++done / total) * DRAWN);
        // Let the pill paint and Cancel land between pages.
        await new Promise((r) => setTimeout(r, 0));
      }
      files.push({ name: src.name, title: typeof info?.Title === "string" && info.Title.trim() ? info.Title : undefined, encrypted: opened.pdf.wasEncrypted, pages });
    } finally {
      void task.destroy();
    }
  }
  const out = await runInWorker({ kind: "pictures", zipName, files }, { signal, onProgress: (f) => onProgress(DRAWN + f * (1 - DRAWN)) });
  const notes = [...(out.warnings ?? []), ...(reduced ? [reduced === 1 ? "1 large page was drawn at a lower resolution." : `${reduced} large pages were drawn at a lower resolution.`] : [])];
  return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: notes.length ? notes : undefined };
}
