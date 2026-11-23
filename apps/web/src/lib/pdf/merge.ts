/**
 * The Merge engine (spec F3 §3f and §6). Runs in the processing worker, never
 * on the main thread. Builds one PDF from the page list:
 *
 * - PDF pages are copied, not re-rendered. One object copier per source, so
 *   resources shared by several pages are written once. Links between pages
 *   of one source follow their pages; links to dropped pages are cleared.
 * - Image pages: one A4 page per image (or TIFF frame), image centered.
 * - Then, in order: same-width scaling, footer text, contents (TOC) pages,
 *   double-sided padding, form fields and bookmarks.
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
  degrees,
  grayscale,
  popGraphicsState,
  pushGraphicsState,
  scale as scaleOperator,
  type PDFImage,
} from "@cantoo/pdf-lib";
import { segmentsOf, type PageSize } from "../page-list";
import { imagePlacement, sniffFormat, type ImageFormat } from "./images";
import { buildAcroForm, detachAnnotations, removeWidgets } from "./forms";
import type { MergeOptions } from "./merge-options";
import { baseName } from "./naming";
import { mapBookmarks, readOutline, writeOutline, type OutBookmark } from "./outline";
import { loadForEdit } from "./rotate";
import { normalizeRotation } from "./rotation";
import { createTextWriter, type FontSource, type TextWriter } from "./text";

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
  /** Browser decode of GIF, BMP and WebP to PNG bytes (OffscreenCanvas in the worker). */
  decodeImage?: (bytes: Uint8Array, format: ImageFormat) => Promise<Uint8Array>;
  /** Called with "fonts" before a font download, and "pages" when writing starts. */
  onPhase?: (phase: "fonts" | "pages") => void;
};

export type MergeResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean };

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
  title?: string;
};
type ImageSource = { kind: "image"; input: MergeSourceInput; bytes: Uint8Array; format: ImageFormat; embedded: Map<number, PDFImage>; frames: PageSize[] };
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
    if (box instanceof PDFArray) page.node.set(PDFName.of(name), ctx.obj(box.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() * s : 0))));
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

async function embedImageFrame(out: PDFDocument, src: ImageSource, frame: number, env: MergeEnv): Promise<PDFImage> {
  const cached = src.embedded.get(frame);
  if (cached) return cached;
  let image: PDFImage;
  if (src.format === "jpeg") image = await out.embedJpg(src.bytes);
  else if (src.format === "png") image = await out.embedPng(src.bytes);
  else if (src.format === "tiff") {
    const [{ decodeTiffFrame }, { encodePng }] = await Promise.all([import("./tiff"), import("./png")]);
    const f = await decodeTiffFrame(src.bytes, frame);
    image = await out.embedPng(encodePng(f.rgba, f.width, f.height));
  } else {
    if (!env.decodeImage) throw new Error(`No decoder for ${src.format}`);
    image = await out.embedPng(await env.decodeImage(src.bytes, src.format));
  }
  src.embedded.set(frame, image);
  return image;
}

async function loadSources(input: MergeInput, used: Set<string>, out: PDFDocument, onProgress: (f: number) => void) {
  const loaded = new Map<string, Loaded>();
  let wasEncrypted = false;
  const usedIndexes = new Map<string, Set<number>>();
  for (const p of input.pages) if (p.sourceId) (usedIndexes.get(p.sourceId) ?? usedIndexes.set(p.sourceId, new Set()).get(p.sourceId)!).add(p.sourceIndex);
  const list = input.sources.filter((s) => used.has(s.id));
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const bytes = new Uint8Array(await s.source.arrayBuffer());
    if (s.kind === "image") {
      const format = sniffFormat(bytes);
      if (!format) throw new Error("Unreadable image");
      let frames: PageSize[] = [];
      if (format === "tiff") {
        const { tiffFrameSizes } = await import("./tiff");
        frames = (await tiffFrameSizes(bytes)) ?? [];
      } else {
        const { probeImage } = await import("./images");
        const probe = probeImage(bytes);
        if (probe) frames = [{ width: probe.width, height: probe.height }];
      }
      if (!frames.length) throw new Error("Unreadable image");
      loaded.set(s.id, { kind: "image", input: s, bytes, format, embedded: new Map(), frames });
    } else {
      const { doc, wasEncrypted: enc } = await loadForEdit(bytes, s.password);
      wasEncrypted ||= enc;
      if (input.options.forms === "flatten") {
        try {
          doc.getForm().flatten();
        } catch {
          // Widgets that could not be flattened are removed below.
        }
      }
      const pages = doc.getPages();
      const copier = PDFObjectCopier.for(doc.context, out.context);
      const traversed = (copier as unknown as { traversedObjects: Map<unknown, unknown> }).traversedObjects;
      const reserved = new Map<number, PDFRef>();
      const keep = usedIndexes.get(s.id) ?? new Set<number>();
      pages.forEach((page, idx) => {
        if (keep.has(idx)) {
          const ref = out.context.nextRef();
          reserved.set(idx, ref);
          traversed.set(page.ref, ref);
        } else traversed.set(page.ref, PDFNull); // links to dropped pages go nowhere
      });
      loaded.set(s.id, { kind: "pdf", input: s, doc, pages, copier, reserved, title: doc.getTitle() || undefined });
    }
    onProgress(((i + 1) / list.length) * 0.2);
  }
  return { loaded, wasEncrypted };
}

/** Displayed size of an input page in the output, before same-width scaling. */
function inputSize(p: MergePageInput, loaded: Map<string, Loaded>): PageSize {
  if (!p.sourceId) return displayed(p.size ?? { width: 595, height: 842 }, p.rotation);
  const src = loaded.get(p.sourceId)!;
  if (src.kind === "image") {
    const f = src.frames[p.sourceIndex] ?? src.frames[0];
    return displayed(imagePlacement(f.width, f.height).page, p.rotation);
  }
  const page = src.pages[p.sourceIndex];
  const box = page.getCropBox();
  return displayed({ width: box.width, height: box.height }, page.getRotation().angle + p.rotation);
}

export async function mergePdf(input: MergeInput, env: MergeEnv, onProgress: (fraction: number) => void): Promise<MergeResult> {
  const { options } = input;
  onProgress(0);
  const out = await PDFDocument.create({ updateMetadata: false });
  out.setProducer("InstaPDF");
  const pagesIn = input.pages.filter((p) => p.sourceId === null || input.sources.some((s) => s.id === p.sourceId));
  if (!pagesIn.length) throw new Error("Nothing to merge");
  const used = new Set(pagesIn.flatMap((p) => (p.sourceId ? [p.sourceId] : [])));
  const { loaded, wasEncrypted } = await loadSources({ ...input, pages: pagesIn }, used, out, onProgress);

  // ---- plan: segments, contents pages, padding ----
  const asRefs = pagesIn.map((p, i) => ({ uid: String(i), sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: 0, size: { width: 0, height: 0 } }));
  const segments = segmentsOf(asRefs).map((s) => s.pages.map((r) => pagesIn[Number(r.uid)]));
  const tocOn = options.toc !== "none";
  const coverSegments = tocOn && options.cover ? segments.slice(0, 1) : [];
  const restSegments = segments.slice(coverSegments.length);
  const coverSource = coverSegments[0]?.find((p) => p.sourceId)?.sourceId ?? null;
  const tocSources: string[] = [];
  for (const seg of restSegments) for (const p of seg) if (p.sourceId && p.sourceId !== coverSource && !tocSources.includes(p.sourceId)) tocSources.push(p.sourceId);
  const tocEntries: TocEntry[] = tocOn
    ? tocSources.map((id) => {
        const src = loaded.get(id)!;
        const title = options.toc === "titles" && src.kind === "pdf" && src.title?.trim() ? src.title.trim() : src.input.name;
        return { title, sourceId: id };
      })
    : [];
  const firstSize = inputSize(pagesIn[0], loaded);
  const targetWidth = firstSize.width;
  const tocSize = firstSize; // same width by definition when same-width is on
  const tocPageCount = tocEntries.length ? Math.ceil(tocEntries.length / tocLayout(tocSize).rows) : 0;

  const slots: Slot[] = [];
  const pushSegment = (seg: MergePageInput[]) => {
    for (const p of seg) slots.push({ kind: "page", input: p });
    if (options.doubleSided && seg.length % 2) slots.push({ kind: "pad" });
  };
  coverSegments.forEach(pushSegment);
  for (let i = 0; i < tocPageCount; i++) slots.push({ kind: "toc", index: i });
  if (options.doubleSided && tocPageCount % 2) slots.push({ kind: "pad" });
  restSegments.forEach(pushSegment);

  // ---- fonts (only when text is written) ----
  const texts: string[] = [];
  if (options.footer) for (const id of used) texts.push(loaded.get(id)!.input.name);
  if (tocEntries.length) texts.push(TOC_TITLE, ...tocEntries.map((e) => e.title));
  const writer = texts.length ? await createTextWriter(out, texts, env.fonts, () => env.onPhase?.("fonts")) : null;
  env.onPhase?.("pages");

  // ---- pages ----
  const firstOut = new Map<string, PDFRef>(); // "source:index" -> first output copy
  const firstOfSource = new Map<string, { ref: PDFRef; number: number }>();
  const tocPages: PDFPage[] = [];
  const contentPages: PDFPage[] = [];
  const total = slots.length;
  for (let n = 0; n < slots.length; n++) {
    const slot = slots[n];
    let page: PDFPage;
    if (slot.kind === "toc") {
      page = out.addPage([tocSize.width, tocSize.height]);
      tocPages.push(page);
    } else if (slot.kind === "pad") {
      const prev = out.getPage(out.getPageCount() - 1);
      const box = prev.getMediaBox();
      page = out.addPage([box.width, box.height]);
      page.setMediaBox(box.x, box.y, box.width, box.height);
      page.setRotation(prev.getRotation());
    } else {
      const p = slot.input;
      const src = p.sourceId ? loaded.get(p.sourceId) : undefined;
      if (!src) {
        const size = p.size ?? { width: 595, height: 842 };
        page = out.addPage([size.width, size.height]);
        page.setRotation(degrees(normalizeRotation(p.rotation)));
      } else if (src.kind === "image") {
        const frame = src.frames[p.sourceIndex] ?? src.frames[0];
        const place = imagePlacement(frame.width, frame.height);
        page = out.addPage([place.page.width, place.page.height]);
        const image = await embedImageFrame(out, src, Math.max(0, p.sourceIndex), env);
        page.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
        page.setRotation(degrees(normalizeRotation(p.rotation)));
      } else {
        const key = `${src.input.id}:${p.sourceIndex}`;
        const srcPage = src.pages[p.sourceIndex];
        const reserved = src.reserved.get(p.sourceIndex);
        const node = src.copier.copy(srcPage.node) as unknown as PDFPage["node"];
        const first = !firstOut.has(key) && reserved;
        const ref = first ? reserved : out.context.register(node);
        if (first) out.context.assign(ref, node);
        page = PDFPage.of(node, ref, out);
        out.addPage(page);
        if (!first) detachAnnotations(page); // a duplicate gets its own annotations and fields
        page.setRotation(degrees(normalizeRotation(srcPage.getRotation().angle + p.rotation)));
      }
      if (options.sameWidth) {
        const shown = displayed({ width: page.getCropBox().width, height: page.getCropBox().height }, page.getRotation().angle);
        const s = targetWidth / shown.width;
        if (Math.abs(s - 1) > 1e-4) scalePage(page, s);
      }
      if (src && writer && options.footer) drawFooter(page, writer, src.input.name);
      contentPages.push(page);
      if (p.sourceId) {
        const key = `${p.sourceId}:${p.sourceIndex}`;
        if (!firstOut.has(key)) firstOut.set(key, page.ref);
        if (!firstOfSource.has(p.sourceId)) firstOfSource.set(p.sourceId, { ref: page.ref, number: out.getPageCount() });
      }
    }
    onProgress(0.2 + (0.7 * (n + 1)) / total);
  }

  if (tocPages.length && writer) {
    drawToc(tocPages, tocSize, tocEntries, (id) => {
      // The contents lists where each file starts after the cover (a cover source never appears here).
      return firstOfSource.get(id)!;
    }, writer);
  }

  // ---- form fields ----
  if (options.forms === "remove" || options.forms === "flatten") contentPages.forEach(removeWidgets);
  else {
    const forms: PDFDict[] = [];
    for (const src of loaded.values()) {
      if (src.kind !== "pdf") continue;
      const acro = src.doc.catalog.lookup(PDFName.of("AcroForm"));
      if (!(acro instanceof PDFDict)) continue;
      const slim = out.context.obj({}) as PDFDict;
      const dr = acro.get(PDFName.of("DR"));
      const da = acro.get(PDFName.of("DA"));
      if (dr) slim.set(PDFName.of("DR"), src.copier.copy(dr));
      if (da) slim.set(PDFName.of("DA"), da.clone());
      forms.push(slim);
    }
    buildAcroForm(out, contentPages, options.forms, forms);
  }

  // ---- bookmarks ----
  if (options.bookmarks !== "remove") {
    const order = [...firstOfSource.keys()];
    const items: OutBookmark[] = [];
    for (const id of order) {
      const src = loaded.get(id)!;
      const inner = src.kind === "pdf" && options.bookmarks !== "perFile" ? mapBookmarks(readOutline(src.doc), (i) => firstOut.get(`${id}:${i}`)) : [];
      if (options.bookmarks === "keep") items.push(...inner);
      else items.push({ title: baseName(src.input.name), page: firstOfSource.get(id)!.ref, children: inner });
    }
    writeOutline(out, items);
  }

  onProgress(0.95);
  const bytes = await out.save();
  onProgress(1);
  return { bytes, pageCount: out.getPageCount(), wasEncrypted };
}
