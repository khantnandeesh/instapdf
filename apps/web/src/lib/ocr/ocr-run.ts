/**
 * OCR (spec F15 §2), the part that runs in the tab. Each page that needs it is drawn with pdf.js
 * and read by the recogniser (Tesseract compiled to WebAssembly, in its own workers, all served
 * from this site). What comes back is the page's text and a text-only page that places every word
 * where it is in the picture; the processing worker lays those over the original pages
 * (ocr-layer.ts). A page that already has real text is left as it is. Nothing is uploaded.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { derivedName, pdfOutputName, uniqueNames } from "@/lib/pdf/naming";
import { canvasBlob, drawPage } from "@/lib/pdf/page-images";
import { countWords, pageText, type TextPiece } from "@/lib/pdf/page-text";
import { openPdf } from "@/lib/pdf/pdfjs";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runInWorker } from "@/lib/pdf/worker-client";
import { OCR_PATHS } from "./languages";

export type OcrSource = { name: string; source: Blob; password?: string; pageCount: number };
export type OcrOutput = "pdf" | "text" | "both";
export type OcrOptions = { languages: readonly string[]; output: OcrOutput; /** Pages that already hold text are not read again. */ skipText: boolean };

/** What a scanner makes of a printed page: enough for small print, and what the recogniser was trained on. */
const DPI = 300;
/** A page with this many letters and digits already has its text; fewer is a page number or a stamp on a scan. */
export const HAS_TEXT = 12;
/** Starting the recogniser (its code and the language, fetched once and then kept by the browser) is the first part of the bar. */
const READY = 0.04;
/** Reading the pages is nearly all of the work; writing the files is the rest. */
const READ = 0.94;
const PREVIEW_CHARS = 1500;
const aborted = () => new DOMException("Cancelled", "AbortError");

export const hasText = (text: string) => (text.match(/[\p{L}\p{N}]/gu) ?? []).length >= HAS_TEXT;

type Reader = { recognize: (image: Blob, options: object, output: object) => Promise<{ data: { text: string; pdf: number[] | null } }>; setParameters: (p: Record<string, string>) => Promise<unknown>; terminate: () => Promise<unknown> };
type Read = { text: string; pdf: Uint8Array | null };

/** How many pages are read at once: each recogniser holds its language in memory, so a few at most. */
function readers(pages: number): number {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(3, Math.floor(cores / 2), pages));
}

async function startReaders(count: number, languages: readonly string[]): Promise<Reader[]> {
  const { createWorker } = await import("tesseract.js");
  const made: Reader[] = [];
  try {
    // The first one fetches the language; the others then find it in the browser's cache.
    for (let i = 0; i < count; i++) {
      const worker = (await createWorker([...languages], 1, { workerPath: OCR_PATHS.worker, corePath: OCR_PATHS.core, langPath: OCR_PATHS.data, workerBlobURL: false, gzip: true })) as unknown as Reader;
      made.push(worker);
      await worker.setParameters({ user_defined_dpi: String(DPI) });
    }
  } catch (e) {
    await Promise.allSettled(made.map((w) => w.terminate()));
    throw new Error(`${USER_ERROR}The text recogniser could not start. Check your connection and try again.`, { cause: e });
  }
  return made;
}

type Page = { text: string; layer: Blob | null; read: boolean };

/** Reads one file: the text of every page, and a text layer for each page that was recognised. */
async function readFile(src: OcrSource, opts: OcrOptions, pool: Reader[], signal: AbortSignal, onPage: () => void): Promise<Page[]> {
  const opened = await openPdf(new Uint8Array(await src.source.arrayBuffer()), src.password);
  if (!opened.ok) throw new Error(`${USER_ERROR}${src.name} could not be read.`);
  const { doc, task } = opened.pdf;
  const pages: Page[] = [];
  const free = [...pool];
  const waiting: ((r: Reader) => void)[] = [];
  const take = () => new Promise<Reader>((done) => (free.length ? done(free.pop()!) : waiting.push(done)));
  const give = (r: Reader) => (waiting.length ? waiting.shift()!(r) : free.push(r));
  const running: Promise<void>[] = [];
  let failed: unknown;
  try {
    for (let n = 1; n <= doc.numPages && !failed; n++) {
      if (signal.aborted) throw aborted();
      const page = await doc.getPage(n);
      let picture: Blob | undefined;
      let canvas: HTMLCanvasElement | undefined;
      try {
        const own = pageText((await page.getTextContent()).items as TextPiece[]);
        if (opts.skipText && hasText(own)) {
          pages[n - 1] = { text: own, layer: null, read: false };
          onPage();
          continue;
        }
        const drawn = await drawPage(page as never, DPI, signal, (c) => canvasBlob(c, "image/png"), `Page ${n} of ${src.name}`);
        canvas = drawn.canvas;
        picture = drawn.blob;
      } finally {
        if (canvas) canvas.width = canvas.height = 0;
        page.cleanup();
      }
      // Waits here while every recogniser is busy, so only that many pictures are held at once.
      const reader = await take();
      if (signal.aborted) throw aborted();
      const image = picture;
      running.push(
        reader
          // A text-only page: the words, invisible, with no copy of the picture.
          .recognize(image, { pdfTextOnly: true }, { text: true, pdf: opts.output !== "text" })
          .then(({ data }) => {
            const found: Read = { text: data.text.trim(), pdf: data.pdf ? Uint8Array.from(data.pdf) : null };
            pages[n - 1] = { text: found.text, layer: found.pdf && found.text ? new Blob([found.pdf as Uint8Array<ArrayBuffer>]) : null, read: true };
            onPage();
          })
          .catch((e) => {
            failed ??= e;
          })
          .finally(() => give(reader)),
      );
    }
    await Promise.all(running);
    if (signal.aborted) throw aborted();
    if (failed) throw new Error(`${USER_ERROR}${src.name} could not be read by the text recogniser.`, { cause: failed });
  } finally {
    void task.destroy();
  }
  return pages;
}

const wordsLead = (words: number) => (words === 1 ? "1 word" : `${words.toLocaleString("en-US")} words`);

export async function ocrPdfs(sources: readonly OcrSource[], opts: OcrOptions, zipName: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const total = sources.reduce((n, s) => n + s.pageCount, 0) || 1;
  const pool = await startReaders(readers(total), opts.languages);
  // Cancel stops the recognisers at once, mid-page.
  const stop = () => void Promise.allSettled(pool.map((w) => w.terminate()));
  signal.addEventListener("abort", stop, { once: true });
  const pdfNames = uniqueNames(sources.map((s) => pdfOutputName(s.name)));
  const textNames = uniqueNames(sources.map((s) => derivedName(s.name, ".txt")));
  const files: { name: string; bytes: Uint8Array; pageCount: number; detail?: string }[] = [];
  const encoder = new TextEncoder();
  let done = 0;
  let recognised = 0;
  let kept = 0;
  let wasEncrypted = false;
  let allText = "";
  let firstPdf: Blob | undefined;
  try {
    if (signal.aborted) throw aborted();
    onProgress(READY);
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const pages = await readFile(src, opts, pool, signal, () => onProgress(READY + (++done / total) * (READ - READY)));
      recognised += pages.filter((p) => p.read && p.text).length;
      kept += pages.filter((p) => !p.read).length;
      const text = pages.map((p) => p.text).filter(Boolean).join("\n\n");
      if (opts.output !== "pdf" && text) {
        files.push({ name: textNames[i], bytes: encoder.encode(`${text}\n`), pageCount: src.pageCount, detail: wordsLead(countWords(text)) });
        allText ||= `${text}\n`;
      }
      if (opts.output !== "text") {
        const layers = pages.flatMap((p, page) => (p.layer ? [{ page, pdf: p.layer }] : []));
        const out = await runInWorker({ kind: "ocrLayer", zipName: "", files: [{ name: src.name, source: src.source, password: src.password, layers }] }, { signal });
        wasEncrypted ||= out.wasEncrypted;
        firstPdf ??= out.blob;
        files.push({ name: pdfNames[i], bytes: new Uint8Array(await out.blob.arrayBuffer()), pageCount: src.pageCount });
      }
    }
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
  if (signal.aborted) throw aborted();
  if (opts.output === "text" && !files.length) throw new Error(`${USER_ERROR}No text was found on ${total === 1 ? "this page" : "these pages"}.`);
  const notes: string[] = [];
  const warnings: string[] = [];
  if (!recognised) warnings.push(kept ? "Every page already has its text, so nothing was changed." : "No text was found on these pages.");
  else if (recognised < total) notes.push(`Text was recognised on ${recognised} of ${total} pages. ${kept === total - recognised ? "The others already had their text." : kept ? "The others already had their text or had none to find." : "The others had none to find."}`);
  const rest = { wasEncrypted, warnings: warnings.length ? warnings : undefined, notes: notes.length ? notes : undefined };
  onProgress(1);
  if (files.length === 1) {
    const f = files[0];
    const blob = new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.name.endsWith(".txt") ? "text/plain;charset=utf-8" : "application/pdf" });
    if (f.name.endsWith(".txt")) return { name: f.name, type: "text/plain", blob, size: blob.size, pageCount: f.pageCount, lead: f.detail, previewText: allText.slice(0, PREVIEW_CHARS), copyText: allText, ...rest };
    return { name: f.name, type: "application/pdf", blob, size: blob.size, pageCount: f.pageCount, ...rest };
  }
  const { createZipWriter } = await import("@/lib/pdf/zip");
  const zip = createZipWriter();
  for (const f of files) zip.add(f.name, f.bytes);
  const blob = zip.finish();
  return { name: zipName, type: "application/zip", blob, size: blob.size, entries: files.map((f) => ({ name: f.name, pageCount: f.pageCount, detail: f.detail })), ...rest };
}
