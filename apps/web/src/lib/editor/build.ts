/**
 * Builds the edited PDF (U-E8, AC-23–AC-27, AC-31, AC-41, AC-44, AC-69). Runs in a Web Worker;
 * pure apart from pdf-lib, unit tested in Node.
 *
 * Input: the current document bytes (the engine's output, with existing-text edits), the page
 * list and the added objects. The file is changed in place, so its outline, forms, metadata and
 * untouched pages survive:
 * - pages are re-ordered, duplicated (deep copies), inserted blank and turned (/Rotate);
 * - whiteout, shapes, lines, text, images and signatures are drawn into the page content in the
 *   objects' order (later = on top);
 * - text highlight/underline/strike-out become standard markup annotations, and freehand pen and
 *   marker strokes become ink annotations, each with an appearance stream so every viewer shows
 *   them the same;
 * - Producer is set to BerryPDF.
 */
import {
  LineCapStyle,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFString,
  degrees,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFRef,
  LineJoinStyle,
} from "@cantoo/pdf-lib";
import type { FormState } from "@/lib/forms/types";
import { covers, faceOf, type EditorFontManifest, type FaceEntry } from "./fonts";
import { norm360, pageSize, totalRotation, type EditorObject, type InkObj, type MarkupObj, type PageEntry, type Pt } from "./model";
import { alignOffset, baselineOffset } from "./text-layout";
import { color255, needsShaping, type ShapedLine } from "./shaping";
import { arrowHead, boxPoint, fitTypedSize, hexToRgb, quadPoints, svgPolyline, toPdf, typedSignatureSize } from "./draw-math";

export { arrowHead, boxPoint, hexToRgb, quadPoints, svgPolyline, toPdf, typedSignatureSize };

export const PRODUCER = "BerryPDF";

export type Asset = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };

export type BuildInput = {
  bytes: Uint8Array;
  password?: string;
  pages: PageEntry[];
  objects: EditorObject[];
  assets: Record<string, Asset>;
  /** Form fields (lib/forms): the form now and as it was read from the file. Absent: left as is. */
  forms?: { state: FormState; original: FormState };
  /** Library and user faces the objects use (fonts-browser fontsForBuild), and the user's own font bytes. */
  fonts?: { faces: EditorFontManifest["faces"]; bytes: Record<string, Uint8Array>; labels?: Record<string, string> };
};

/** Font files on this device: the editor faces, and the Noto fallback for other scripts. */
export type BuildFonts = {
  manifest: () => Promise<EditorFontManifest>;
  load: (file: string) => Promise<Uint8Array>;
  /** Noto Sans slices (lib/pdf/text.ts manifest) for characters the chosen face lacks. */
  fallback?: { manifest: () => Promise<{ fonts: { file: string; ranges: [number, number][] }[] }>; load: (file: string) => Promise<Uint8Array>; forms?: () => Promise<Uint8Array> };
};

const color = (hex: string) => rgb(...hexToRgb(hex));
/** The engine draws shaped lines solid: a see-through one gets the colour it would show on white paper. */
const faded = (c: [number, number, number], opacity?: number): [number, number, number] => (opacity === undefined || opacity >= 1 ? c : (c.map((v) => 1 - (1 - v) * Math.max(0, opacity)) as [number, number, number]));

/**
 * Added text that needs shaping (Hindi, Arabic and similar, AC-224) is left for the shaping
 * engine: buildPdf measures each line with `measure` (the engine's shape() width), draws only its
 * underline, and pushes where the line goes to `lines`. The caller then draws them with addText.
 */
export type DeferShaped = {
  measure: (text: string, o: { font: string; bold: boolean; italic: boolean; size: number }) => Promise<number> | number;
  /** The family name the engine knows the box's face by. */
  family: (font: string) => string;
  lines: ShapedLine[];
};

type FontKit = Parameters<PDFDocument["registerFontkit"]>[0];

/** Text drawing with per-character font choice: the chosen face's files, then Noto, then "?". */
class TextFonts {
  private embedded = new Map<string, Promise<PDFFont>>();
  private charsets = new Map<PDFFont, Set<number>>();
  private fallback: { file: string; ranges: [number, number][] }[] | null = null;
  constructor(
    private doc: PDFDocument,
    private fonts: BuildFonts,
    private manifest: EditorFontManifest,
  ) {}

  private embed(file: string, load: (f: string) => Promise<Uint8Array>): Promise<PDFFont> {
    let p = this.embedded.get(file);
    if (!p) {
      p = load(file).then((b) => this.doc.embedFont(b, { subset: true }));
      this.embedded.set(file, p);
    }
    return p;
  }

  private has(font: PDFFont, cp: number): boolean {
    let set = this.charsets.get(font);
    if (!set) this.charsets.set(font, (set = new Set(font.getCharacterSet())));
    return set.has(cp);
  }

  face(id: string, bold: boolean, italic: boolean): FaceEntry {
    const f = faceOf(this.manifest, id, bold, italic);
    if (!f) throw new Error(`No font ${id}`);
    return f;
  }

  /** Splits text into runs of one font each. */
  async runs(face: FaceEntry, text: string): Promise<{ font: PDFFont; text: string }[]> {
    const out: { font: PDFFont; text: string }[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      let font: PDFFont | null = null;
      let piece = ch;
      for (const f of face.files) {
        if (!covers(f.ranges, cp)) continue;
        const pf = await this.embed(f.file, this.fonts.load);
        if (this.has(pf, cp)) {
          font = pf;
          break;
        }
      }
      if (!font && this.fonts.fallback) {
        this.fallback ??= (await this.fonts.fallback.manifest()).fonts;
        for (const f of this.fallback) {
          if (!covers(f.ranges, cp)) continue;
          const pf = await this.embed(`noto:${f.file}`, (k) => this.fonts.fallback!.load(k.slice(5)));
          if (this.has(pf, cp)) {
            font = pf;
            break;
          }
        }
      }
      if (!font) {
        font = await this.embed(face.files[0].file, this.fonts.load);
        piece = this.has(font, 0x3f) ? "?" : " ";
      }
      const last = out[out.length - 1];
      if (last && last.font === font) last.text += piece;
      else out.push({ font, text: piece });
    }
    return out;
  }

  async width(face: FaceEntry, text: string, size: number): Promise<number> {
    let w = 0;
    for (const r of await this.runs(face, text)) w += r.font.widthOfTextAtSize(r.text, size);
    return w;
  }

  /** Draws `text` with its baseline starting at frame point `p`, running `rot`° clockwise. */
  async draw(page: PDFPage, entry: PageEntry, face: FaceEntry, text: string, p: Pt, size: number, hex: string, rot: number, opacity?: number): Promise<number> {
    const r = (rot * Math.PI) / 180;
    let [x, y] = p;
    let total = 0;
    for (const run of await this.runs(face, text)) {
      const [px, py] = toPdf(entry, [x, y]);
      page.drawText(run.text, { x: px, y: py, size, font: run.font, color: color(hex), rotate: degrees(-rot), ...(opacity !== undefined && opacity < 1 ? { opacity } : {}) });
      const w = run.font.widthOfTextAtSize(run.text, size);
      x += Math.cos(r) * w;
      y += Math.sin(r) * w;
      total += w;
    }
    return total;
  }
}

/** Builds the edited PDF. */
/**
 * Z-order layers when shaped lines are drawn by the engine (AC-224): on each page, a new layer
 * starts at the first object pdf-lib draws after an object with shaped lines. Layer k is drawn
 * by pdf-lib, then the shaped lines of layer k by the engine, then layer k + 1, so an object added
 * after a shaped line (a whiteout over it, say) prints over it, as on screen. Shaped boxes with no
 * other object between them share a layer, so they take one engine pass (their plain lines, if
 * any, are drawn by pdf-lib under all of that layer's shaped lines).
 */
export function shapedLayers(input: Pick<BuildInput, "objects">): { layers: Map<string, number>; count: number } {
  const layers = new Map<string, number>();
  const at = new Map<string, { k: number; shaped: boolean }>();
  let count = 1;
  for (const o of input.objects) {
    const p = at.get(o.page) ?? { k: 0, shaped: false };
    const shaped = o.kind === "text" && o.lines.some(needsShaping);
    // pdf-lib draws this one after shaped lines: it opens the next layer.
    if (!shaped && p.shaped) p.k++;
    p.shaped = shaped;
    at.set(o.page, p);
    layers.set(o.id, p.k);
    count = Math.max(count, p.k + 1);
  }
  return { layers, count };
}

/** One z-order pass: draw only `layer`'s objects; pages are arranged in the first pass only. */
export type BuildPass = { layer: number; layers: Map<string, number>; /** The last pdf-lib pass: forms are written here. */ last: boolean };

export async function buildPdf(input: BuildInput, fonts: BuildFonts, fontkit?: FontKit, shaped?: DeferShaped, pass?: BuildPass): Promise<Uint8Array> {
  const probe = await PDFDocument.load(input.bytes, { ignoreEncryption: true, updateMetadata: false });
  const doc = probe.isEncrypted ? await PDFDocument.load(input.bytes, { password: input.password ?? "", updateMetadata: false }) : probe;
  if (fontkit) doc.registerFontkit(fontkit);
  const arrange = !pass || pass.layer === 0;
  const objects = pass ? input.objects.filter((o) => pass.layers.get(o.id) === pass.layer) : input.objects;

  // ---- pages: order, copies, blanks, rotation (later passes get them arranged already) ----
  const source = doc.getPages();
  // Each source page object goes to one entry: the original (id p<src>) when it is still there,
  // else the first copy. The others are copies. So a copy moved before its original never takes
  // the original's widgets (their /P and the form model both point at the original).
  const ids = new Set(input.pages.map((p) => p.id));
  const owner = new Map<number, string>();
  for (const e of input.pages) if (e.src != null && !owner.has(e.src)) owner.set(e.src, ids.has(`p${e.src}`) ? `p${e.src}` : e.id);
  const out: PDFPage[] = arrange ? [] : source;
  if (arrange) for (const entry of input.pages) {
    let page: PDFPage;
    if (entry.src == null) {
      page = PDFPage.create(doc);
      const { w, h } = pageSize(entry);
      page.setSize(w, h);
    } else if (owner.get(entry.src) === entry.id) {
      page = source[entry.src];
    } else {
      [page] = await doc.copyPages(doc, [entry.src]);
      // The copy's widgets would be fields outside the form; the form model adds this page's own.
      if (input.forms) dropWidgets(page);
    }
    out.push(page);
  }
  if (arrange) {
    setPageOrder(doc, out);
    out.forEach((page, i) => {
      const entry = input.pages[i];
      const rotation = totalRotation(entry);
      if (entry.rotate || norm360(page.getRotation().angle) !== rotation) page.setRotation(degrees(rotation));
    });
  }

  // ---- objects ----
  const needsFonts = objects.some((o) => o.kind === "text" || (o.kind === "signature" && o.sig.type === "typed"));
  const text = needsFonts ? new TextFonts(doc, fonts, await fonts.manifest()) : null;
  const images = new Map<string, Promise<PDFImage>>();
  const image = (id: string) => {
    let p = images.get(id);
    if (!p) {
      const a = input.assets[id];
      if (!a) throw new Error(`Missing image ${id}`);
      p = a.mime === "image/png" ? doc.embedPng(a.bytes) : doc.embedJpg(a.bytes);
      images.set(id, p);
    }
    return p;
  };
  const byPage = new Map(input.pages.map((p, i) => [p.id, i]));

  for (const o of objects) {
    const i = byPage.get(o.page);
    if (i == null) continue;
    const page = out[i];
    const entry = input.pages[i];
    switch (o.kind) {
      case "whiteout": {
        const [x, y] = toPdf(entry, [o.x, o.y + o.h]);
        page.drawRectangle({
          x,
          y,
          width: o.w,
          height: o.h,
          color: color(o.fill),
          ...(o.border && o.borderWidth > 0 ? { borderColor: color(o.border), borderWidth: o.borderWidth } : {}),
        });
        break;
      }
      case "shape": {
        const stroke = o.stroke && o.width > 0 ? { borderColor: color(o.stroke), borderWidth: o.width } : {};
        const filled = o.fill ? { color: color(o.fill) } : {};
        if (o.shape === "rect") {
          const [x, y] = toPdf(entry, boxPoint(o, o.rot, 0, o.h));
          page.drawRectangle({ x, y, width: o.w, height: o.h, rotate: degrees(-o.rot), ...filled, ...stroke });
        } else {
          const [x, y] = toPdf(entry, [o.x + o.w / 2, o.y + o.h / 2]);
          page.drawEllipse({ x, y, xScale: o.w / 2, yScale: o.h / 2, rotate: degrees(-o.rot), ...filled, ...stroke });
        }
        break;
      }
      case "line": {
        const segs: [Pt, Pt][] = [[o.a, o.b]];
        if (o.arrow) for (const h of arrowHead(o.a, o.b, o.width)) segs.push([o.b, h]);
        for (const [a, b] of segs) {
          const [ax, ay] = toPdf(entry, a);
          const [bx, by] = toPdf(entry, b);
          page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: o.width, color: color(o.stroke), lineCap: LineCapStyle.Round });
        }
        break;
      }
      case "text": {
        const face = text!.face(o.font, o.bold, o.italic);
        for (let li = 0; li < o.lines.length; li++) {
          const line = o.lines[li];
          if (!line) continue;
          const defer = !!shaped && needsShaping(line);
          const lw = defer ? await shaped.measure(line, o) : await text!.width(face, line, o.size);
          const lx = alignOffset(o.align, o.w, lw);
          const base = baselineOffset(face, o.size, li);
          if (defer) {
            // Right alignment is x = right − width, so the line ends at the box's right edge.
            const [x, y] = toPdf(entry, boxPoint(o, o.rot, lx, base));
            shaped.lines.push({ page: i, text: line, font: o.font, families: [shaped.family(o.font), "Noto Sans"], bold: o.bold, italic: o.italic, size: o.size, x, y, angle: -o.rot, color: color255(faded(hexToRgb(o.color), o.opacity)) });
          } else await text!.draw(page, entry, face, line, boxPoint(o, o.rot, lx, base), o.size, o.color, o.rot, o.opacity);
          if (o.underline) {
            const t = Math.max(0.5, o.size * 0.06);
            const a = toPdf(entry, boxPoint(o, o.rot, lx, base + o.size * 0.12));
            const b = toPdf(entry, boxPoint(o, o.rot, lx + lw, base + o.size * 0.12));
            page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: t, color: color(o.color) });
          }
        }
        break;
      }
      case "image": {
        const img = await image(o.asset);
        const [x, y] = toPdf(entry, boxPoint(o, o.rot, 0, o.h));
        page.drawImage(img, { x, y, width: o.w, height: o.h, rotate: degrees(-o.rot), opacity: o.opacity });
        break;
      }
      case "signature": {
        const sig = o.sig;
        if (sig.type === "image") {
          const img = await image(sig.asset);
          const [x, y] = toPdf(entry, boxPoint(o, o.rot, 0, o.h));
          page.drawImage(img, { x, y, width: o.w, height: o.h, rotate: degrees(-o.rot) });
        } else if (sig.type === "typed") {
          const face = text!.face(sig.face, false, false);
          const full = typedSignatureSize(o.h, face);
          const size = fitTypedSize(full, await text!.width(face, sig.text, full), o.w);
          const tw = await text!.width(face, sig.text, size);
          const base = (o.h - (face.ascent + face.descent) * size) / 2 + face.ascent * size;
          await text!.draw(page, entry, face, sig.text, boxPoint(o, o.rot, (o.w - tw) / 2, base), size, o.color, o.rot);
        } else {
          const width = Math.max(0.6, Math.min(o.w, o.h) * 0.035);
          for (const s of sig.strokes) {
            const pts = s.map(([u, v]) => boxPoint(o, o.rot, u * o.w, v * o.h));
            if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1]]);
            page.drawSvgPath(svgPolyline(pts), { x: entry.view[0], y: entry.view[3], borderColor: color(o.color), borderWidth: width, borderLineCap: LineCapStyle.Round });
          }
        }
        break;
      }
      case "ink":
        addAnnot(doc, page, inkAnnot(doc, entry, o));
        break;
      case "markup":
        addAnnot(doc, page, markupAnnot(doc, entry, o));
        break;
    }
  }

  // ---- form fields (F16 E3): only when the form changed, so an untouched form stays as it was ----
  // Once, in the last pdf-lib pass (pages are arranged by then); the engine's shaped lines after
  // it are an incremental update that keeps the form as written.
  if (input.forms && input.forms.state !== input.forms.original && (!pass || pass.last)) {
    const { applyForms } = await import("@/lib/forms/write");
    await applyForms(doc, out, input.pages, input.forms.state, input.forms.original, { fonts: fonts.fallback, fontkit });
  }

  doc.setProducer(PRODUCER);
  doc.setModificationDate(new Date());
  // Field appearances are written by applyForms only: fields the user didn't touch stay as they
  // came, even without an appearance (pdf-lib would draw them in Helvetica, without borders).
  return doc.save({ updateFieldAppearances: false });
}

/** Removes widget annotations from a copied page (see the page copy above). */
function dropWidgets(page: PDFPage) {
  const annots = page.node.Annots();
  if (!annots) return;
  for (let i = annots.size() - 1; i >= 0; i--) {
    const a = annots.lookup(i);
    if (a instanceof PDFDict && a.get(PDFName.of("Subtype")) === PDFName.of("Widget")) annots.remove(i);
  }
}

/**
 * Makes `pages` the document's pages, in order, as direct kids of the root page tree node. Each
 * page first takes its inherited attributes (Resources, MediaBox, CropBox, Rotate) as its own, so
 * flattening the tree changes nothing it shows. Pages left out are no longer reachable.
 */
function setPageOrder(doc: PDFDocument, pages: PDFPage[]) {
  for (const page of pages) {
    for (const name of ["Resources", "MediaBox", "CropBox", "Rotate"]) {
      const key = PDFName.of(name);
      if (page.node.get(key)) continue;
      const inherited = page.node.getInheritableAttribute(key);
      if (inherited) page.node.set(key, inherited);
    }
  }
  const rootRef = doc.catalog.get(PDFName.of("Pages")) as PDFRef;
  const root = doc.catalog.Pages();
  for (const name of ["Resources", "MediaBox", "CropBox", "Rotate"]) root.delete(PDFName.of(name));
  root.set(PDFName.of("Kids"), doc.context.obj(pages.map((p) => p.ref)));
  root.set(PDFName.of("Count"), PDFNumber.of(pages.length));
  for (const page of pages) page.node.set(PDFName.of("Parent"), rootRef);
  // pdf-lib caches its page list: reload it from the new tree.
  (doc as unknown as { pageCache: { invalidate: () => void } }).pageCache.invalidate();
  (doc as unknown as { pageCount: number }).pageCount = pages.length;
}

// ---- annotations ------------------------------------------------------------------------------

function addAnnot(doc: PDFDocument, page: PDFPage, ref: PDFRef) {
  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

const pdfDate = (d = new Date()) => `D:${d.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;

function rectOf(points: Pt[], pad: number): [number, number, number, number] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

function appearance(doc: PDFDocument, rect: [number, number, number, number], ops: PDFOperator[], gs?: { opacity: number; multiply: boolean }) {
  const dict: Record<string, unknown> = { BBox: rect, Matrix: [1, 0, 0, 1, 0, 0] };
  if (gs) {
    dict.Resources = { ExtGState: { GS0: doc.context.obj({ Type: "ExtGState", CA: gs.opacity, ca: gs.opacity, ...(gs.multiply ? { BM: "Multiply" } : {}) }) } };
    ops = [pushGraphicsState(), setGraphicsState("GS0"), ...ops, popGraphicsState()];
  }
  return doc.context.register(doc.context.formXObject(ops, dict as never));
}

function inkAnnot(doc: PDFDocument, entry: PageEntry, o: InkObj): PDFRef {
  const pts = o.points.map((p) => toPdf(entry, p));
  if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1]]);
  const rect = rectOf(pts, o.width / 2 + 1);
  const [r, g, b] = hexToRgb(o.color);
  const ops: PDFOperator[] = [setStrokingRgbColor(r, g, b), setLineWidth(o.width), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round), moveTo(...pts[0])];
  for (const p of pts.slice(1)) ops.push(lineTo(...p));
  ops.push(stroke());
  const opacity = o.marker ? 0.4 : 1;
  const ap = appearance(doc, rect, ops, o.marker ? { opacity, multiply: true } : undefined);
  return doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Ink",
      Rect: rect,
      InkList: [pts.flat()],
      C: [r, g, b],
      CA: opacity,
      BS: { W: o.width },
      F: 4,
      M: PDFString.of(pdfDate()),
      NM: PDFString.of(o.id),
      AP: { N: ap },
      ...(o.marker ? { IT: "InkHighlight" } : {}),
    }),
  );
}

const SUBTYPES = { highlight: "Highlight", underline: "Underline", strike: "StrikeOut" } as const;

function markupAnnot(doc: PDFDocument, entry: PageEntry, o: MarkupObj): PDFRef {
  const corners = o.rects.flatMap((q) => [toPdf(entry, [q.x, q.y]), toPdf(entry, [q.x + q.w, q.y + q.h])]);
  const rect = rectOf(corners, 1);
  const [r, g, b] = hexToRgb(o.color);
  const ops: PDFOperator[] = [];
  if (o.type === "highlight") {
    ops.push(setFillingRgbColor(r, g, b));
    for (const q of o.rects) {
      const [x, y] = toPdf(entry, [q.x, q.y + q.h]);
      ops.push(rectangle(x, y, q.w, q.h));
    }
    ops.push(fill());
  } else {
    ops.push(setStrokingRgbColor(r, g, b));
    for (const q of o.rects) {
      const t = Math.max(0.6, q.h * 0.07);
      const yy = o.type === "underline" ? q.y + q.h - t * 1.5 : q.y + q.h * 0.55;
      const [x0, y0] = toPdf(entry, [q.x, yy]);
      ops.push(setLineWidth(t), moveTo(x0, y0), lineTo(x0 + q.w, y0), stroke());
    }
  }
  const ap = appearance(doc, rect, ops, o.type === "highlight" ? { opacity: 1, multiply: true } : undefined);
  return doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: SUBTYPES[o.type],
      Rect: rect,
      QuadPoints: quadPoints(entry, o.rects),
      C: [r, g, b],
      F: 4,
      M: PDFString.of(pdfDate()),
      NM: PDFString.of(o.id),
      ...(o.text ? { Contents: PDFHexString.fromText(o.text) } : {}),
      AP: { N: ap },
    }),
  );
}

