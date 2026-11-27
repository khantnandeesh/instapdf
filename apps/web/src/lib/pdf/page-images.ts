/**
 * PDF to image (spec F12 §2): draws the chosen pages with pdf.js at the chosen resolution and
 * encodes them as JPG, PNG or TIFF, in this tab. One page gives one image; more give a ZIP (stored
 * entries, so the result card can hand out single images). Pages are drawn one at a time and each
 * canvas is dropped before the next, so a long document never holds more than one page in memory.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { derivedName, pageImageName, uniqueNames } from "./naming";
import { openPdf } from "./pdfjs";
import { USER_ERROR } from "./user-error";

export type PageImageFormat = "jpg" | "png" | "tiff";
export const PAGE_IMAGE_DPI = [75, 150, 220, 300] as const;
export type PageImageDpi = (typeof PAGE_IMAGE_DPI)[number];
export type PageImageOptions = {
  format: PageImageFormat;
  dpi: PageImageDpi;
  grey: boolean;
  /** TIFF only: one file per document holding all its pages. */
  singleTiff: boolean;
};
/** One document and the pages to draw from it (0-based, in output order). */
export type PageImageSource = { name: string; source: Blob; password?: string; pageCount: number; pages: number[] };

const MIME = { jpg: "image/jpeg", png: "image/png", tiff: "image/tiff" } as const;
const JPG_QUALITY = 0.92;
/** The most pixels one page may take (a 300 dpi A2 sheet fits). Larger pages are drawn smaller, with a note. */
export const MAX_PAGE_PIXELS = 40_000_000;
/** The longest canvas side every current engine draws. */
const MAX_SIDE = 16_384;

/** The scale that draws a page of `width` × `height` points at `dpi`, lowered to fit the pixel caps. */
export function pageScale(width: number, height: number, dpi: number, maxPixels = MAX_PAGE_PIXELS): { scale: number; reduced: boolean } {
  const want = dpi / 72;
  const fit = Math.min(want, Math.sqrt(maxPixels / (width * height)), MAX_SIDE / Math.max(width, height));
  return { scale: fit, reduced: fit < want - 1e-9 };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const aborted = () => new DOMException("Cancelled", "AbortError");

function toGrey(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29 + 128) >> 8;
  ctx.putImageData(img, 0, 0);
}

export async function pagesToImages(
  sources: readonly PageImageSource[],
  opts: PageImageOptions,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pages.length, 0);
  if (!total) throw new Error(`${USER_ERROR}Pick at least one page.`);
  const tiff = opts.format === "tiff" ? await import("./tiff-write") : null;
  const perFile = opts.format === "tiff" && opts.singleTiff;
  const outputs: { name: string; pages: number; blob: Blob; detail?: string }[] = [];
  let preview: Blob | undefined;
  let reducedPages = 0;
  let done = 0;

  for (const src of sources) {
    if (!src.pages.length) continue;
    if (signal.aborted) throw aborted();
    const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
    if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
    const { doc, task } = opened.pdf;
    const frames: import("./tiff-write").TiffPage[] = [];
    try {
      for (const index of src.pages) {
        if (signal.aborted) throw aborted();
        const page = await doc.getPage(index + 1);
        try {
          const base = page.getViewport({ scale: 1 });
          let { scale, reduced } = pageScale(base.width, base.height, opts.dpi);
          let canvas: HTMLCanvasElement;
          let ctx: CanvasRenderingContext2D | null;
          let blob: Blob | null = null;
          // An engine with a smaller canvas limit (iOS) gives no context or no blob: halve the area and retry.
          for (let tries = 0; ; tries++) {
            const viewport = page.getViewport({ scale });
            canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            ctx = canvas.getContext("2d", { willReadFrequently: opts.grey || !!tiff });
            if (ctx) {
              const render = page.render({ canvas, viewport });
              const stop = () => render.cancel();
              signal.addEventListener("abort", stop, { once: true });
              try {
                await render.promise;
              } catch (e) {
                if (signal.aborted) throw aborted();
                throw e;
              } finally {
                signal.removeEventListener("abort", stop);
              }
              if (opts.grey && !tiff) toGrey(ctx, canvas.width, canvas.height);
              blob = tiff ? new Blob([]) : await toBlob(canvas, MIME[opts.format], opts.format === "jpg" ? JPG_QUALITY : undefined);
            }
            if (ctx && blob) break;
            if (tries >= 3) throw new Error(`${USER_ERROR}Page ${index + 1} of ${src.name} is too large to draw on this device.`);
            canvas.width = canvas.height = 0;
            scale /= Math.SQRT2;
            reduced = true;
          }
          if (reduced) reducedPages++;
          const effectiveDpi = Math.round(scale * 72);
          if (tiff) {
            const data = tiff.packPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, opts.grey);
            const frame = { width: canvas.width, height: canvas.height, channels: opts.grey ? (1 as const) : (3 as const), data, dpi: effectiveDpi };
            if (perFile) frames.push(frame);
            else blob = new Blob([tiff.encodeTiff([frame])], { type: MIME.tiff });
          }
          // The result card shows the first image; a browser cannot draw TIFF, so that case keeps a JPG of it.
          if (!preview) preview = tiff ? ((await toBlob(canvas, "image/jpeg", 0.85)) ?? undefined) : blob!;
          if (!perFile) outputs.push({ name: pageImageName(src.name, index + 1, src.pageCount, opts.format), pages: 1, blob: blob!, detail: `${canvas.width} × ${canvas.height} px` });
          canvas.width = canvas.height = 0; // frees the backing store now, not at the next GC
        } finally {
          page.cleanup();
        }
        onProgress(++done / total);
        // Let the pill paint and Cancel land between pages.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (perFile && tiff) outputs.push({ name: derivedName(src.name, ".tiff"), pages: frames.length, blob: new Blob([tiff.encodeTiff(frames)], { type: MIME.tiff }) });
    } finally {
      void task.destroy();
    }
  }

  const warnings = reducedPages ? [reducedPages === 1 ? "1 large page was saved at a lower resolution." : `${reducedPages} large pages were saved at a lower resolution.`] : undefined;
  const unit = (n: number) => (n === 1 ? "1 image" : `${n} images`);
  if (outputs.length === 1) {
    const o = outputs[0];
    return { name: o.name, type: MIME[opts.format], blob: o.blob, size: o.blob.size, pageCount: o.pages, lead: o.detail ? `1 image, ${o.detail}` : unit(1), preview, wasEncrypted: false, warnings };
  }
  const { createZipWriter } = await import("./zip");
  const zip = createZipWriter();
  const names = uniqueNames(outputs.map((o) => o.name));
  for (let i = 0; i < outputs.length; i++) {
    if (signal.aborted) throw aborted();
    zip.add(names[i], new Uint8Array(await outputs[i].blob.arrayBuffer()));
  }
  const blob = zip.finish();
  const withPages = sources.filter((s) => s.pages.length);
  return {
    name: withPages.length === 1 ? derivedName(withPages[0].name, "-images.zip") : "berrypdf-images.zip",
    type: "application/zip",
    blob,
    size: blob.size,
    pageCount: total,
    lead: unit(outputs.length),
    entries: outputs.map((o, i) => ({ name: names[i], pageCount: o.pages, detail: o.detail })),
    preview,
    wasEncrypted: false,
    warnings,
  };
}
