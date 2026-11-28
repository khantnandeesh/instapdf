/**
 * Compress (spec F6), the part that runs in the tab. As in Grayscale, pictures need a decoder for
 * every packing a PDF can hold, and pdf.js is that decoder: the worker says which pictures could be
 * smaller, pdf.js decodes each one here as the pages are read, it is scaled to the size the page
 * shows it at and packed as a JPEG by the worker, and the worker then writes the file with the
 * smaller pictures in place. One picture's pixels are held at a time. Nothing leaves the device.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { formatBytes, pdfOutputName, uniqueNames } from "./naming";
import { loadPdfjs, openPdf } from "./pdfjs";
import { GRAY_1BPP, RGB_24BPP, resolveImage, type DecodedImage, type Objs } from "./pdfjs-images";
import { USER_ERROR } from "./user-error";
import { runInWorker } from "./worker-client";

export type CompressSource = { name: string; source: Blob; password?: string; pageCount: number };
/** `quality`: JPEG quality, 1 to 100. `ppi`: the most pixels an inch a picture keeps at the size it is shown; null keeps every pixel. `gray`: pictures lose their colour. */
export type CompressOptions = { quality: number; ppi: number | null; gray: boolean };
type Picture = { ref: string; width: number; height: number; gray: boolean; bytes: number };
type Packed = { ref: string; width: number; height: number; gray: boolean; data: Blob; scale: number };
type Matrix = [number, number, number, number, number, number];
type OpList = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown[] | null> };

const MAX_PIXELS = 50_000_000;
/** Reading the pictures is most of the work when there are any. */
const DRAWN = 0.8;
/** Scaling a picture by less than this is not worth the softness it costs. */
const SCALE_FLOOR = 0.8;
/** A picture met again, shown this much larger than the first time, is packed again at the larger size. */
const LARGER = 1.15;
/** A JPEG holds at most this many pixels a side: a longer picture is left as it is. */
const JPEG_MAX_SIDE = 65535;
/** A new picture must be this much smaller than the old one to be kept (the worker checks again). */
const WORTH_IT = 0.9;
const aborted = () => new DOMException("Cancelled", "AbortError");
const times = (m: Matrix, n: Matrix): Matrix => [n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3], n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3], n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5]];
// pdf.js hands a matrix over as a plain array or a typed one.
const isMatrix = (v: unknown): v is Matrix => !!v && typeof v === "object" && (v as ArrayLike<unknown>).length === 6 && Array.prototype.every.call(v, (n: unknown) => typeof n === "number" && Number.isFinite(n));

/** pdf.js hands a reference over as "12R" (or "12R1"), or as its {num, gen}. */
function refOf(ref: unknown): string | null {
  if (typeof ref === "string") return /^\d+R\d*$/.test(ref) ? ref : null;
  const r = ref as { num?: unknown; gen?: unknown } | null;
  return r && typeof r.num === "number" ? `${r.num}R${typeof r.gen === "number" && r.gen ? r.gen : ""}` : null;
}

/**
 * How large each picture of a page is drawn, in points (1/72 inch): the longer the side, the more
 * pixels it needs. A picture drawn in a way this does not follow (inside a pattern, many times in
 * one go, or in an annotation, which a reader fits to its own box) gets no size, and is then never
 * scaled down.
 */
export function drawnSizes(ops: OpList, OPS: Record<string, number>): Map<string, { width: number; height: number } | null> {
  const sizes = new Map<string, { width: number; height: number } | null>();
  const note = (id: string, size: { width: number; height: number } | null) => {
    const had = sizes.get(id);
    if (had === null || (sizes.has(id) && size === null)) return void sizes.set(id, null);
    sizes.set(id, had && size ? { width: Math.max(had.width, size.width), height: Math.max(had.height, size.height) } : size);
  };
  const walk = (list: OpList, known: boolean) => {
    let m: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    let annotation = 0;
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i];
      const args = list.argsArray[i];
      if (fn === OPS.beginAnnotation) annotation++;
      else if (fn === OPS.endAnnotation) annotation = Math.max(0, annotation - 1);
      else if (fn === OPS.save || fn === OPS.beginGroup) stack.push(m);
      else if (fn === OPS.restore || fn === OPS.endGroup || fn === OPS.paintFormXObjectEnd) m = stack.pop() ?? m;
      else if (fn === OPS.transform && isMatrix(args)) m = times(m, args);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(m);
        if (isMatrix(args?.[0])) m = times(m, args[0]);
      } else if (fn === OPS.paintImageXObject && typeof args?.[0] === "string") note(args[0], known && !annotation ? { width: Math.hypot(m[0], m[1]), height: Math.hypot(m[2], m[3]) } : null);
      else if (fn === OPS.paintImageXObjectRepeat && typeof args?.[0] === "string") note(args[0], null);
      // A tiling pattern carries its own list of operators, drawn at a size this does not work out.
      else if ((fn === OPS.setFillColorN || fn === OPS.setStrokeColorN) && args?.[0] === "TilingPattern" && args[2] && typeof args[2] === "object") walk(args[2] as OpList, false);
    }
  };
  walk(ops, true);
  return sizes;
}

/** The share of its pixels a picture keeps each way: 1 keeps them all. */
export function scaleFor(picture: { width: number; height: number }, drawn: { width: number; height: number } | null, ppi: number | null): number {
  if (!ppi || !drawn || !(drawn.width > 0 && drawn.height > 0)) return 1;
  const scale = Math.max(((drawn.width / 72) * ppi) / picture.width, ((drawn.height / 72) * ppi) / picture.height);
  return scale >= SCALE_FLOOR ? 1 : Math.max(scale, 8 / Math.min(picture.width, picture.height));
}

/**
 * A decoded picture scaled to `toWidth` × `toHeight` (each new pixel the average of the ones it
 * covers), as one grey byte a pixel or three colour bytes. Where the picture has see-through parts,
 * a pixel counts for as much as it shows, so what is hidden under the mask never tints an edge.
 * Null when its pixels cannot be read here.
 */
export function scaledPixels(img: DecodedImage, toWidth: number, toHeight: number, gray: boolean): Uint8Array | null {
  const { width, height } = img;
  if (!img.data || img.kind === GRAY_1BPP || !(width > 0 && height > 0) || width * height > MAX_PIXELS) return null;
  const d = img.data;
  const step = img.kind === RGB_24BPP ? 3 : 4;
  const n = gray ? 1 : 3;
  const out = new Uint8Array(toWidth * toHeight * n);
  for (let y = 0, o = 0; y < toHeight; y++) {
    const y0 = Math.floor((y * height) / toHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / toHeight));
    for (let x = 0; x < toWidth; x++) {
      const x0 = Math.floor((x * width) / toWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / toWidth));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      if (step === 4) {
        for (let yy = y0; yy < y1; yy++) {
          for (let i = (yy * width + x0) * 4, end = (yy * width + x1) * 4; i < end; i += 4) {
            const a = d[i + 3];
            r += d[i] * a;
            g += d[i + 1] * a;
            b += d[i + 2] * a;
            count += a;
          }
        }
      }
      // Nothing shows here at all (or there is no mask): every pixel counts the same.
      if (count === 0) {
        r = g = b = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let i = (yy * width + x0) * step, end = (yy * width + x1) * step; i < end; i += step) {
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
          }
        }
        count = (y1 - y0) * (x1 - x0);
      }
      if (gray) out[o++] = Math.round((r * 77 + g * 150 + b * 29) / (256 * count));
      else {
        out[o++] = Math.round(r / count);
        out[o++] = Math.round(g / count);
        out[o++] = Math.round(b / count);
      }
    }
  }
  return out;
}

/** Decodes the pictures of one file that could be smaller and has each packed; one this device cannot read is left as it is. */
async function smallerPictures(src: CompressSource, want: Map<string, Picture>, opts: CompressOptions, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<Packed[]> {
  const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password, { plainImages: true });
  if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
  const { OPS } = await loadPdfjs();
  const { doc, task } = opened.pdf;
  const packed = new Map<string, Packed | null>();
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal.aborted) throw aborted();
      const page = await doc.getPage(n);
      try {
        const sizes = drawnSizes((await page.getOperatorList()) as unknown as OpList, OPS as unknown as Record<string, number>);
        for (const [id, drawn] of sizes) {
          const img = await resolveImage(page as unknown as { objs: Objs; commonObjs: Objs }, id, signal);
          const ref = img ? refOf(img.ref) : null;
          const stated = ref ? want.get(ref) : undefined;
          if (!img || !ref || !stated) continue;
          const scale = scaleFor(stated, drawn, opts.ppi);
          const had = packed.get(ref);
          // Seen before: packed again only when this page shows it clearly larger.
          if (had === null || (had && scale <= had.scale * LARGER)) continue;
          // Decoded smaller than the file says (a device limit): left as it is rather than saved with less detail.
          if (img.width < stated.width || img.height < stated.height) {
            packed.set(ref, null);
            continue;
          }
          const width = Math.max(1, Math.round(stated.width * scale));
          const height = Math.max(1, Math.round(stated.height * scale));
          const gray = opts.gray || stated.gray;
          const pixels = width > JPEG_MAX_SIDE || height > JPEG_MAX_SIDE ? null : scaledPixels(img, width, height, gray);
          if (!pixels) {
            packed.set(ref, null);
            continue;
          }
          const out = await runInWorker({ kind: "jpegEncode", pixels: new Blob([pixels as Uint8Array<ArrayBuffer>]), width, height, channels: gray ? 1 : 3, quality: opts.quality }, { signal });
          // Not smaller: the old picture stays, and a later page does not try again unless it shows it larger.
          packed.set(ref, { ref, width, height, gray, data: out.blob.size < stated.bytes * WORTH_IT ? out.blob : new Blob([]), scale });
        }
      } finally {
        page.cleanup();
      }
      onProgress(n / doc.numPages);
      // Let the pill paint and Cancel land between pages.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    void task.destroy();
  }
  return [...packed.values()].filter((p): p is Packed => !!p && p.data.size > 0);
}

/** "62% smaller", or "3% smaller"; never promises more than was saved. */
export const savedText = (before: number, after: number) => `${Math.max(1, Math.floor((1 - after / before) * 100))}% smaller`;

export async function compressPdfs(sources: readonly CompressSource[], opts: CompressOptions, zipName: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pageCount, 0) || 1;
  const names = uniqueNames(sources.map((s) => pdfOutputName(s.name)));
  const built: { name: string; blob: Blob; pageCount: number; before: number; unchanged: boolean }[] = [];
  let wasEncrypted = false;
  let done = 0;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const file = { name: src.name, source: src.source, password: src.password };
    const within = (f: number) => onProgress(((done + src.pageCount * f) / total) * 0.99);
    const found = (await runInWorker({ kind: "compressScan", file }, { signal })).pictures ?? [];
    let images: Packed[] = [];
    let drawn = 0;
    if (found.length) {
      drawn = DRAWN;
      images = await smallerPictures(src, new Map(found.map((f) => [f.ref, f])), opts, signal, (f) => within(0.05 + f * (DRAWN - 0.05)));
    }
    const out = await runInWorker({ kind: "compress", file: { ...file, images: images.map(({ ref, width, height, gray, data }) => ({ ref, width, height, gray, data })) } }, { signal, onProgress: (f) => within(drawn + f * (1 - drawn)) });
    wasEncrypted ||= out.wasEncrypted;
    built.push({ name: names[i], blob: out.blob, pageCount: out.pageCount ?? src.pageCount, before: src.source.size, unchanged: !!out.unchanged });
    done += src.pageCount;
  }
  if (signal.aborted) throw aborted();
  const before = built.reduce((n, b) => n + b.before, 0);
  const after = built.reduce((n, b) => n + b.blob.size, 0);
  const same = built.filter((b) => b.unchanged);
  // What was saved, said plainly; and plainly too when a file had nothing to give.
  const note = after < before ? `${formatBytes(before)} before, ${savedText(before, after)}.` : undefined;
  const warnings = same.length === 0 ? undefined : [built.length === 1 ? "This PDF is already as small as this tool can make it, so it comes back as it was." : same.length === 1 ? `${same[0].name} is already as small as this tool can make it.` : `${same.length === built.length ? "These PDFs" : `${same.length} of these PDFs`} are already as small as this tool can make them.`];
  const rest = { wasEncrypted, ...(note ? { note } : {}), ...(warnings ? { warnings } : {}) };
  onProgress(1);
  if (built.length === 1) return { name: built[0].name, type: "application/pdf", blob: built[0].blob, size: built[0].blob.size, pageCount: built[0].pageCount, ...rest };
  const { createZipWriter } = await import("./zip");
  const zip = createZipWriter();
  for (const b of built) zip.add(b.name, new Uint8Array(await b.blob.arrayBuffer()));
  const blob = zip.finish();
  return { name: zipName, type: "application/zip", blob, size: blob.size, entries: built.map((b) => ({ name: b.name, pageCount: b.pageCount, detail: b.unchanged ? `${formatBytes(b.before)}, as it was` : `${formatBytes(b.before)} → ${formatBytes(b.blob.size)}` })), ...rest };
}
