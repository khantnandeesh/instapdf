"use client";
/**
 * Document properties a merge cannot keep (PR #7 expert review): read with
 * pdf.js at intake so the user is told before running. Loaded lazily.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfInspector } from "@/components/tool-flow/ToolFlow";

/** Catalog keys found in a file's raw bytes (keys inside compressed object streams are not seen). */
export type PdfMarkers = { signed: boolean; outputIntents: boolean; structTree: boolean };

/** True when `needle` (ASCII) occurs in `bytes`. */
export function hasBytes(bytes: Uint8Array, needle: string): boolean {
  const first = needle.charCodeAt(0);
  outer: for (let i = bytes.indexOf(first); i !== -1 && i <= bytes.length - needle.length; i = bytes.indexOf(first, i + 1)) {
    for (let k = 1; k < needle.length; k++) if (bytes[i + k] !== needle.charCodeAt(k)) continue outer;
    return true;
  }
  return false;
}

export function scanMarkers(bytes: Uint8Array): PdfMarkers {
  return {
    signed: hasBytes(bytes, "/ByteRange") || hasBytes(bytes, "/SigFlags"),
    outputIntents: hasBytes(bytes, "/OutputIntents"),
    structTree: hasBytes(bytes, "/StructTreeRoot"),
  };
}

export type LostProperty = "tags" | "pdfa" | "layers" | "attachments" | "signatures";

const words: Record<LostProperty, string> = {
  tags: "accessibility tags",
  pdfa: "PDF/A conformance",
  layers: "layers",
  attachments: "attached files",
  signatures: "digital signatures",
};

export async function lostProperties(doc: PDFDocumentProxy, markers: PdfMarkers): Promise<LostProperty[]> {
  const out: LostProperty[] = [];
  const [mark, meta, attachments, layers] = await Promise.all([
    doc.getMarkInfo().catch(() => null),
    doc.getMetadata().catch(() => null),
    doc.getAttachments().catch(() => null),
    doc.getOptionalContentConfig().catch(() => null),
  ]);
  if (mark?.Marked || markers.structTree) out.push("tags");
  const xmp = (meta?.metadata as { getRaw?: () => string } | null | undefined)?.getRaw?.() ?? "";
  if (/pdfaid:part/i.test(xmp) || markers.outputIntents) out.push("pdfa");
  const groups = layers ? Array.from(layers as unknown as Iterable<unknown>) : [];
  if (groups.length) out.push("layers");
  // pdf.js returns a Map in v6 and a plain object in older versions.
  const attached = attachments instanceof Map ? attachments.size : attachments ? Object.keys(attachments).length : 0;
  if (attached) out.push("attachments");
  if (markers.signed) out.push("signatures");
  return out;
}

/** "alpha.pdf has accessibility tags and layers, which the merged file won't keep." or null. */
export async function lostPropertiesNotice(name: string, doc: PDFDocumentProxy, markers: PdfMarkers): Promise<string | null> {
  const lost = (await lostProperties(doc, markers)).map((p) => words[p]);
  if (!lost.length) return null;
  const list = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(", ")} and ${lost[lost.length - 1]}`;
  return `${name} has ${list}, which the merged file won't keep.`;
}

export const inspector: PdfInspector = {
  scan: scanMarkers,
  notice: (name, doc, scanned) => lostPropertiesNotice(name, doc, (scanned as PdfMarkers | undefined) ?? { signed: false, outputIntents: false, structTree: false }),
};
