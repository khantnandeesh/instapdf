/**
 * Grayscale (spec F13 §1), the part that runs in the tab. The processing worker rewrites the file
 * (grayscale.ts); pictures need a decoder for every packing a PDF can hold, and pdf.js is that
 * decoder. So for each file: the worker says which pictures hold colour, pdf.js decodes each one
 * here as the pages are read, the worker packs the grey pixels, and the worker then writes the file
 * with the grey pictures in place. One picture's pixels are held at a time.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { pdfOutputName, uniqueNames } from "./naming";
import { packBuilt, type BuiltPdf } from "./pack-built";
import { loadPdfjs, openPdf } from "./pdfjs";
import { GRAY_1BPP, RGB_24BPP, resolveImage, type DecodedImage, type Objs } from "./pdfjs-images";
import { USER_ERROR } from "./user-error";
import { runInWorker } from "./worker-client";

export type GraySource = { name: string; source: Blob; password?: string; pageCount: number };
/** Everything, or only the text and drawings, or only the pictures. */
export type GrayWhat = "all" | "vector" | "pictures";
type Packed = { ref: string; width: number; height: number; jpeg: boolean; data: Blob };

const MAX_PIXELS = 50_000_000;
/** Rows are read back in bands: some engines cap one canvas near 16.7 megapixels. */
const BAND_PIXELS = 4_000_000;
/** Reading the pictures is most of the work when there are any. */
const DRAWN = 0.7;
const aborted = () => new DOMException("Cancelled", "AbortError");
const lum = (r: number, g: number, b: number) => (r * 77 + g * 150 + b * 29 + 128) >> 8;

/** pdf.js hands a reference over as "12R" (or "12R1"), or as its {num, gen}. */
function refOf(ref: unknown): string | null {
  if (typeof ref === "string") return /^\d+R\d*$/.test(ref) ? ref : null;
  const r = ref as { num?: unknown; gen?: unknown } | null;
  return r && typeof r.num === "number" ? `${r.num}R${typeof r.gen === "number" && r.gen ? r.gen : ""}` : null;
}

/** A decoded picture as one grey byte a pixel; null when it is too large for this device. */
export function grayPixels(img: DecodedImage): Uint8Array | null {
  const { width, height } = img;
  if (!(width > 0 && height > 0) || width * height > MAX_PIXELS) return null;
  const out = new Uint8Array(width * height);
  if (img.data) {
    const d = img.data;
    if (img.kind === GRAY_1BPP) {
      const stride = (width + 7) >> 3;
      for (let y = 0, o = 0; y < height; y++) for (let x = 0; x < width; x++) out[o++] = d[y * stride + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
    } else {
      const step = img.kind === RGB_24BPP ? 3 : 4;
      for (let i = 0, o = 0; o < out.length; i += step) out[o++] = lum(d[i], d[i + 1], d[i + 2]);
    }
    return out;
  }
  if (!img.bitmap) return null;
  const rows = Math.max(1, Math.min(height, Math.floor(BAND_PIXELS / width)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = rows;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    for (let y = 0, o = 0; y < height; y += rows) {
      const h = Math.min(rows, height - y);
      ctx.clearRect(0, 0, width, rows);
      ctx.drawImage(img.bitmap, 0, y, width, h, 0, 0, width, h);
      const d = ctx.getImageData(0, 0, width, h).data;
      for (let i = 0; i < d.length; i += 4) out[o++] = lum(d[i], d[i + 1], d[i + 2]);
    }
    return out;
  } catch {
    return null;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

type OpList = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown[] | null> };

/** Decodes the wanted pictures of one file and has each packed; a picture this device cannot read is left out (the worker says so in its result). */
async function greyPictures(src: GraySource, want: Map<string, boolean>, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<Packed[]> {
  const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
  if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
  const { OPS } = await loadPdfjs();
  const { doc, task } = opened.pdf;
  const images: Packed[] = [];
  const tried = new Set<string>();
  try {
    for (let n = 1; n <= doc.numPages && tried.size < want.size; n++) {
      if (signal.aborted) throw aborted();
      const page = await doc.getPage(n);
      try {
        const ids = new Set<string>();
        const collect = (ops: OpList) => {
          for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];
            if ((fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) && typeof args?.[0] === "string") ids.add(args[0]);
            // A tiling pattern carries its own list of operators.
            else if ((fn === OPS.setFillColorN || fn === OPS.setStrokeColorN) && args?.[0] === "TilingPattern" && args[2] && typeof args[2] === "object") collect(args[2] as OpList);
          }
        };
        collect((await page.getOperatorList()) as unknown as OpList);
        for (const id of ids) {
          const img = await resolveImage(page as unknown as { objs: Objs; commonObjs: Objs }, id, signal);
          const ref = img ? refOf(img.ref) : null;
          if (!img || !ref || !want.has(ref) || tried.has(ref)) continue;
          tried.add(ref);
          const grey = grayPixels(img);
          if (!grey) continue;
          const lossy = want.get(ref) === true;
          const packed = await runInWorker({ kind: "grayEncode", pixels: new Blob([grey as Uint8Array<ArrayBuffer>]), width: img.width, height: img.height, lossy }, { signal });
          images.push({ ref, width: img.width, height: img.height, jpeg: lossy, data: packed.blob });
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
  return images;
}

export async function toGrayscale(sources: readonly GraySource[], what: GrayWhat, zipName: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pageCount, 0) || 1;
  const names = uniqueNames(sources.map((s) => pdfOutputName(s.name)));
  const built: BuiltPdf[] = [];
  const notes = new Set<string>();
  let wasEncrypted = false;
  let done = 0;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const file = { name: src.name, source: src.source, password: src.password };
    const within = (f: number) => onProgress(((done + src.pageCount * f) / total) * 0.99);
    let images: Packed[] | undefined;
    let drawn = 0;
    if (what !== "vector") {
      const found = (await runInWorker({ kind: "grayScan", file }, { signal })).found ?? [];
      images = [];
      if (found.length) {
        drawn = DRAWN;
        images = await greyPictures(src, new Map(found.map((f) => [f.ref, f.lossy])), signal, (f) => within(0.05 + f * (DRAWN - 0.05)));
      }
    }
    const out = await runInWorker({ kind: "grayscale", zipName: "", vector: what !== "pictures", files: [{ ...file, images }] }, { signal, onProgress: (f) => within(drawn + f * (1 - drawn)) });
    wasEncrypted ||= out.wasEncrypted;
    out.warnings?.forEach((w) => notes.add(w));
    built.push({ name: names[i], blob: out.blob, pageCount: out.pageCount ?? src.pageCount });
    done += src.pageCount;
  }
  const out = await packBuilt(built, zipName, signal, { wasEncrypted, warnings: notes.size ? [...notes] : undefined });
  onProgress(1);
  return out;
}
