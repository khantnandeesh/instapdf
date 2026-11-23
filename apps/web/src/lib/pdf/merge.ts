/**
 * The Merge engine (spec F3 §3f and §6). Runs in the processing worker, never
 * on the main thread. Builds one PDF from the page list:
 *
 * - PDF pages are copied, not re-rendered. One object copier per source, so
 *   resources shared by several pages are written once. Links between pages
 *   of one source follow their pages; links to dropped pages are cleared.
 * - Image pages: one A4 page per image (or TIFF frame), image centered.
 * - Pass 1 creates every page in output order; pass 2 applies same-width
 *   scaling, footer text and padding sizes; then contents (TOC) pages, form
 *   fields and bookmarks.
 *
 * Memory: each source is loaded at its first use and released after its
 * last page is copied; only its outline, title and form defaults are kept.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObjectCopier,
  PDFPage,
  PDFRef,
  PDFString,
  concatTransformationMatrix,
  degrees,
  drawObject,
  grayscale,
  popGraphicsState,
  pushGraphicsState,
  scale as scaleOperator,
} from "@cantoo/pdf-lib";
import { segmentsOf, type PageSize } from "../page-list";
import { imagePlacement, probeImage, sniffFormat, type ImageFormat } from "./images";
import { dropStructureLinks, readLang, readPageLabels, writePageLabels, type PageLabel } from "./doc-props";
import { buildAcroForm, detachAnnotations, flattenFields, removeWidgets } from "./forms";
import type { MergeOptions } from "./merge-options";
import { baseName } from "./naming";
import { mapBookmarks, readOutline, writeOutline, type OutBookmark, type SourceBookmark } from "./outline";
import { loadForEdit } from "./rotate";
import { normalizeRotation } from "./rotation";
import { createTextWriter, type FontSource, type TextWriter } from "./text";
import type { TiffFile } from "./tiff";

export type MergeSourceInput = { id: string; name: string; kind: "pdf" | "image"; source: Blob; password?: string };

export type MergePageInput = {
  /** null for an inserted blank page. */
  sourceId: string | null;
  sourceIndex: number;
  /** User rotation in degrees (any multiple of 90). */
  rotation: number;
  /** Blank pages only: their size. */
  size?: PageSize;
};

export type MergeInput = { sources: MergeSourceInput[]; pages: MergePageInput[]; options: MergeOptions };

export type MergeEnv = {
  /** Unicode fonts for names Helvetica cannot show (fetched by the worker). */
  fonts?: FontSource;
  /** Browser decode of GIF, BMP and WebP to 8-bit RGBA (OffscreenCanvas in the worker). */
  decodeImage?: (bytes: Uint8Array, format: ImageFormat, name: string) => Promise<{ rgba: Uint8Array; width: number; height: number }>;
  /** Called with "fonts" before a font download, and "pages" when writing starts. */
  onPhase?: (phase: "fonts" | "pages") => void;
};

/** `warnings`: non-blocking notes for the user (sentence case, our wording). */
export type MergeResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings: string[] };

const FOOTER_SIZE = 8;
const FOOTER_COLOR = grayscale(0.3);
const TOC_TITLE = "Contents";

type PdfSource = {
  kind: "pdf";
  input: MergeSourceInput;
  doc: PDFDocument;
  pages: PDFPage[];
  copier: PDFObjectCopier;
  /** Output ref reserved for the first copy of each used source page. */
  reserved: Map<number, PDFRef>;
};
type ImageSource = { kind: "image"; input: MergeSourceInput; bytes: Uint8Array; format: ImageFormat; embedded: Map<number, ImageDraw>; frames: PageSize[]; tiff?: TiffFile };
type Loaded = PdfSource | ImageSource;

type Slot = { kind: "page"; input: MergePageInput } | { kind: "pad" } | { kind: "toc"; index: number };

/** Size of the visible box as displayed with a total rotation. */
function displayed(box: PageSize, rotation: number): PageSize {
  return normalizeRotation(rotation) % 180 ? { width: box.height, height: box.width } : box;
}

/** Scales a page's boxes, content and annotations by `s` (aspect ratio kept). */
function scalePage(page: PDFPage, s: number) {
  const ctx = page.doc.context;
  page.node.normalize();
  for (const name of ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
    const box = page.node.lookup(PDFName.of(name));
    if (!(box instanceof PDFArray)) continue;
    // Entries may be indirect numbers: resolve them, or the box would collapse to 0.
    const nums = box.asArray().map((n) => ctx.lookup(n));
    if (nums.length !== 4 || !nums.every((n) => n instanceof PDFNumber)) continue;
    page.node.set(PDFName.of(name), ctx.obj(nums.map((n) => (n as PDFNumber).asNumber() * s)));
  }
  const start = ctx.register(ctx.contentStream([pushGraphicsState(), scaleOperator(s, s)]));
  const end = ctx.register(ctx.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
  page.scaleAnnotations(s, s);
}

/** Maps a point in displayed coordinates (from the visible bottom-left) to page space, for a page shown at `rotation`. */
function toPageSpace(box: { x: number; y: number; width: number; height: number }, rotation: number, u: number, v: number) {
  const { x, y, width: W, height: H } = box;
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: x + W - v, y: y + u, angle: 90 };
    case 180:
      return { x: x + W - u, y: y + H - v, angle: 180 };
    case 270:
      return { x: x + v, y: y + H - u, angle: 270 };
    default:
      return { x: x + u, y: y + v, angle: 0 };
  }
}

function drawFooter(page: PDFPage, text: TextWriter, name: string) {
  const box = page.getCropBox();
  const rotation = page.getRotation().angle;
  const shown = displayed({ width: box.width, height: box.height }, rotation);
  const margin = Math.min(18, shown.width * 0.05);
  const fitted = text.fit(name, FOOTER_SIZE, shown.width - 2 * margin);
  const at = toPageSpace(box, rotation, margin, Math.min(10, shown.height * 0.03));
  text.draw(page, fitted, { x: at.x, y: at.y, size: FOOTER_SIZE, color: FOOTER_COLOR, rotate: at.angle });
}

type TocEntry = { title: string; sourceId: string };

const TOC = { titleSize: 18, size: 11, line: 20 };

function tocLayout(size: PageSize) {
  const margin = Math.max(36, Math.min(size.width, size.height) * 0.09);
  const top = size.height - margin;
  const firstRow = top - TOC.titleSize - 18;
  const rows = Math.max(1, Math.floor((firstRow - margin) / TOC.line) + 1);
  return { margin, top, firstRow, rows };
}

function drawToc(pages: PDFPage[], size: PageSize, entries: TocEntry[], target: (sourceId: string) => { ref: PDFRef; number: number }, text: TextWriter) {
  const { margin, top, firstRow, rows } = tocLayout(size);
  const ctx = pages[0].doc.context;
  pages.forEach((page, k) => {
    text.draw(page, TOC_TITLE, { x: margin, y: top - TOC.titleSize, size: TOC.titleSize, color: grayscale(0.1) });
    entries.slice(k * rows, (k + 1) * rows).forEach((entry, i) => {
      const y = firstRow - i * TOC.line;
      const { ref, number } = target(entry.sourceId);
      const num = String(number);
      const numWidth = text.width(num, TOC.size);
      const title = text.fit(entry.title, TOC.size, size.width - 2 * margin - numWidth - 16);
      text.draw(page, title, { x: margin, y, size: TOC.size, color: grayscale(0.1) });
      text.draw(page, num, { x: size.width - margin - numWidth, y, size: TOC.size, color: grayscale(0.1) });
      const link = ctx.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [margin, y - 5, size.width - margin, y + TOC.size + 4],
        Border: [0, 0, 0],
        Dest: [ref, "Fit"],
      });
      page.node.addAnnot(ctx.register(link));
    });
  });
}

/** Draws an image (embedded once per source frame) inside its placement box. */
type ImageDraw = (page: PDFPage, box: { x: number; y: number; width: number; height: number }) => void;

/**
 * An RGBA frame as an image XObject without a PNG round trip: RGB with Flate,
 * plus a DeviceGray soft mask when any pixel is not opaque.
 */
export function embedRgba(out: PDFDocument, rgba: Uint8Array, width: number, height: number): PDFRef {
  const n = width * height;
  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  let opaque = true;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    rgb[i * 3] = rgba[j];
    rgb[i * 3 + 1] = rgba[j + 1];
    rgb[i * 3 + 2] = rgba[j + 2];
    alpha[i] = rgba[j + 3];
    if (rgba[j + 3] !== 255) opaque = false;
  }
  const ctx = out.context;
  const base = { Type: "XObject", Subtype: "Image", Width: width, Height: height, BitsPerComponent: 8 };
  const smask = opaque ? undefined : ctx.register(ctx.flateStream(alpha, { ...base, ColorSpace: "DeviceGray" }));
  return ctx.register(ctx.flateStream(rgb, { ...base, ColorSpace: "DeviceRGB", ...(smask ? { SMask: smask } : {}) }));
}

function drawXObject(ref: PDFRef): ImageDraw {
  return (page, b) => {
    const name = page.node.newXObject("Image", ref);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(b.width, 0, 0, b.height, b.x, b.y), drawObject(name), popGraphicsState());
  };
}

async function embedImageFrame(out: PDFDocument, src: ImageSource, frame: number, env: MergeEnv): Promise<ImageDraw> {
  const cached = src.embedded.get(frame);
  if (cached) return cached;
  let draw: ImageDraw;
  if (src.format === "jpeg" || src.format === "png") {
    const image = src.format === "jpeg" ? await out.embedJpg(src.bytes) : await out.embedPng(src.bytes);
    draw = (page, b) => page.drawImage(image, b);
  } else if (src.format === "tiff") {
    const { decodeTiffFrame } = await import("./tiff");
    const f = await decodeTiffFrame(src.bytes, src.tiff!, frame);
    draw = drawXObject(embedRgba(out, f.rgba, f.width, f.height));
  } else {
    if (!env.decodeImage) throw new Error(`No decoder for ${src.format}`);
    const f = await env.decodeImage(src.bytes, src.format, src.input.name);
    draw = drawXObject(embedRgba(out, f.rgba, f.width, f.height));
  }
  src.embedded.set(frame, draw);
  return draw;
}

/** What later phases need from a source, kept after the source itself is released. */
type SourceMeta = {
  name: string;
  kind: "pdf" | "image";
  title?: string;
  outline: SourceBookmark[];
  form?: PDFDict;
  lang?: string;
  labels?: (PageLabel | null)[] | null;
  /** Flatten mode: fields that could not be flattened and stay fillable. */
  keptFields?: string[];
};

/**
 * Loads one source (lazily, at its first use) and extracts up front what the
 * later phases need, so the parsed document, its bytes and its copier can be
 * released after the source's last page has been copied.
 */
async function loadSource(s: MergeSourceInput, usedIndexes: Set<number>, options: MergeOptions, out: PDFDocument): Promise<{ loaded: Loaded; meta: SourceMeta; encrypted: boolean }> {
  const bytes = new Uint8Array(await s.source.arrayBuffer());
  if (s.kind === "image") {
    const format = sniffFormat(bytes);
    if (!format) throw new Error("Unreadable image");
    let frames: PageSize[] = [];
    let tiff: TiffFile | undefined;
    if (format === "tiff") {
      const { readTiff } = await import("./tiff");
      const r = readTiff(bytes);
      if ("frames" in r) {
        tiff = r;
        frames = r.frames.map(({ width, height }) => ({ width, height }));
      }
    } else {
      const probe = probeImage(bytes);
      if (probe) frames = [{ width: probe.width, height: probe.height }];
    }
    if (!frames.length) throw new Error("Unreadable image");
    return { loaded: { kind: "image", input: s, bytes, format, embedded: new Map(), frames, tiff }, meta: { name: s.name, kind: "image", outline: [] }, encrypted: false };
  }
  const { doc, wasEncrypted } = await loadForEdit(bytes, s.password);
  // Fields that cannot be flattened stay fillable (merged as in "merge, rename duplicates").
  const keptFields = options.forms === "flatten" ? flattenFields(doc) : [];
  const pages = doc.getPages();
  const copier = PDFObjectCopier.for(doc.context, out.context);
  const traversed = (copier as unknown as { traversedObjects: Map<unknown, unknown> }).traversedObjects;
  const reserved = new Map<number, PDFRef>();
  pages.forEach((page, idx) => {
    if (usedIndexes.has(idx)) {
      const ref = out.context.nextRef();
      reserved.set(idx, ref);
      traversed.set(page.ref, ref);
    } else traversed.set(page.ref, PDFNull); // links to dropped pages go nowhere
  });
  let form: PDFDict | undefined;
  const acro = doc.catalog.lookup(PDFName.of("AcroForm"));
  if (acro instanceof PDFDict && options.forms !== "remove" && (options.forms !== "flatten" || keptFields.length)) {
    form = out.context.obj({}) as PDFDict;
    const dr = acro.get(PDFName.of("DR"));
    const da = acro.get(PDFName.of("DA"));
    if (dr) form.set(PDFName.of("DR"), copier.copy(dr));
    if (da) form.set(PDFName.of("DA"), da.clone());
  }
  const meta: SourceMeta = {
    name: s.name,
    kind: "pdf",
    title: doc.getTitle() || undefined,
    outline: options.bookmarks === "keep" || options.bookmarks === "perFileNested" ? readOutline(doc) : [],
    form,
    lang: readLang(doc),
    labels: readPageLabels(doc),
    keptFields,
  };
  return { loaded: { kind: "pdf", input: s, doc, pages, copier, reserved }, meta, encrypted: wasEncrypted };
}

/** Displayed size of an input page in the output, before same-width scaling. */
function inputSize(p: MergePageInput, src: Loaded | undefined): PageSize {
  if (!p.sourceId || !src) return displayed(p.size ?? { width: 595, height: 842 }, p.rotation);
  if (src.kind === "image") {
    const f = src.frames[p.sourceIndex] ?? src.frames[0];
    return displayed(imagePlacement(f.width, f.height).page, p.rotation);
  }
  const page = src.pages[p.sourceIndex];
  const box = page.getCropBox();
  return displayed({ width: box.width, height: box.height }, page.getRotation().angle + p.rotation);
}

/**
 * Gives a copied page its own direct /Contents array. The copier shares one
 * array between two copies of the same source page, so anything appended to
 * one copy (footer, same-width wrap) would otherwise land on both.
 */
function ownContents(page: PDFPage) {
  const ctx = page.doc.context;
  const raw = page.node.get(PDFName.of("Contents"));
  const value = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
  if (value instanceof PDFArray) page.node.set(PDFName.of("Contents"), ctx.obj(value.asArray()));
}

export async function mergePdf(input: MergeInput, env: MergeEnv, onProgress: (fraction: number) => void): Promise<MergeResult> {
  const { options } = input;
  onProgress(0);
  const out = await PDFDocument.create({ updateMetadata: false });
  out.setProducer("InstaPDF");
  const pagesIn = input.pages.filter((p) => p.sourceId === null || input.sources.some((s) => s.id === p.sourceId));
  if (!pagesIn.length) throw new Error("Nothing to merge");
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));
  const usedIndexes = new Map<string, Set<number>>();
  for (const p of pagesIn) if (p.sourceId) (usedIndexes.get(p.sourceId) ?? usedIndexes.set(p.sourceId, new Set()).get(p.sourceId)!).add(p.sourceIndex);

  // Sources are loaded at first use and released after their last page (memory).
  const loaded = new Map<string, Loaded>();
  const meta = new Map<string, SourceMeta>();
  let wasEncrypted = false;
  const ensure = async (id: string): Promise<Loaded> => {
    const have = loaded.get(id);
    if (have) return have;
    if (meta.has(id)) throw new Error("Source used after release");
    const r = await loadSource(sourceById.get(id)!, usedIndexes.get(id) ?? new Set(), options, out);
    wasEncrypted ||= r.encrypted;
    loaded.set(id, r.loaded);
    meta.set(id, r.meta);
    return r.loaded;
  };

  // ---- plan: segments, contents pages, padding ----
  const asRefs = pagesIn.map((p, i) => ({ uid: String(i), sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: 0, size: { width: 0, height: 0 } }));
  const segments = segmentsOf(asRefs).map((s) => s.pages.map((r) => pagesIn[Number(r.uid)]));
  const tocOn = options.toc !== "none";
  const coverSegments = tocOn && options.cover ? segments.slice(0, 1) : [];
  const restSegments = segments.slice(coverSegments.length);
  const coverSource = coverSegments[0]?.find((p) => p.sourceId)?.sourceId ?? null;
  const tocSources: string[] = [];
  for (const seg of restSegments) for (const p of seg) if (p.sourceId && p.sourceId !== coverSource && !tocSources.includes(p.sourceId)) tocSources.push(p.sourceId);
  const first = pagesIn[0];
  const firstSize = inputSize(first, first.sourceId ? await ensure(first.sourceId) : undefined);
  const targetWidth = firstSize.width;
  const tocSize = firstSize; // same width by definition when same-width is on
  const tocPageCount = tocOn && tocSources.length ? Math.ceil(tocSources.length / tocLayout(tocSize).rows) : 0;

  const slots: Slot[] = [];
  const pushSegment = (seg: MergePageInput[]) => {
    for (const p of seg) slots.push({ kind: "page", input: p });
    if (options.doubleSided && seg.length % 2) slots.push({ kind: "pad" });
  };
  coverSegments.forEach(pushSegment);
  for (let i = 0; i < tocPageCount; i++) slots.push({ kind: "toc", index: i });
  if (options.doubleSided && tocPageCount % 2) slots.push({ kind: "pad" });
  restSegments.forEach(pushSegment);
  const lastSlot = new Map<string, number>();
  slots.forEach((slot, n) => {
    if (slot.kind === "page" && slot.input.sourceId) lastSlot.set(slot.input.sourceId, n);
  });

  // ---- pass 1: create every page (copy, image, blank, placeholders) ----
  type Made = { page: PDFPage; slot: Slot; name?: string; sourceId?: string; label?: PageLabel | null };
  const made: Made[] = [];
  const firstOut = new Map<string, PDFRef>(); // "source:index" -> first output copy
  const firstOfSource = new Map<string, { ref: PDFRef; number: number }>();
  const total = slots.length;
  for (let n = 0; n < slots.length; n++) {
    const slot = slots[n];
    let page: PDFPage;
    let name: string | undefined;
    let label: PageLabel | null = null;
    if (slot.kind === "toc") page = out.addPage([tocSize.width, tocSize.height]);
    else if (slot.kind === "pad") page = out.addPage([1, 1]); // sized in pass 2, after its neighbour
    else {
      const p = slot.input;
      const src = p.sourceId ? await ensure(p.sourceId) : undefined;
      name = src?.input.name;
      if (!src) {
        const size = p.size ?? { width: 595, height: 842 };
        page = out.addPage([size.width, size.height]);
        page.setRotation(degrees(normalizeRotation(p.rotation)));
      } else if (src.kind === "image") {
        const frame = src.frames[p.sourceIndex] ?? src.frames[0];
        const place = imagePlacement(frame.width, frame.height);
        page = out.addPage([place.page.width, place.page.height]);
        (await embedImageFrame(out, src, Math.max(0, p.sourceIndex), env))(page, place);
        page.setRotation(degrees(normalizeRotation(p.rotation)));
      } else {
        const key = `${src.input.id}:${p.sourceIndex}`;
        const srcPage = src.pages[p.sourceIndex];
        const reserved = src.reserved.get(p.sourceIndex);
        const node = src.copier.copy(srcPage.node) as unknown as PDFPage["node"];
        const isFirst = !firstOut.has(key) && reserved;
        const ref = isFirst ? reserved : out.context.register(node);
        if (isFirst) out.context.assign(ref, node);
        page = PDFPage.of(node, ref, out);
        out.addPage(page);
        ownContents(page);
        if (!isFirst) detachAnnotations(page); // a duplicate gets its own annotations and fields, before anything is changed
        dropStructureLinks(page); // the output has no structure tree
        label = meta.get(src.input.id)?.labels?.[p.sourceIndex] ?? null;
        page.setRotation(degrees(normalizeRotation(srcPage.getRotation().angle + p.rotation)));
      }
      if (p.sourceId) {
        const key = `${p.sourceId}:${p.sourceIndex}`;
        if (!firstOut.has(key)) firstOut.set(key, page.ref);
        if (!firstOfSource.has(p.sourceId)) firstOfSource.set(p.sourceId, { ref: page.ref, number: out.getPageCount() });
      }
    }
    made.push({ page, slot, name, sourceId: slot.kind === "page" ? (slot.input.sourceId ?? undefined) : undefined, label });
    // Release every source whose last page this was.
    for (const [id, last] of lastSlot) {
      if (last !== n) continue;
      loaded.delete(id);
      lastSlot.delete(id);
    }
    onProgress(0.05 + (0.6 * (n + 1)) / total);
  }

  // ---- fonts (only when text is written) ----
  const tocEntries: TocEntry[] = tocSources.map((id) => {
    const m = meta.get(id)!;
    return { title: options.toc === "titles" && m.kind === "pdf" && m.title?.trim() ? m.title.trim() : m.name, sourceId: id };
  });
  const texts: string[] = [];
  if (options.footer) for (const m of meta.values()) texts.push(m.name);
  if (tocPageCount) texts.push(TOC_TITLE, ...tocEntries.map((e) => e.title));
  const writer = texts.length ? await createTextWriter(out, texts, env.fonts, () => env.onPhase?.("fonts")) : null;
  env.onPhase?.("pages");

  // ---- pass 2: same width, footers, padding sizes ----
  const contentPages: PDFPage[] = [];
  const tocPages: PDFPage[] = [];
  made.forEach(({ page, slot, name }, n) => {
    if (slot.kind === "toc") tocPages.push(page);
    else if (slot.kind === "pad") {
      const prev = made[n - 1].page;
      const box = prev.getMediaBox();
      page.setMediaBox(box.x, box.y, box.width, box.height);
      page.setRotation(prev.getRotation());
    } else {
      if (options.sameWidth) {
        const shown = displayed({ width: page.getCropBox().width, height: page.getCropBox().height }, page.getRotation().angle);
        const s = targetWidth / shown.width;
        if (Math.abs(s - 1) > 1e-4) scalePage(page, s);
      }
      if (name && writer && options.footer) drawFooter(page, writer, name);
      contentPages.push(page);
    }
    onProgress(0.65 + (0.25 * (n + 1)) / total);
  });

  if (tocPages.length && writer) {
    // The contents lists where each file starts after the cover (a cover source never appears here).
    drawToc(tocPages, tocSize, tocEntries, (id) => firstOfSource.get(id)!, writer);
  }

  // ---- form fields ----
  const warnings: string[] = [];
  const forms = [...meta.values()].flatMap((m) => (m.form ? [m.form] : []));
  if (options.forms === "remove") contentPages.forEach(removeWidgets);
  else if (options.forms === "flatten") {
    // Pages of a file whose fields could not all be flattened keep those fields.
    const keeps = new Set([...meta].filter(([, m]) => m.keptFields?.length).map(([id]) => id));
    const kept: PDFPage[] = [];
    for (const m of made) {
      if (m.slot.kind !== "page") continue;
      if (m.sourceId && keeps.has(m.sourceId)) kept.push(m.page);
      else removeWidgets(m.page);
    }
    if (kept.length) buildAcroForm(out, kept, "rename", forms);
    for (const id of keeps) {
      const m = meta.get(id)!;
      warnings.push(`Some form fields in ${m.name} couldn't be flattened, so they were kept as fillable fields (${m.keptFields!.join(", ")}).`);
    }
  } else buildAcroForm(out, contentPages, options.forms, forms);

  // ---- document language and page labels ----
  const lang = [...firstOfSource.keys()].map((id) => meta.get(id)?.lang).find(Boolean);
  if (lang) out.catalog.set(PDFName.of("Lang"), PDFString.of(lang));
  if ([...meta.values()].some((m) => m.labels)) writePageLabels(out, made.map((m) => m.label ?? null));

  // ---- bookmarks ----
  if (options.bookmarks !== "remove") {
    const items: OutBookmark[] = [];
    for (const id of firstOfSource.keys()) {
      const m = meta.get(id)!;
      const inner = options.bookmarks !== "perFile" ? mapBookmarks(m.outline, (i) => firstOut.get(`${id}:${i}`)) : [];
      if (options.bookmarks === "keep") items.push(...inner);
      else items.push({ title: baseName(m.name), page: firstOfSource.get(id)!.ref, children: inner });
    }
    writeOutline(out, items);
  }

  onProgress(0.95);
  const bytes = await out.save();
  onProgress(1);
  return { bytes, pageCount: out.getPageCount(), wasEncrypted, warnings };
}
