/**
 * Annotations (spec F10): what readers and editors add on top of a page (highlights, notes,
 * drawings, links). Remove annotations takes the chosen kinds off the chosen pages; Flatten draws
 * them into the page. Form fields are never touched here: they are fields, not notes.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFPage, PDFRef, PDFStream, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";

const N = PDFName.of;

/** The kinds a reader can pick, and the annotation subtypes each stands for. */
export const ANNOTATION_KINDS = [
  { value: "highlight", subtypes: ["Highlight"] },
  { value: "underline", subtypes: ["Underline", "Squiggly"] },
  { value: "strikeout", subtypes: ["StrikeOut"] },
  { value: "drawing", subtypes: ["Ink"] },
  { value: "shape", subtypes: ["Square", "Circle", "Polygon", "PolyLine", "Line"] },
  { value: "note", subtypes: ["Text", "Popup", "Caret"] },
  { value: "text", subtypes: ["FreeText"] },
  { value: "stamp", subtypes: ["Stamp"] },
  { value: "attachment", subtypes: ["FileAttachment", "Sound", "Movie", "Screen", "RichMedia", "3D"] },
  { value: "link", subtypes: ["Link"] },
] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]["value"] | "other";
export const ALL_KINDS: AnnotationKind[] = [...ANNOTATION_KINDS.map((k) => k.value), "other"];

const KIND_OF = new Map<string, AnnotationKind>(ANNOTATION_KINDS.flatMap((k) => k.subtypes.map((s) => [s, k.value] as [string, AnnotationKind])));
/** The kind a subtype belongs to; null for form fields and the marks other tools own (never removed here). */
export function kindOf(subtype: string | undefined): AnnotationKind | null {
  if (!subtype || subtype === "Widget" || subtype === "PrinterMark" || subtype === "TrapNet") return null;
  return KIND_OF.get(subtype) ?? "other";
}

type Entry = { raw: PDFRef | PDFDict; dict: PDFDict; subtype?: string };

function entriesOf(page: PDFPage): Entry[] {
  const array = page.node.lookupMaybe(N("Annots"), PDFArray);
  const out: Entry[] = [];
  if (!array) return out;
  for (let i = 0; i < array.size(); i++) {
    const raw = array.get(i);
    const dict = array.lookup(i);
    if (!(dict instanceof PDFDict) || !(raw instanceof PDFRef || raw instanceof PDFDict)) continue;
    const s = dict.lookup(N("Subtype"));
    out.push({ raw, dict, subtype: s instanceof PDFName ? s.decodeText() : undefined });
  }
  return out;
}

/** How many page lists name each annotation object: a copied page shares its annotations with the first copy. */
function listings(doc: PDFDocument): Map<PDFRef, number> {
  const out = new Map<PDFRef, number>();
  for (const page of doc.getPages()) for (const e of entriesOf(page)) if (e.raw instanceof PDFRef) out.set(e.raw, (out.get(e.raw) ?? 0) + 1);
  return out;
}

/**
 * Writes the page's list back without `gone`; replies to and pop-ups of removed annotations go with
 * them. An object another page still lists is taken off this page only (`listed` keeps count).
 */
function dropEntries(page: PDFPage, all: Entry[], gone: Set<Entry>, listed: Map<PDFRef, number>): number {
  const refs = () => new Set([...gone].map((e) => e.raw).filter((r): r is PDFRef => r instanceof PDFRef));
  for (let pass = 0; pass < 8; pass++) {
    const removed = refs();
    let grew = false;
    for (const e of all) {
      if (gone.has(e)) continue;
      const parent = e.dict.get(N("IRT")) ?? (e.subtype === "Popup" ? e.dict.get(N("Parent")) : undefined);
      if (parent instanceof PDFRef && removed.has(parent)) {
        gone.add(e);
        grew = true;
      }
    }
    if (!grew) break;
  }
  if (!gone.size) return 0;
  const keep = all.filter((e) => !gone.has(e));
  // A kept annotation must not point at a pop-up that went.
  const removed = refs();
  for (const e of keep) {
    const popup = e.dict.get(N("Popup"));
    if (popup instanceof PDFRef && removed.has(popup)) e.dict.delete(N("Popup"));
  }
  if (keep.length) page.node.set(N("Annots"), page.doc.context.obj(keep.map((e) => e.raw)));
  else page.node.delete(N("Annots"));
  for (const ref of removed) {
    const left = (listed.get(ref) ?? 1) - 1;
    listed.set(ref, left);
    if (left <= 0) page.doc.context.delete(ref);
  }
  return gone.size;
}

/** How many annotations of each kind the pages hold (form fields left out). */
export function countAnnotations(doc: PDFDocument): Partial<Record<AnnotationKind, number>> {
  const out: Partial<Record<AnnotationKind, number>> = {};
  for (const page of doc.getPages()) {
    for (const e of entriesOf(page)) {
      const kind = kindOf(e.subtype);
      // A pop-up is part of its note, not a note of its own.
      if (kind && e.subtype !== "Popup") out[kind] = (out[kind] ?? 0) + 1;
    }
  }
  return out;
}

export type RemoveAnnotationsInput = { bytes: Uint8Array; password?: string; /** 0-based pages to clean. */ pages: readonly number[]; kinds: readonly AnnotationKind[] };

/** Takes the chosen kinds of annotation off the chosen pages. `removed` counts them (pop-ups and replies included). */
export async function removeAnnotations({ bytes, password, pages, kinds }: RemoveAnnotationsInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; removed: number }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const all = doc.getPages();
  const picked = new Set(pages);
  const wanted = new Set(kinds);
  let removed = 0;
  const listed = listings(doc);
  all.forEach((page, i) => {
    if (picked.has(i)) {
      const entries = entriesOf(page);
      // A pop-up is never picked by kind: it is the window of its note or highlight and goes only with it.
      const gone = new Set(entries.filter((e) => {
        const kind = kindOf(e.subtype);
        return kind !== null && e.subtype !== "Popup" && wanted.has(kind);
      }));
      removed += dropEntries(page, entries, gone, listed);
    }
    onProgress?.((0.6 * (i + 1)) / all.length);
  });
  // Nothing found: the file goes back as it came (unless it was opened with a password).
  if (!removed && !wasEncrypted) return { bytes, pageCount: all.length, wasEncrypted, removed };
  return { bytes: await doc.save(), pageCount: all.length, wasEncrypted, removed };
}

const num = (o: unknown) => (o instanceof PDFNumber ? o.asNumber() : NaN);
function numbers(dict: PDFDict, key: string, count: number): number[] | null {
  const a = dict.lookup(N(key));
  if (!(a instanceof PDFArray) || a.size() < count) return null;
  const out = Array.from({ length: count }, (_, i) => num(a.lookup(i)));
  return out.every(Number.isFinite) ? out : null;
}

/** The normal appearance to draw: the stream itself, or the one its state (/AS) names. */
function appearanceOf(doc: PDFDocument, dict: PDFDict): PDFRef | null {
  const ap = dict.lookup(N("AP"));
  if (!(ap instanceof PDFDict)) return null;
  let n = ap.get(N("N"));
  const looked = ap.lookup(N("N"));
  if (looked instanceof PDFDict && !(looked instanceof PDFStream)) {
    const state = dict.lookup(N("AS"));
    if (!(state instanceof PDFName)) return null;
    n = looked.get(state);
  }
  if (!(n instanceof PDFRef) || !(doc.context.lookup(n) instanceof PDFStream)) return null;
  return n;
}

/**
 * The matrix that draws an appearance stream where its annotation shows it (PDF 32000-1, 12.5.5):
 * the stream's box, through its own matrix, is fitted to the annotation's rectangle.
 */
export function appearanceMatrix(rect: number[], bbox: number[], matrix: number[]): [number, number, number, number, number, number] | null {
  const [a, b, c, d, e, f] = matrix;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]]) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [rx0, rx1, ry0, ry1] = [Math.min(rect[0], rect[2]), Math.max(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[1], rect[3])];
  if (!(x1 - x0 > 0) || !(y1 - y0 > 0)) return null;
  const sx = (rx1 - rx0) / (x1 - x0);
  const sy = (ry1 - ry0) / (y1 - y0);
  return [sx, 0, 0, sy, rx0 - x0 * sx, ry0 - y0 * sy];
}

const HIDDEN = 2;
const PRINT = 4;
const NO_VIEW = 32;
/** Kinds Flatten leaves as they are: a link draws nothing, and drawing an attachment's icon would throw the attached file away. */
const NOT_FLATTENED = new Set<AnnotationKind>(["link", "attachment"]);

/**
 * Draws every annotation that has a drawn form into its page and removes it, so it can no longer
 * be moved, edited or deleted. Links, attachments and redaction marks stay as they are; notes that
 * are hidden on screen and on paper go without being drawn; an annotation with nothing to draw
 * stays an annotation. Returns how many were drawn, how many stay undrawn, and how many went undrawn
 * (hidden ones, and replies and pop-ups of drawn ones).
 */
export function flattenAnnotations(doc: PDFDocument): { drawn: number; kept: number; dropped: number } {
  let drawn = 0;
  let kept = 0;
  let dropped = 0;
  const listed = listings(doc);
  for (const page of doc.getPages()) {
    const entries = entriesOf(page);
    const gone = new Set<Entry>();
    const undrawn = new Set<Entry>();
    let drawnHere = 0;
    for (const e of entries) {
      const kind = kindOf(e.subtype);
      // A pop-up goes only with the annotation it belongs to (dropEntries).
      if (kind === null || NOT_FLATTENED.has(kind) || e.subtype === "Redact" || e.subtype === "Popup") continue;
      const flags = num(e.dict.lookup(N("F")));
      const f = Number.isFinite(flags) ? flags : 0;
      // Hidden everywhere, or off screen and not printed: nothing to draw. Off screen but printed is drawn.
      if ((f & HIDDEN) !== 0 || ((f & NO_VIEW) !== 0 && (f & PRINT) === 0)) {
        gone.add(e);
        continue;
      }
      const ref = appearanceOf(doc, e.dict);
      const rect = numbers(e.dict, "Rect", 4);
      const stream = ref ? (doc.context.lookup(ref) as PDFStream) : undefined;
      const bbox = stream ? numbers(stream.dict, "BBox", 4) : null;
      const m = rect && bbox ? appearanceMatrix(rect, bbox, (stream && numbers(stream.dict, "Matrix", 6)) ?? [1, 0, 0, 1, 0, 0]) : null;
      if (!ref || !m) {
        undrawn.add(e);
        continue;
      }
      const name = page.node.newXObject("Flat", ref);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState());
      gone.add(e);
      drawnHere++;
    }
    dropEntries(page, entries, gone, listed);
    drawn += drawnHere;
    // Pop-ups are windows, not notes: they are not counted either way.
    dropped += [...gone].filter((e) => e.subtype !== "Popup").length - drawnHere;
    kept += [...undrawn].filter((e) => !gone.has(e)).length;
  }
  return { drawn, kept, dropped };
}
