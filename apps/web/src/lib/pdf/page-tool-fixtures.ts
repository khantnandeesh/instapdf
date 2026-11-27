/**
 * Test-only: synthetic fixtures for the page tools' engine tests (spec F4/F5
 * §7 and "Improvement acceptance criteria"), generated in memory with
 * pdf-lib, plus pdf.js inspection helpers. Deterministic apart from pdf-lib's
 * font resource names. Never imported by app code.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, StandardFonts, degrees, type PDFPage } from "@cantoo/pdf-lib";

const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

async function base(count: number, label: (i: number) => string, size: [number, number] = [595, 842]) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer("fixtures");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 1; i <= count; i++) {
    const p = doc.addPage(size);
    p.drawText(label(i), { x: 60, y: size[1] - 80, size: 28, font });
    pages.push(p);
  }
  return { doc, pages, ctx: doc.context };
}

type OutlineSpec = { title: string; page: number; dest?: unknown[]; extra?: Record<string, unknown>; children?: OutlineSpec[] };

/** Writes an outline: `dest` is the destination tail (default /XYZ null null null). */
function addOutline(doc: PDFDocument, pages: PDFPage[], items: OutlineSpec[]) {
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const build = (list: OutlineSpec[], parent: PDFRef): PDFRef[] => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((it, i) => {
      const dict: Record<string, unknown> = { Title: PDFHexString.fromText(it.title), Parent: parent, Dest: [pages[it.page - 1].ref, ...(it.dest ?? ["XYZ", null, null, null])], ...it.extra };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < refs.length - 1) dict.Next = refs[i + 1];
      if (it.children?.length) {
        const kids = build(it.children, refs[i]);
        dict.First = kids[0];
        dict.Last = kids[kids.length - 1];
        if (!("Count" in dict)) dict.Count = kids.length;
      }
      ctx.assign(refs[i], ctx.obj(dict as never));
    });
    return refs;
  };
  const top = build(items, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: top[0], Last: top[top.length - 1], Count: items.length }));
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
}

/** `twelve.pdf`: 12 A4 pages "Twelve n"; Intro → p1, Middle → p5 (child Detail → p6), End → p10. */
export async function twelvePdf(): Promise<Uint8Array> {
  const { doc, pages } = await base(12, (i) => `Twelve ${i}`);
  addOutline(doc, pages, [
    { title: "Intro", page: 1 },
    { title: "Middle", page: 5, children: [{ title: "Detail", page: 6 }] },
    { title: "End", page: 10 },
  ]);
  return doc.save();
}

/** A4 pages with one label each, in order (`odd.pdf`, `short.pdf`, `duplex-scan.pdf` …). */
export async function labelledPdf(labels: string[]): Promise<Uint8Array> {
  const { doc } = await base(labels.length, (i) => labels[i - 1]);
  return doc.save();
}

/** `three-pages.pdf`-like: "Page 1".."Page 3". */
export async function threePagesPdf(): Promise<Uint8Array> {
  const { doc } = await base(3, (i) => `Page ${i}`);
  return doc.save();
}

/** `mixed-sizes.pdf`: 595×842, 792×612, 420×595, and 595×842 with /Rotate 90; "Mixed n". */
export async function mixedSizesPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes: [number, number][] = [[595, 842], [792, 612], [420, 595], [595, 842]];
  sizes.forEach(([w, h], i) => {
    const p = doc.addPage([w, h]);
    p.drawText(`Mixed ${i + 1}`, { x: 40, y: h - 60, size: 24, font });
    if (i === 3) p.setRotation(degrees(90));
  });
  return doc.save();
}

/** Incompressible RGB noise, about 43 KB for 120×120 (xorshift, seeded per page). */
function noise(seed: number, w = 120, h = 120): Uint8Array {
  const buf = new Uint8Array(w * h * 3);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    buf[i] = x & 255;
  }
  return buf;
}

/** A font dictionary with an incompressible embedded font program of `bytes` bytes (a stand-in for a big form font). */
export function bigFont(doc: PDFDocument, bytes: number, seed = 7): PDFRef {
  const ctx = doc.context;
  const program = ctx.register(ctx.stream(noise(seed, bytes / 3, 1), { Length1: bytes }));
  return ctx.register(ctx.obj({ Type: "Font", Subtype: "TrueType", BaseFont: "BigForm", FontDescriptor: ctx.obj({ Type: "FontDescriptor", FontName: "BigForm", FontFile2: program }) }));
}

/**
 * `shared-res.pdf` / `inherited-res.pdf`: 12 A4 pages "Shared n", page n
 * draws its own 120×120 image. One indirect resource dict holds all 12
 * images and the font: on every page (shared), or on the page-tree root with
 * no /Resources on the pages (inherited). With `form`, page 3 also has a
 * text field "name", and the AcroForm's /DR holds a 100 KB font.
 */
export async function sharedResPdf(layout: "shared" | "inherited", { form = false } = {}): Promise<Uint8Array> {
  const { doc, pages, ctx } = await base(12, (i) => `Shared ${i}`);
  if (form) {
    const field = doc.getForm().createTextField("name");
    field.setText("Ada");
    field.addToPage(pages[2], { x: 50, y: 500, width: 200, height: 24 });
    const acro = doc.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    let dr = acro.lookup(PDFName.of("DR"));
    if (!(dr instanceof PDFDict)) acro.set(PDFName.of("DR"), (dr = ctx.obj({})));
    let fonts = (dr as PDFDict).lookup(PDFName.of("Font"));
    if (!(fonts instanceof PDFDict)) (dr as PDFDict).set(PDFName.of("Font"), (fonts = ctx.obj({})));
    (fonts as PDFDict).set(PDFName.of("BigF"), bigFont(doc, 100_000));
  }
  const images: Record<string, PDFRef> = {};
  for (let i = 1; i <= 12; i++) {
    images[`Im${i}`] = ctx.register(ctx.stream(noise(i), { Type: "XObject", Subtype: "Image", Width: 120, Height: 120, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  }
  const fonts = ctx.obj({}) as PDFDict;
  for (const p of pages) {
    const f = p.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    for (const [k, v] of f.entries()) fonts.set(k, v);
  }
  const shared = ctx.register(ctx.obj({ Font: fonts, XObject: ctx.obj(images), ProcSet: ["PDF", "Text", "ImageC"] }));
  pages.forEach((p, i) => {
    const draw = ctx.register(ctx.stream(`q 300 0 0 300 150 300 cm /Im${i + 1} Do Q`));
    const c = p.node.get(PDFName.of("Contents"));
    const list = c instanceof PDFRef ? ctx.lookup(c) : c;
    if (list instanceof PDFArray) list.push(draw);
    else p.node.set(PDFName.of("Contents"), ctx.obj([c!, draw]));
    if (layout === "shared") p.node.set(PDFName.of("Resources"), shared);
    else p.node.delete(PDFName.of("Resources"));
  });
  if (layout === "inherited") doc.catalog.Pages().set(PDFName.of("Resources"), shared);
  return doc.save({ useObjectStreams: false });
}

/**
 * `links.pdf` (spec): 12 A4 pages "Link n". Page 1: L1 → [p3 /XYZ 0 400 0],
 * L2 → [p10 /XYZ 0 400 0], L3 named "chap2" (→ [p5 /XYZ 0 500 null]), L4 a
 * GoTo action → [p4 /Fit], L5 a URI link. Outline: Intro → p1; Middle →
 * [p5 /XYZ 0 421 null], red, bold, closed, child Detail → [p6 /XYZ 0 300 null];
 * End → [p10 /FitH 300]. Text field "name" = "Ada" on page 3. Info: Title,
 * Author, Subject, Keywords. /PageLayout /TwoColumnRight.
 */
export async function linksPdf(): Promise<Uint8Array> {
  const { doc, pages, ctx } = await base(12, (i) => `Link ${i}`);
  const link = (page: PDFPage, y: number, extra: Record<string, unknown>) => {
    const ref = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [50, y, 250, y + 20], Border: [0, 0, 0], ...extra } as never));
    let annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) {
      annots = ctx.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }
    (annots as PDFArray).push(ref);
  };
  link(pages[0], 700, { Dest: [pages[2].ref, "XYZ", 0, 400, 0] }); // L1
  link(pages[0], 660, { Dest: [pages[9].ref, "XYZ", 0, 400, 0] }); // L2
  link(pages[0], 620, { Dest: PDFString.of("chap2") }); // L3
  link(pages[0], 580, { A: ctx.obj({ S: "GoTo", D: [pages[3].ref, "Fit"] }) }); // L4
  link(pages[0], 540, { A: ctx.obj({ S: "URI", URI: PDFString.of("https://example.org/") }) }); // L5
  doc.catalog.set(PDFName.of("Names"), ctx.obj({ Dests: ctx.register(ctx.obj({ Names: [PDFString.of("chap2"), ctx.obj([pages[4].ref, "XYZ", 0, 500, null])] })) }));
  addOutline(doc, pages, [
    { title: "Intro", page: 1 },
    { title: "Middle", page: 5, dest: ["XYZ", 0, 421, null], extra: { C: [1, 0, 0], F: 2, Count: -1 }, children: [{ title: "Detail", page: 6, dest: ["XYZ", 0, 300, null] }] },
    { title: "End", page: 10, dest: ["FitH", 300] },
  ]);
  const field = doc.getForm().createTextField("name");
  field.setText("Ada");
  field.addToPage(pages[2], { x: 50, y: 600, width: 200, height: 24 });
  doc.setTitle("Links fixture");
  doc.setAuthor("QA");
  doc.setSubject("Fixture");
  doc.setKeywords(["alpha", "beta"]);
  doc.catalog.set(PDFName.of("PageLayout"), PDFName.of("TwoColumnRight"));
  return doc.save({ useObjectStreams: false });
}

// ---------------------------------------------------------------- inspection (pdf.js)

async function pdfjs(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}

/** Text of each page, joined. */
export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs(bytes);
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it) => ("str" in it ? it.str : "")).join("").trim());
  }
  await doc.loadingTask.destroy();
  return out;
}

export type Mark = { title: string; page: number; view: unknown[]; color: number[]; bold: boolean; italic: boolean; count?: number; children: Mark[] };

/** The outline as pdf.js reads it: 1-based target pages, destination views (after the page), colours, styles, counts. */
export async function outlineOf(bytes: Uint8Array): Promise<Mark[]> {
  const doc = await pdfjs(bytes);
  type Item = { title: string; dest: unknown; color: Uint8ClampedArray; bold: boolean; italic: boolean; count?: number; items: Item[] };
  const items = ((await doc.getOutline()) ?? []) as unknown as Item[];
  const map = async (list: Item[]): Promise<Mark[]> =>
    Promise.all(
      list.map(async (it) => {
        const dest = (typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest) as unknown[];
        const view = dest.slice(1).map((v) => (v && typeof v === "object" && "name" in v ? (v as { name: string }).name : v));
        return { title: it.title, page: 1 + (await doc.getPageIndex(dest[0] as never)), view, color: [...it.color], bold: it.bold, italic: it.italic, count: it.count, children: await map(it.items) };
      }),
    );
  const out = await map(items);
  await doc.loadingTask.destroy();
  return out;
}

export type LinkInfo = { page: number | null; view: unknown[]; url?: string };

/** Link annotations of a page as pdf.js resolves them: target page (1-based) and view, or the URL. */
export async function linksOf(bytes: Uint8Array, pageNumber: number): Promise<LinkInfo[]> {
  const doc = await pdfjs(bytes);
  const annots = (await (await doc.getPage(pageNumber)).getAnnotations()) as { subtype: string; dest?: unknown; url?: string }[];
  const out: LinkInfo[] = [];
  for (const a of annots.filter((x) => x.subtype === "Link")) {
    if (a.url) {
      out.push({ page: null, view: [], url: a.url });
      continue;
    }
    const dest = (typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest) as unknown[] | null;
    if (!dest) {
      out.push({ page: null, view: [] });
      continue;
    }
    let page: number | null = null;
    try {
      page = 1 + (await doc.getPageIndex(dest[0] as never));
    } catch {
      page = null;
    }
    out.push({ page, view: dest.slice(1).map((v) => (v && typeof v === "object" && "name" in v ? (v as { name: string }).name : v)) });
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Number of page objects (/Type /Page) anywhere in the file, reachable or not. */
export async function pageObjectCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Page")).length;
}

/**
 * F12 Extract images: page 1 draws a JPEG (stored as DCTDecode) and a PNG (stored Flate); page 2
 * draws the same PNG again and a 1x1 dot; page 3 has text only.
 */
export async function imagesPdf(jpg: Uint8Array, png: Uint8Array): Promise<Uint8Array> {
  const { doc, pages, ctx } = await base(3, (i) => `Images ${i}`);
  const photo = await doc.embedJpg(jpg);
  const drawing = await doc.embedPng(png);
  pages[0].drawImage(photo, { x: 60, y: 300, width: 150, height: 200 });
  pages[0].drawImage(drawing, { x: 260, y: 300, width: 200, height: 150 });
  pages[1].drawImage(drawing, { x: 60, y: 300, width: 200, height: 150 });
  const dot = ctx.register(ctx.stream(new Uint8Array([255, 0, 0]), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  const xobjects = pages[1].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
  xobjects.set(PDFName.of("Dot"), dot);
  const draw = ctx.register(ctx.stream("q 5 0 0 5 20 20 cm /Dot Do Q"));
  const contents = pages[1].node.lookup(PDFName.of("Contents"));
  if (contents instanceof PDFArray) contents.push(draw);
  else pages[1].node.set(PDFName.of("Contents"), ctx.obj([pages[1].node.get(PDFName.of("Contents"))!, draw]));
  return doc.save({ useObjectStreams: false });
}
