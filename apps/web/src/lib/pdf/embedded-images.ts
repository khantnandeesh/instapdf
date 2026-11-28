/**
 * Extract images (spec F12 §5): the pictures embedded in the picked pages, each saved once.
 *
 * A JPEG that the PDF stores as a plain JPEG is saved byte for byte (no second compression, the
 * original quality). Everything else (Flate, CCITT, JBIG2, JPEG 2000, images with a soft mask or a
 * CMYK JPEG, which browsers and viewers show with wrong colours) is decoded by pdf.js and saved as a
 * lossless PNG, with its transparency.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFDocument } from "@cantoo/pdf-lib";
import type { ToolOutput } from "@/components/tool-flow/types";
import { derivedName, embeddedImageName, uniqueNames } from "./naming";
import { openPdf } from "./pdfjs";
import { resolveImage, toRgba, type DecodedImage, type Objs } from "./pdfjs-images";

export { toRgba, type DecodedImage } from "./pdfjs-images";
import { USER_ERROR } from "./user-error";

export type ImageSource = { name: string; source: Blob; password?: string; pageCount: number; pages: number[] };

/** Smaller than this on a side is a rule, a dot or a mask, not a picture. */
export const MIN_IMAGE_SIDE = 2;
const MAX_PIXELS = 50_000_000;

/** pdf.js writes an object reference as "12R" or, with a generation, "12R1". */
export function parseRef(ref: unknown): PDFRef | null {
  const m = typeof ref === "string" ? /^(\d+)R(\d*)$/.exec(ref) : null;
  return m ? PDFRef.of(Number(m[1]), m[2] ? Number(m[2]) : 0) : null;
}

const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : null);

/** 1 (grey) or 3 (RGB) for the colour spaces a JPEG can be handed out in as it is; null for the rest (CMYK, Indexed, Lab). */
function plainComponents(doc: PDFDocument, dict: PDFDict): 1 | 3 | null {
  const cs = dict.lookup(PDFName.of("ColorSpace"));
  const name = nameOf(cs);
  if (name === "DeviceRGB" || name === "CalRGB") return 3;
  if (name === "DeviceGray" || name === "CalGray") return 1;
  if (cs instanceof PDFArray && cs.size() >= 2) {
    const family = nameOf(cs.lookup(0));
    if (family === "CalRGB") return 3;
    if (family === "CalGray") return 1;
    if (family === "ICCBased") {
      const profile = cs.lookup(1);
      const n = profile instanceof PDFRawStream ? profile.dict.lookup(PDFName.of("N")) : null;
      const count = n instanceof PDFNumber ? n.asNumber() : 0;
      return count === 1 || count === 3 ? count : null;
    }
  }
  return null;
}

/**
 * The image's own JPEG file, when the PDF holds one that every viewer shows the way the PDF does:
 * one DCTDecode filter, grey or RGB, no mask, no soft mask and no /Decode remap. Null otherwise.
 */
export function jpegPassthrough(doc: PDFDocument, ref: PDFRef): Uint8Array | null {
  const stream = doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return null;
  const d = stream.dict;
  if (nameOf(d.lookup(PDFName.of("Subtype"))) !== "Image") return null;
  const filter = d.lookup(PDFName.of("Filter"));
  const filters = filter instanceof PDFArray ? filter.asArray().map((f) => nameOf(f instanceof PDFRef ? doc.context.lookup(f) : f)) : [nameOf(filter)];
  if (filters.length !== 1 || (filters[0] !== "DCTDecode" && filters[0] !== "DCT")) return null;
  for (const key of ["SMask", "Mask", "Decode", "ImageMask"]) if (d.has(PDFName.of(key))) return null;
  if (!plainComponents(doc, d)) return null;
  const bytes = stream.contents;
  // A JPEG starts with SOI then a marker; anything else is damaged or not what the dictionary says.
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? bytes : null;
}

const aborted = () => new DOMException("Cancelled", "AbortError");
const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));

async function pngOf(img: DecodedImage): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
    else if (img.data) ctx.putImageData(new ImageData(toRgba({ ...img, data: img.data }), img.width, img.height), 0, 0);
    else return null;
    return await toBlob(canvas, "image/png");
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export async function extractImages(sources: readonly ImageSource[], signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pages.length, 0);
  if (!total) throw new Error(`${USER_ERROR}Pick at least one page.`);
  const { loadPdfjs } = await import("./pdfjs");
  const { OPS } = await loadPdfjs();
  const outputs: { name: string; blob: Blob; detail: string }[] = [];
  let skipped = 0;
  let done = 0;

  for (const src of sources) {
    if (!src.pages.length) continue;
    if (signal.aborted) throw aborted();
    const bytes = new Uint8Array(await src.source.arrayBuffer());
    // pdf.js takes its copy; pdf-lib reads the original JPEG streams from this one.
    const opened = await openPdf(bytes.slice(), src.password);
    if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
    const { doc, task } = opened.pdf;
    let raw: PDFDocument | null | undefined;
    const rawDoc = async () => {
      if (raw === undefined) {
        const { loadForEdit } = await import("./rotate");
        raw = await loadForEdit(bytes, src.password).then(
          (r) => r.doc,
          () => null,
        );
      }
      return raw;
    };
    const seen = new Set<string>();
    try {
      for (const index of src.pages) {
        if (signal.aborted) throw aborted();
        const page = await doc.getPage(index + 1);
        try {
          const ops = await page.getOperatorList();
          let n = 0;
          for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const arg = ops.argsArray[i]?.[0] as unknown;
            let img: DecodedImage | null = null;
            if ((fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) && typeof arg === "string") {
              if (seen.has(arg)) continue;
              seen.add(arg);
              img = await resolveImage(page as unknown as { objs: Objs; commonObjs: Objs }, arg, signal);
            } else if (fn === OPS.paintInlineImageXObject && arg && typeof arg === "object") img = arg as DecodedImage;
            if (!img || !(img.width >= MIN_IMAGE_SIDE && img.height >= MIN_IMAGE_SIDE)) continue;
            const ref = parseRef(img.ref);
            if (ref) {
              const key = `ref:${ref.tag}`;
              if (seen.has(key)) continue;
              seen.add(key);
            }
            const detail = `${img.width} × ${img.height} px`;
            const jpeg = ref ? await rawDoc().then((d) => (d ? jpegPassthrough(d, ref) : null)) : null;
            if (jpeg) outputs.push({ name: embeddedImageName(src.name, index + 1, ++n, "jpg"), blob: new Blob([jpeg.slice()], { type: "image/jpeg" }), detail });
            else {
              const png = img.width * img.height <= MAX_PIXELS ? await pngOf(img) : null;
              if (png) outputs.push({ name: embeddedImageName(src.name, index + 1, ++n, "png"), blob: png, detail });
              else skipped++;
            }
          }
        } finally {
          page.cleanup();
        }
        onProgress(++done / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      void task.destroy();
    }
  }

  if (!outputs.length) {
    throw new Error(`${USER_ERROR}${skipped ? "The images on these pages are too large to save on this device." : "No images were found on these pages. Text and drawings are not images; PDF to image saves whole pages as pictures."}`);
  }
  const warnings = skipped ? [skipped === 1 ? "1 image was too large to save and was left out." : `${skipped} images were too large to save and were left out.`] : undefined;
  const unit = (n: number) => (n === 1 ? "1 image" : `${n} images`);
  const preview = outputs[0].blob;
  if (outputs.length === 1) {
    const o = outputs[0];
    return { name: o.name, type: o.blob.type as "image/jpeg" | "image/png", blob: o.blob, size: o.blob.size, pageCount: 1, lead: `1 image, ${o.detail}`, preview, wasEncrypted: false, warnings };
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
    pageCount: outputs.length,
    lead: unit(outputs.length),
    entries: outputs.map((o, i) => ({ name: names[i], pageCount: 1, detail: o.detail })),
    preview,
    wasEncrypted: false,
    warnings,
  };
}
