/**
 * Metadata (spec F10): what a PDF says about itself (title, author, subject, keywords, the
 * program that made it, and any fields of the maker's own). Edit changes the fields; Remove all
 * leaves none, including the hidden XML copy and the dates.
 */
import { PDFDict, PDFHexString, PDFName, PDFRef, PDFString } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";

import { fieldNameError, FIELD_LIMITS, NOT_FIELDS, STANDARD_FIELDS, type MetadataField } from "./metadata-options";
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

function infoOf(doc: import("@cantoo/pdf-lib").PDFDocument): PDFDict | undefined {
  const ref = doc.context.trailerInfo.Info;
  const info = ref ? doc.context.lookup(ref) : undefined;
  return info instanceof PDFDict ? info : undefined;
}

/** The text fields a file has: the standard ones first (those present), then the maker's own, in file order. */
export function fieldsOf(doc: import("@cantoo/pdf-lib").PDFDocument): MetadataField[] {
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
} & ({ mode: "remove" } | { mode: "update"; /** The fields the file should have afterwards; a text field not listed here is removed, an empty value too. */ fields: readonly MetadataField[] });

export async function writeMetadata(input: MetadataInput, now = new Date()): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(input.bytes, input.password);
  // The XML copy of the same facts would contradict the new ones (some readers show it first), so it goes either way.
  const xml = doc.catalog.get(N("Metadata"));
  if (xml instanceof PDFRef) doc.context.delete(xml);
  doc.catalog.delete(N("Metadata"));
  if (input.mode === "remove") {
    const ref = doc.context.trailerInfo.Info;
    if (ref instanceof PDFRef) doc.context.delete(ref);
    delete (doc.context.trailerInfo as { Info?: unknown }).Info;
  } else {
    let info = infoOf(doc);
    if (!info) {
      info = doc.context.obj({});
      doc.context.trailerInfo.Info = doc.context.register(info);
    }
    for (const key of info.keys()) if (!NOT_FIELDS.has(key.decodeText()) && text(info.lookup(key)) !== undefined) info.delete(key);
    for (const f of input.fields) {
      const name = f.name.trim();
      const value = f.value.trim().slice(0, FIELD_LIMITS.value);
      if (!value || fieldNameError(name, []) !== null) continue;
      info.set(N(name), PDFHexString.fromText(value));
    }
    info.set(N("ModDate"), PDFString.fromDate(now));
  }
  return { bytes: await doc.save(), pageCount: doc.getPageCount(), wasEncrypted };
}
