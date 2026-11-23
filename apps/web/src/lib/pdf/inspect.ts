"use client";
/**
 * Document properties a merge cannot keep (PR #7 expert review): read with
 * pdf.js at intake so the user is told before running. Loaded lazily.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfInspector } from "@/components/tool-flow/ToolFlow";

import type { PdfMarkers } from "./scan";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (m: PdfMarkers) => void>();
const NONE: PdfMarkers = { signed: false, outputIntents: false, structTree: false };

/** Scans the file in the scan worker (one pass, chunked); never on the main thread. */
export function scanInWorker(blob: Blob): Promise<PdfMarkers> {
  if (typeof Worker === "undefined") return Promise.resolve(NONE);
  if (!worker) {
    worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module", name: "instapdf-scan" });
    worker.onmessage = (e: MessageEvent<{ id: number; markers: PdfMarkers }>) => {
      pending.get(e.data.id)?.(e.data.markers);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      for (const done of pending.values()) done(NONE);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ id, blob });
  });
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
  scan: scanInWorker,
  notice: (name, doc, scanned) => lostPropertiesNotice(name, doc, (scanned as PdfMarkers | undefined) ?? { signed: false, outputIntents: false, structTree: false }),
};
