/**
 * PDF to text (spec F12 §4): reads each page's text with pdf.js, in reading order, and writes one
 * UTF-8 .txt per document (a ZIP for several). Lines follow the page's own line ends; a wider
 * vertical gap becomes a blank line, and pages are separated by a blank line.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { derivedName, uniqueNames } from "./naming";
import { openPdf } from "./pdfjs";
import { USER_ERROR } from "./user-error";

/** The part of a pdf.js text item the layout needs. */
export type TextPiece = { str: string; hasEOL?: boolean; transform?: number[]; height?: number };

/** One page's pieces as plain text: line ends kept, a gap of more than 1.6 lines becomes a blank line. */
export function pageText(pieces: readonly TextPiece[]): string {
  let out = "";
  let lastY: number | null = null;
  let lastH = 0;
  for (const p of pieces) {
    const y = p.transform?.[5];
    const h = p.height || lastH;
    if (p.str.trim() && y !== undefined) {
      // A new block further down the page than a normal line step: a paragraph break.
      if (lastY !== null && out.endsWith("\n") && !out.endsWith("\n\n") && h > 0 && Math.abs(lastY - y) > 1.6 * Math.max(h, lastH)) out += "\n";
      lastY = y;
      lastH = h;
    }
    out += p.str;
    if (p.hasEOL) out += "\n";
  }
  // No trailing spaces on a line, at most one blank line in a row, none at the ends.
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

export type TextSource = { name: string; source: Blob; password?: string };

const PREVIEW_CHARS = 1500;
const aborted = () => new DOMException("Cancelled", "AbortError");

export async function pdfsToText(sources: readonly TextSource[], signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const outputs: { name: string; text: string; pages: number }[] = [];
  const empty: string[] = [];
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    if (signal.aborted) throw aborted();
    const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
    if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
    const { doc, task } = opened.pdf;
    try {
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        if (signal.aborted) throw aborted();
        const page = await doc.getPage(i);
        try {
          const content = await page.getTextContent();
          pages.push(pageText(content.items as TextPiece[]));
        } finally {
          page.cleanup();
        }
        onProgress((s + i / doc.numPages) / sources.length);
      }
      const text = pages.filter(Boolean).join("\n\n");
      if (text) outputs.push({ name: derivedName(src.name, ".txt"), text: `${text}\n`, pages: doc.numPages });
      else empty.push(src.name);
    } finally {
      void task.destroy();
    }
  }
  if (!outputs.length) {
    throw new Error(`${USER_ERROR}${sources.length === 1 ? "This PDF has" : "These PDFs have"} no text to copy out. Scanned pages are pictures of text and need OCR first.`);
  }
  const warnings = empty.map((name) => `${name} has no text (it may be a scan), so it was skipped.`);
  const words = outputs.reduce((n, o) => n + countWords(o.text), 0);
  const lead = words === 1 ? "1 word" : `${words.toLocaleString("en-US")} words`;
  const previewText = outputs[0].text.slice(0, PREVIEW_CHARS);
  const encoder = new TextEncoder();
  if (outputs.length === 1) {
    const o = outputs[0];
    const blob = new Blob([o.text], { type: "text/plain;charset=utf-8" });
    return { name: o.name, type: "text/plain", blob, size: blob.size, pageCount: o.pages, lead, previewText, copyText: o.text, wasEncrypted: false, warnings: warnings.length ? warnings : undefined };
  }
  const { createZipWriter } = await import("./zip");
  const zip = createZipWriter();
  const names = uniqueNames(outputs.map((o) => o.name));
  outputs.forEach((o, i) => zip.add(names[i], encoder.encode(o.text)));
  const blob = zip.finish();
  return {
    name: "berrypdf-text.zip",
    type: "application/zip",
    blob,
    size: blob.size,
    lead,
    entries: outputs.map((o, i) => ({ name: names[i], pageCount: o.pages, detail: `${countWords(o.text).toLocaleString("en-US")} words` })),
    previewText,
    wasEncrypted: false,
    warnings: warnings.length ? warnings : undefined,
  };
}
