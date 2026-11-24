/**
 * Detect fields on every page (AC-240): renders each page in the reader's orientation, reads its
 * text, and hands both to the analysis (in a Web Worker in the browser, directly in tests). The
 * result is a list of proposals in the form model's page frame.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { overlapOfSmaller } from "../frame";
import { createField, newId } from "../model";
import type { FormField, FormPage, FormState, Proposal } from "../types";
import { pageTurn } from "../frame";
import type { AnalyzeInput, Found } from "./analyze";
import { textItems } from "./text";
import { frameBoxToView, viewBoxToFrame, type Orientation } from "./view";

/** Pixels per point for detection: 2 resolves 0.5 pt and keeps an A4 page near 2 MP. */
export const DETECT_SCALE = 2;
/** pdf.js `AnnotationMode.DISABLE`: existing fields are not drawn, so they are not detected again. */
const ANNOTATION_MODE_DISABLE = 0;

export type Canvas2D = { width: number; height: number; getContext(type: "2d"): CanvasRenderingContext2D | null };

export type DetectOptions = {
  /** Pages of the edited document in order; `src` is the source page (null = inserted blank page). */
  pages: (FormPage & { src: number | null })[];
  /** The current form: names in use, and widgets to skip. */
  form: FormState;
  analyze: (input: AnalyzeInput) => Promise<Found[]> | Found[];
  makeCanvas: (w: number, h: number) => Canvas2D;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  locale?: string;
  /** Overrides the pdf.js AnnotationMode used to render (forms hidden by default). */
  annotationMode?: number;
};

export type DetectResult = { proposals: Proposal[]; pagesWithFields: number; pagesScanned: number };

const toGray = (rgba: Uint8ClampedArray, n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    // Transparent pixels are paper (white).
    const a = rgba[j + 3] / 255;
    out[i] = Math.round((0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a));
  }
  return out;
};

export async function detectFields(pdf: PDFDocumentProxy, opts: DetectOptions): Promise<DetectResult> {
  const taken = opts.form.fields.map((f) => f.name);
  const proposals: Proposal[] = [];
  const pagesWithFields = new Set<string>();
  let scanned = 0;
  const work = opts.pages.filter((p) => p.src != null);
  let done = 0;
  for (const entry of work) {
    if (opts.signal?.aborted) throw new DOMException("Detection cancelled", "AbortError");
    const page = await pdf.getPage(entry.src! + 1);
    const turn = pageTurn(entry);
    const viewport = page.getViewport({ scale: DETECT_SCALE, rotation: turn });
    const canvas = opts.makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx, viewport, annotationMode: opts.annotationMode ?? ANNOTATION_MODE_DISABLE }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const content = await page.getTextContent();
    const vt = viewport.transform;
    const text = textItems(content.items as never[], vt, DETECT_SCALE);
    page.cleanup();

    const o: Orientation = { w: entry.view[2] - entry.view[0], h: entry.view[3] - entry.view[1], turn };
    const existing = opts.form.fields.flatMap((f) => f.widgets.filter((w) => w.page === entry.id).map((w) => frameBoxToView(o, w)));
    const isScan = !text.some((t) => t.str.trim());
    if (isScan) scanned++;
    const found = await opts.analyze({
      gray: { width: img.width, height: img.height, data: toGray(img.data, img.width * img.height), scale: DETECT_SCALE },
      text,
      existing,
      taken,
      locale: opts.locale,
      scanned: isScan,
    });
    const fields = toFields(found, entry.id, o, opts.form, taken);
    if (fields.length) pagesWithFields.add(entry.id);
    proposals.push(...fields);
    done++;
    opts.onProgress?.(done, work.length);
    // Let the page breathe between pages.
    await new Promise((r) => setTimeout(r, 0));
  }
  return { proposals, pagesWithFields: pagesWithFields.size, pagesScanned: scanned };
}

/** Found shapes (view) → proposed fields (frame). Radio buttons of one group become one field. */
export function toFields(found: Found[], pageId: string, o: Orientation, form: FormState, taken: string[]): Proposal[] {
  const out: Proposal[] = [];
  const groups = new Map<string, Proposal>();
  for (const f of found) {
    const box = viewBoxToFrame(o, f.box);
    if (f.kind === "radio" && f.group) {
      const g = groups.get(f.group);
      if (g) {
        g.field.widgets.push({ id: newId("w"), page: pageId, ...box, on: f.value });
        g.field.options.push(f.value!);
        continue;
      }
    }
    const kind = f.kind === "multiline" || f.kind === "comb" ? "text" : f.kind;
    const field: FormField = createField({ ...form, fields: [] }, { kind, page: pageId, box, name: f.name, multiline: f.kind === "multiline", origin: "detected", tooltip: f.tooltip, options: f.kind === "radio" ? [f.value!] : undefined });
    // createField ran against an empty form; the analysis already made the name unique.
    field.name = f.name;
    if (f.kind === "comb") Object.assign(field, { comb: true, maxLen: f.maxLen ?? null });
    if (f.kind === "radio") field.widgets[0].on = f.value;
    const p: Proposal = { field, label: f.label, confidence: f.confidence, source: f.source };
    if (f.kind === "radio" && f.group) groups.set(f.group, p);
    out.push(p);
    if (!taken.includes(f.name)) taken.push(f.name);
  }
  // Never propose over a widget that is already on the page (frame check, belt and braces).
  const existing = form.fields.flatMap((f) => f.widgets.filter((w) => w.page === pageId));
  return out.filter((p) => !p.field.widgets.some((w) => existing.some((e) => overlapOfSmaller(w, e) >= 0.3)));
}
