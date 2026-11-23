import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { finalRotation, normalizeRotation } from "./rotation";

export type RotateInput = {
  bytes: Uint8Array;
  /** Pending delta per page (any multiple of 90), indexed from 0. Missing = 0. */
  deltas: readonly number[];
  /** User password, if the file needed one. Empty-user-password files open with "". */
  password?: string;
};

export type RotateResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean };

/** Loads a PDF, decrypting it when needed (the output is saved unencrypted). */
export async function loadForEdit(bytes: Uint8Array, password?: string) {
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const wasEncrypted = probe.isEncrypted;
  if (!wasEncrypted) return { doc: probe, wasEncrypted };
  const doc = await PDFDocument.load(bytes, { password: password ?? "", updateMetadata: false });
  return { doc, wasEncrypted };
}

/**
 * Rotates pages by changing only their `/Rotate` entry:
 * (existing rotation + delta) mod 360. Nothing is rasterized and page order,
 * content, boxes and metadata are left as they are.
 */
export async function rotatePdf({ bytes, deltas, password }: RotateInput): Promise<RotateResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const delta = normalizeRotation(deltas[i] ?? 0);
    if (delta === 0) return;
    page.setRotation(degrees(finalRotation(page.getRotation().angle, delta)));
  });
  const out = await doc.save();
  return { bytes: out, pageCount: pages.length, wasEncrypted };
}
