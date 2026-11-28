/**
 * Flatten to pictures (spec F10 §2b): every page is drawn with pdf.js at the chosen resolution and
 * the picture becomes the whole page of a new PDF. Nothing on it can be selected, copied or edited
 * afterwards: text, fields, annotations and hidden layers are gone, only what the page showed stays.
 * The pages are drawn in this tab (a canvas is needed), one at a time; the processing worker puts
 * each file's pictures into its new PDF before the next file is drawn, so only one file's pictures
 * are held at a time.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { pdfOutputName, uniqueNames } from "./naming";
import { packBuilt, type BuiltPdf } from "./pack-built";
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
  const names = uniqueNames(sources.map((s) => pdfOutputName(s.name)));
  let done = 0;
  let reduced = 0;
  let wasEncrypted = false;
  const built: BuiltPdf[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
    if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
    const { doc, task } = opened.pdf;
    const before = done;
    let pages: { jpg: Blob; width: number; height: number }[] = [];
    let title: string | undefined;
    try {
      // The title survives, so the file still says what it is; nothing else is carried over.
      const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: unknown } | undefined;
      if (typeof info?.Title === "string" && info.Title.trim()) title = info.Title;
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
        onProgress(((before + (n / doc.numPages) * src.pageCount * DRAWN) / total) * 0.99);
        // Let the pill paint and Cancel land between pages.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      void task.destroy();
    }
    // One file at a time: its pictures are built into its PDF and let go before the next file is drawn.
    const out = await runInWorker(
      { kind: "pictures", zipName: "", files: [{ name: src.name, title, encrypted: opened.pdf.wasEncrypted, pages }] },
      { signal, onProgress: (f) => onProgress(((before + src.pageCount * (DRAWN + f * (1 - DRAWN))) / total) * 0.99) },
    );
    pages = [];
    wasEncrypted ||= out.wasEncrypted;
    built.push({ name: names[i], blob: out.blob, pageCount: out.pageCount ?? src.pageCount });
    done = before + src.pageCount;
  }
  const warnings = reduced ? [reduced === 1 ? "1 large page was drawn at a lower resolution." : `${reduced} large pages were drawn at a lower resolution.`] : undefined;
  const out = await packBuilt(built, zipName, signal, { wasEncrypted, warnings });
  onProgress(1);
  return out;
}
