/**
 * Compress (spec F6), the part that writes the file. What makes most PDFs heavy is their pictures:
 * each one is decoded in the tab, scaled to the size it is shown at and packed again as a JPEG, and
 * swapped in here when that is smaller. Everything else is left exactly as it is (text stays text,
 * drawings stay drawings, fonts are not touched) and the file is written by the compact writer,
 * which drops what nothing uses and stores each repeated object once.
 * Worker-only: this module pulls in the PDF library.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";
import { saveCompact } from "./write";

const N = (s: string) => PDFName.of(s);
/** A picture in the file that could be packed smaller. `bytes` is what it takes up now. */
export type Picture = { ref: string; width: number; height: number; gray: boolean; bytes: number };
/** A picture packed again: a JPEG of one channel (`gray`) or three. */
export type NewPicture = { ref: string; width: number; height: number; gray: boolean; data: Uint8Array };
export type CompressInput = { bytes: Uint8Array; password?: string; images: readonly NewPicture[] };
export type CompressResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; /** Pictures swapped for smaller ones. */ swapped: number; /** The result was no smaller, so the file is handed back as it came. */ unchanged: boolean };

/** Smaller than this, a picture is not worth the loss. */
export const MIN_PICTURE_BYTES = 3000;
/** A new picture has to be this much smaller than the old one to take its place. */
export const WORTH_IT = 0.9;

export const refKey = (ref: PDFRef) => `${ref.objectNumber}R${ref.generationNumber || ""}`;
const refOf = (key: string) => {
  const m = /^(\d+)R(\d*)$/.exec(key);
  return m ? PDFRef.of(Number(m[1]), m[2] ? Number(m[2]) : 0) : null;
};

/** Entries of the old picture that describe how its bytes were packed or coloured: the new one states its own. */
const REPLACED = new Set(["Filter", "DecodeParms", "Length", "ColorSpace", "BitsPerComponent", "Width", "Height", "Decode", "Alternates", "Metadata"]);

class Pictures {
  constructor(readonly doc: PDFDocument) {}
  look(o: PDFObject | undefined): PDFObject | undefined {
    return o instanceof PDFRef ? this.doc.context.lookup(o) : o;
  }
  name(o: PDFObject | undefined): string | undefined {
    const v = this.look(o);
    return v instanceof PDFName ? v.decodeText() : undefined;
  }
  num(o: PDFObject | undefined): number | undefined {
    const v = this.look(o);
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  }
  /**
   * 1 or 3 for a colour space whose pictures can be re-packed as plain grey or red-green-blue; null
   * for the rest (print colours, spot colours, Lab), which are left alone: turning those into screen
   * colours would change how the page prints.
   */
  channels(space: PDFObject | undefined, depth = 0): 1 | 3 | null {
    const v = this.look(space);
    if (v instanceof PDFName) {
      const n = v.decodeText();
      return n === "DeviceGray" || n === "CalGray" || n === "G" ? 1 : n === "DeviceRGB" || n === "CalRGB" || n === "RGB" ? 3 : null;
    }
    if (!(v instanceof PDFArray) || v.size() === 0 || depth > 2) return null;
    const kind = this.name(v.get(0));
    if (kind === "CalGray") return 1;
    if (kind === "CalRGB") return 3;
    if (kind === "ICCBased") {
      const profile = this.look(v.get(1));
      const n = profile instanceof PDFRawStream ? this.num(profile.dict.get(N("N"))) : undefined;
      return n === 1 ? 1 : n === 3 ? 3 : null;
    }
    // A palette's colours come out as red-green-blue whatever grey they may hold.
    if (kind === "Indexed" || kind === "I") return this.channels(v.get(1), depth + 1) ? 3 : null;
    return null;
  }
  /**
   * The colour space the new picture states. The decoder hands a profiled picture's own values over
   * unconverted, so the new picture keeps the profile (a palette's base, for a palette picture):
   * its colours then mean exactly what they meant. Anything else is plain grey or red-green-blue.
   */
  spaceFor(space: PDFObject | undefined, gray: boolean, depth = 0): PDFObject {
    const plain = N(gray ? "DeviceGray" : "DeviceRGB");
    const v = this.look(space);
    if (!(v instanceof PDFArray) || v.size() < 2 || depth > 2) return plain;
    const kind = this.name(v.get(0));
    if (kind === "Indexed" || kind === "I") return this.spaceFor(v.get(1), gray, depth + 1);
    if (kind !== "ICCBased") return plain;
    const profile = this.look(v.get(1));
    const n = profile instanceof PDFRawStream ? this.num(profile.dict.get(N("N"))) : undefined;
    // In the file as it stands when it is referenced (the usual case), so nothing is copied.
    return n === (gray ? 1 : 3) ? (space instanceof PDFRef ? space : v) : plain;
  }
  /** The pictures worth packing again, by reference. */
  list(): Picture[] {
    const found: Picture[] = [];
    // A picture that serves as another's mask keeps its exact values.
    const masks = new Set<PDFRef>();
    const all = this.doc.context.enumerateIndirectObjects();
    for (const [, o] of all) {
      if (!(o instanceof PDFRawStream)) continue;
      for (const key of ["SMask", "Mask"]) {
        const m = o.dict.get(N(key));
        if (m instanceof PDFRef) masks.add(m);
      }
    }
    for (const [ref, o] of all) {
      if (!(o instanceof PDFRawStream) || this.name(o.dict.get(N("Subtype"))) !== "Image" || masks.has(ref)) continue;
      const d = o.dict;
      const width = this.num(d.get(N("Width")));
      const height = this.num(d.get(N("Height")));
      if (!width || !height || o.contents.length < MIN_PICTURE_BYTES) continue;
      // A stencil, a picture with one bit a pixel (line art packs best as it is), one that carries its own
      // transparency, and one where a colour stands for "see through" are left alone.
      if (this.look(d.get(N("ImageMask")))?.toString() === "true") continue;
      const bits = this.num(d.get(N("BitsPerComponent")));
      if (bits !== undefined && bits !== 8) continue;
      if ((this.num(d.get(N("SMaskInData"))) ?? 0) > 0) continue;
      if (this.look(d.get(N("Mask"))) instanceof PDFArray) continue;
      // A JPEG 2000 picture without a stated colour space keeps its colours inside its own data: left alone.
      const channels = d.has(N("ColorSpace")) ? this.channels(d.get(N("ColorSpace"))) : null;
      if (!channels) continue;
      found.push({ ref: refKey(ref), width, height, gray: channels === 1, bytes: o.contents.length });
    }
    return found;
  }
  /** Puts each new picture in the old one's place when it is enough smaller; returns how many went in. */
  swap(images: readonly NewPicture[]): number {
    const ok = new Map(this.list().map((p) => [p.ref, p]));
    let swapped = 0;
    for (const img of images) {
      const ref = refOf(img.ref);
      const old = ref && this.doc.context.lookup(ref);
      const was = ok.get(img.ref);
      if (!ref || !was || !(old instanceof PDFRawStream) || img.data.length >= was.bytes * WORTH_IT) continue;
      if (!(img.width > 0 && img.height > 0) || img.width > was.width || img.height > was.height) continue;
      const entries: Record<string, unknown> = {};
      for (const [k, v] of old.dict.entries()) if (!REPLACED.has(k.decodeText())) entries[k.decodeText()] = v;
      Object.assign(entries, { Width: img.width, Height: img.height, BitsPerComponent: 8, ColorSpace: this.spaceFor(old.dict.get(N("ColorSpace")), img.gray), Filter: N("DCTDecode") });
      const next = PDFRawStream.of(this.doc.context.obj(entries as never) as unknown as PDFDict, img.data);
      this.doc.context.assign(ref, next);
      // The pixels arrive with a mask's matte colour already taken out, so the mask must not ask for that
      // again. The mask may serve other pictures: this one gets its own copy without it.
      const mask = this.look(old.dict.get(N("SMask")));
      if (mask instanceof PDFRawStream && mask.dict.has(N("Matte"))) {
        const plain = new Map(mask.dict.entries());
        plain.delete(N("Matte"));
        next.dict.set(N("SMask"), this.doc.context.register(PDFRawStream.of(PDFDict.fromMapWithContext(plain, this.doc.context), mask.contents)));
      }
      swapped++;
    }
    return swapped;
  }
}

/** The pictures of a file that could be packed smaller, for the caller to decode and pack. */
export async function compressiblePictures({ bytes, password }: { bytes: Uint8Array; password?: string }): Promise<{ pictures: Picture[]; pageCount: number }> {
  const { doc } = await loadForEdit(bytes, password);
  return { pictures: new Pictures(doc).list(), pageCount: doc.getPageCount() };
}

export async function compressPdf({ bytes, password, images }: CompressInput, onProgress?: (fraction: number) => void): Promise<CompressResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  onProgress?.(0.2);
  const swapped = new Pictures(doc).swap(images);
  // Small pictures of each page that old programs kept for their page list: every reader draws its own.
  for (const page of doc.getPages()) page.node.delete(N("Thumb"));
  onProgress?.(0.5);
  const out = await saveCompact(doc);
  onProgress?.(1);
  // A locked file is always written afresh (unlocked, like every tool here); any other is never handed back larger.
  const unchanged = !wasEncrypted && out.length >= bytes.length;
  return { bytes: unchanged ? bytes : out, pageCount: doc.getPageCount(), wasEncrypted, swapped: unchanged ? 0 : swapped, unchanged };
}
