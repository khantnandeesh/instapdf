/**
 * Metadata (spec F10): what a PDF says about itself (title, author, subject, keywords, the
 * program that made it, and any fields of the maker's own). Edit changes the fields; Remove all
 * leaves none, including the hidden XML copy and the dates.
 */
import { PDFDict, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream, type PDFDocument } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";

import { fieldNameError, NOT_FIELDS, STANDARD_FIELDS, type MetadataField } from "./metadata-options";
export { fieldNameError, FIELD_LIMITS, STANDARD_FIELDS, type MetadataField } from "./metadata-options";

const N = PDFName.of;

const text = (v: unknown): string | undefined => {
  if (!(v instanceof PDFString || v instanceof PDFHexString)) return undefined;
  try {
    return v.decodeText();
  } catch {
    return undefined;
  }
};

function infoOf(doc: PDFDocument): PDFDict | undefined {
  const ref = doc.context.trailerInfo.Info;
  const info = ref ? doc.context.lookup(ref) : undefined;
  return info instanceof PDFDict ? info : undefined;
}

/** The text fields a file has: the standard ones first (those present), then the maker's own, in file order. */
export function fieldsOf(doc: PDFDocument): MetadataField[] {
  const info = infoOf(doc);
  if (!info) return [];
  const all = new Map<string, string>();
  for (const [key, value] of info.entries()) {
    const name = key.decodeText();
    const v = text(value instanceof PDFString || value instanceof PDFHexString ? value : info.lookup(key));
    if (v !== undefined && !NOT_FIELDS.has(name)) all.set(name, v);
  }
  const standard = STANDARD_FIELDS.filter((k) => all.has(k)).map((name) => ({ name: name as string, value: all.get(name)! }));
  const own = [...all].filter(([name]) => !(STANDARD_FIELDS as readonly string[]).includes(name)).map(([name, value]) => ({ name, value }));
  return [...standard, ...own];
}

export async function readMetadata(bytes: Uint8Array, password?: string): Promise<MetadataField[]> {
  return fieldsOf((await loadForEdit(bytes, password)).doc);
}

export type MetadataInput = {
  bytes: Uint8Array;
  password?: string;
} & (
  | { mode: "remove" }
  | {
      mode: "update";
      /** Fields to write. A field with no value is left alone (list it in `remove` to take it out). */
      fields: readonly MetadataField[];
      /** Fields to take out. Every other field of the file stays as it is. */
      remove?: readonly string[];
    }
);

/** True when the XML copy of the details says the file follows PDF/A (an archive standard that requires that copy). */
function claimsPdfA(doc: PDFDocument): boolean {
  try {
    const xml = doc.catalog.lookup(N("Metadata"));
    if (!(xml instanceof PDFRawStream)) return false;
    return new TextDecoder("latin1").decode(decodePDFRawStream(xml).decode()).includes("pdfaid:");
  } catch {
    return false;
  }
}

/** Takes `key` out of every dictionary of the file; an entry that names an object of its own takes that object with it. */
function sweep(doc: PDFDocument, key: PDFName, deleteTarget: boolean) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFDict ? object : object instanceof PDFStream ? object.dict : undefined;
    const value = dict?.get(key);
    if (!dict || value === undefined) continue;
    if (deleteTarget && value instanceof PDFRef) doc.context.delete(value);
    dict.delete(key);
  }
}

export async function writeMetadata(input: MetadataInput, now = new Date()): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[] }> {
  const { doc, wasEncrypted } = await loadForEdit(input.bytes, input.password);
  const warnings = claimsPdfA(doc) ? ["This file was marked as PDF/A. That mark lives in the details that were removed, so the copy no longer claims the standard."] : [];
  // The XML copy of the same facts would contradict the new ones (some readers show it first), so it goes either way.
  const xml = doc.catalog.get(N("Metadata"));
  if (xml instanceof PDFRef) doc.context.delete(xml);
  doc.catalog.delete(N("Metadata"));
  if (input.mode === "remove") {
    const ref = doc.context.trailerInfo.Info;
    if (ref instanceof PDFRef) doc.context.delete(ref);
    const trailer = doc.context.trailerInfo as { Info?: unknown; ID?: unknown };
    delete trailer.Info;
    // The file's identifier is derived from its first details and dates: it goes too.
    delete trailer.ID;
    // Pages, pictures and fonts can carry XML details of their own, and programs leave private notes.
    sweep(doc, N("Metadata"), true);
    sweep(doc, N("PieceInfo"), false);
    sweep(doc, N("LastModified"), false);
  } else {
    let info = infoOf(doc);
    if (!info) {
      info = doc.context.obj({});
      doc.context.trailerInfo.Info = doc.context.register(info);
    }
    const found = new Map(info.keys().map((k) => [k.decodeText(), k] as [string, PDFName]));
    for (const name of input.remove ?? []) {
      const key = found.get(name.trim());
      if (key && !NOT_FIELDS.has(name.trim())) info.delete(key);
    }
    for (const f of input.fields) {
      const name = f.name.trim();
      const value = f.value.trim();
      if (!value || fieldNameError(name, []) !== null) continue;
      // Unchanged text is left as the file wrote it.
      const key = found.get(name) ?? N(name);
      if (text(info.lookup(key)) !== value) info.set(key, PDFHexString.fromText(value));
    }
    info.set(N("ModDate"), PDFString.fromDate(now));
  }
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted, ...(warnings.length ? { warnings } : {}) };
}
