import { PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, degrees } from "@cantoo/pdf-lib";
import { finalRotation, normalizeRotation } from "./rotation";

export type RotateInput = {
  bytes: Uint8Array;
  /** Pending delta per page (any multiple of 90), indexed from 0. Missing = 0. */
  deltas: readonly number[];
  /** User password, if the file needed one. Empty-user-password files open with "". */
  password?: string;
};

/** Fraction of one file's work done (0..1). Saving is the last stage and reports nothing itself. */
export type StageProgress = (fraction: number) => void;

/** Share of a file's work reached after loading it, and after setting every page's rotation. */
export const STAGE_LOADED = 0.4;
export const STAGE_PAGES = 0.6;

export type RotateResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean };

/** Loads a PDF, decrypting it when needed (the output is saved unencrypted). */
export async function loadForEdit(bytes: Uint8Array, password?: string) {
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const wasEncrypted = probe.isEncrypted;
  if (!wasEncrypted) return { doc: probe, wasEncrypted };
  const doc = await PDFDocument.load(bytes, { password: password ?? "", updateMetadata: false });
  dropOldSecurity(doc);
  return { doc, wasEncrypted };
}

/**
 * The library decrypts a file on load but keeps two leftovers as ordinary objects: the old encryption
 * dictionary (with the password check values) and the old cross-reference stream's dictionary, which
 * still points at it. Saved as they are, they leave the old password open to guessing offline and make
 * some readers (this library among them) take the new file for an encrypted one. Both go.
 */
export function dropOldSecurity(doc: PDFDocument) {
  const has = (dict: PDFDict, ...keys: string[]) => keys.every((k) => dict.has(PDFName.of(k)));
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFDict ? object : object instanceof PDFStream ? object.dict : undefined;
    if (!dict) continue;
    const oldTrailer = has(dict, "Root", "Size", "Encrypt");
    const oldEncrypt = has(dict, "Filter", "O", "U", "P") && dict.get(PDFName.of("Filter")) === PDFName.of("Standard");
    // The old trailer is also where the document information (title, author) hangs: keep that link.
    const info = oldTrailer ? dict.get(PDFName.of("Info")) : undefined;
    if (info instanceof PDFRef && !doc.context.trailerInfo.Info) doc.context.trailerInfo.Info = info;
    if (oldTrailer || oldEncrypt) doc.context.delete(ref);
  }
}

/**
 * Rotates pages by changing only their `/Rotate` entry:
 * (existing rotation + delta) mod 360. Nothing is rasterized and page order,
 * content, boxes and metadata are left as they are.
 */
export async function rotatePdf({ bytes, deltas, password }: RotateInput, onProgress?: StageProgress): Promise<RotateResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  onProgress?.(STAGE_LOADED);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const delta = normalizeRotation(deltas[i] ?? 0);
    if (delta !== 0) page.setRotation(degrees(finalRotation(page.getRotation().angle, delta)));
    onProgress?.(STAGE_LOADED + ((STAGE_PAGES - STAGE_LOADED) * (i + 1)) / pages.length);
  });
  const out = await doc.save();
  return { bytes: out, pageCount: pages.length, wasEncrypted };
}
