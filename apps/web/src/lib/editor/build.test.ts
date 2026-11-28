import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import fontkit from "@cantoo/fontkit";
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from "@cantoo/pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { arrowHead, boxPoint, buildPdf, hexToRgb, quadPoints, shapedLayers, toPdf, type DeferShaped } from "./build";
import type { BerryDocument } from "./berry-engine";
import { buildShaped, familyOf, type ShapingEngine } from "./shaped-text";
import type { ShapingManifest } from "./shaping";
import { addField, createField, setValue } from "@/lib/forms/model";
import { readFormFromBytes } from "@/lib/forms/read";
import { duplicatePage, initialPages, type DocState, type EditorObject, type PageEntry } from "./model";
import { baselineOffset } from "./text-layout";

import { nodeFonts, parse } from "./node-fonts";

async function source(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Original page ${i + 1}`, { x: 50, y: 700, size: 20, font });
  }
  doc.getPage(2).setRotation(degrees(90));
  return doc.save();
}

async function pdfText(bytes: Uint8Array): Promise<{ texts: string[]; items: { str: string; x: number; y: number; font: string }[][]; fonts: string[][] }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const texts: string[] = [];
  const items: { str: string; x: number; y: number; font: string }[][] = [];
  const fonts: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const list = content.items.filter((it) => "str" in it) as { str: string; transform: number[]; fontName: string }[];
    texts.push(list.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim());
    items.push(list.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], font: it.fontName })));
    fonts.push(Object.values(content.styles).map((s) => (s as { fontFamily: string }).fontFamily));
    await page.getOperatorList();
  }
  await task.destroy();
  return { texts, items, fonts };
}

const PNG_1x1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

describe("helpers", () => {
  it("converts colours and frame points", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(toPdf({ view: [10, 20, 610, 820] }, [5, 5])).toEqual([15, 815]);
  });

  it("turns box points about the centre", () => {
    const p = boxPoint({ x: 0, y: 0, w: 100, h: 50 }, 180, 0, 0);
    expect(p[0]).toBeCloseTo(100);
    expect(p[1]).toBeCloseTo(50);
  });

  it("orders quad points upper-left, upper-right, lower-left, lower-right", () => {
    expect(quadPoints({ view: [0, 0, 100, 100] }, [{ x: 10, y: 10, w: 20, h: 5 }])).toEqual([10, 90, 30, 90, 10, 85, 30, 85]);
  });

  it("draws arrow heads behind the tip", () => {
    const [a, b] = arrowHead([0, 0], [100, 0], 2);
    expect(a[0]).toBeLessThan(100);
    expect(b[0]).toBeLessThan(100);
    expect(a[1]).toBeCloseTo(-b[1]);
  });
});

describe("buildPdf", () => {
  it("applies page actions: order, duplicate, blank, rotation, delete (AC-41)", async () => {
    const fonts = await nodeFonts();
    const pages = initialPages(Array.from({ length: 3 }, (_, i) => ({ view: [0, 0, 600, 800] as [number, number, number, number], rotate: i === 2 ? 90 : 0 })));
    const edited: PageEntry[] = [
      { ...pages[1], rotate: 90 },
      pages[0],
      { ...pages[0], id: "dup" },
      { id: "blank", src: null, view: [0, 0, 300, 400], baseRotate: 0, rotate: 0 },
      { ...pages[2], rotate: 270 },
    ];
    const out = await buildPdf({ bytes: await source(), pages: edited, objects: [], assets: {} }, fonts, fontkit);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(5);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 0, 0, 0]);
    expect(doc.getPage(3).getSize()).toEqual({ width: 300, height: 400 });
    expect(doc.getProducer()).toBe("BerryPDF");
    const { texts } = await pdfText(out);
    expect(texts[0]).toContain("Original page 2");
    expect(texts[1]).toContain("Original page 1");
    expect(texts[2]).toContain("Original page 1");
    expect(texts[3]).toBe("");
    expect(texts[4]).toContain("Original page 3");
  });

  it("writes added text as real text in the chosen font at its position (AC-23, AC-91)", async () => {
    const fonts = await nodeFonts();
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 90 }]);
    const objects: EditorObject[] = [
      { kind: "text", id: "t", page: "p0", x: 100, y: 200, wrap: null, lines: ["Signed by A. Rao", "₹ 5,000 · नमस्ते"], w: 200, h: 30, rot: 0, text: "", font: "tinos", size: 12, bold: true, italic: false, underline: true, color: "#1a49c7", align: "left" },
    ];
    const out = await buildPdf({ bytes: await source(), pages, objects, assets: {} }, fonts, fontkit);
    const { texts, items } = await pdfText(out);
    expect(texts[0]).toContain("Signed by A. Rao");
    expect(texts[0]).toContain("₹ 5,000");
    expect(texts[0].replace(/ /g, "")).toContain("नमस्ते");
    const first = items[0].find((i) => i.str.startsWith("Signed"))!;
    const face = fonts.manifestValue.faces.tinos["700-normal"];
    expect(first.x).toBeCloseTo(100, 0);
    expect(first.y).toBeCloseTo(800 - 200 - baselineOffset(face, 12), 0);
    const doc = await PDFDocument.load(out);
    const fontsDict = doc.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const names = fontsDict.keys().map((k) => fontsDict.lookup(k, PDFDict).lookup(PDFName.of("BaseFont"))!.toString());
    expect(names.some((n) => /Tinos-Bold/.test(n))).toBe(true);
  });

  it("draws whiteout, shapes, lines, images and signatures, and writes markup and ink annotations (AC-24–AC-27, AC-31)", async () => {
    const fonts = await nodeFonts();
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 90 }]);
    const objects: EditorObject[] = [
      { kind: "whiteout", id: "w", page: "p0", x: 40, y: 80, w: 300, h: 40, fill: "#ffffff", border: "#000000", borderWidth: 1 },
      { kind: "shape", id: "r", page: "p0", shape: "rect", x: 10, y: 300, w: 100, h: 60, rot: 30, stroke: "#c8102e", fill: "#ffe14d", width: 2 },
      { kind: "shape", id: "e", page: "p0", shape: "ellipse", x: 200, y: 300, w: 100, h: 60, rot: 0, stroke: "#000000", fill: null, width: 1 },
      { kind: "line", id: "l", page: "p0", arrow: true, a: [10, 500], b: [200, 520], stroke: "#000000", width: 2 },
      { kind: "image", id: "i", page: "p1", x: 10, y: 10, w: 100, h: 100, rot: 90, asset: "a1", opacity: 0.8 },
      { kind: "signature", id: "s1", page: "p1", x: 300, y: 600, w: 160, h: 50, rot: 0, role: "signature", sig: { type: "typed", text: "Asha Rao", face: "great-vibes" }, color: "#1a49c7" },
      { kind: "signature", id: "s2", page: "p1", x: 300, y: 680, w: 80, h: 40, rot: 0, role: "initials", sig: { type: "drawn", strokes: [[[0, 0], [1, 1]], [[0, 1]]], aspect: 2 }, color: "#000000" },
      { kind: "markup", id: "m1", page: "p0", type: "highlight", rects: [{ x: 50, y: 80, w: 100, h: 20 }], color: "#ffe14d", text: "Original" },
      { kind: "markup", id: "m2", page: "p0", type: "underline", rects: [{ x: 50, y: 80, w: 100, h: 20 }], color: "#1a49c7", text: "" },
      { kind: "markup", id: "m3", page: "p0", type: "strike", rects: [{ x: 50, y: 80, w: 100, h: 20 }], color: "#c8102e", text: "" },
      { kind: "ink", id: "k1", page: "p2", points: [[10, 10], [50, 60], [90, 20]], color: "#000000", width: 2.5, marker: false },
      { kind: "ink", id: "k2", page: "p2", points: [[10, 100], [90, 100]], color: "#ffe14d", width: 12, marker: true },
    ];
    const out = await buildPdf({ bytes: await source(), pages, objects, assets: { a1: { bytes: PNG_1x1, mime: "image/png" } } }, fonts, fontkit);
    const doc = await PDFDocument.load(out);
    const subtypes = (i: number) =>
      (doc.getPage(i).node.Annots()?.asArray() ?? []).map((r) => {
        const d = doc.context.lookup(r, PDFDict);
        return [d.get(PDFName.of("Subtype"))!.toString(), !!d.get(PDFName.of("AP"))] as const;
      });
    expect(subtypes(0)).toEqual([
      ["/Highlight", true],
      ["/Underline", true],
      ["/StrikeOut", true],
    ]);
    expect(subtypes(2)).toEqual([
      ["/Ink", true],
      ["/Ink", true],
    ]);
    const hl = doc.context.lookup(doc.getPage(0).node.Annots()!.get(0), PDFDict);
    expect(hl.lookup(PDFName.of("QuadPoints"), PDFArray).size()).toBe(8);
    const xobjects = doc.getPage(1).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    expect(xobjects.keys().length).toBe(1);
    const { texts } = await pdfText(out);
    expect(texts[1]).toContain("Asha Rao");
  });

  it("writes added CJK text so it extracts as one word, without spaces between characters", async () => {
    const fonts = await nodeFonts();
    const jp = dirname(require.resolve("@fontsource/noto-sans-jp/package.json"));
    const jpRanges = JSON.parse(await readFile(join(jp, "unicode.json"), "utf8")) as Record<string, string>;
    const jpFiles = Object.entries(jpRanges).map(([k, r]) => ({ file: `noto-sans-jp-${k.replace(/[[\]]/g, "")}-400-normal.woff`, ranges: parse(r) }));
    const base = await fonts.fallback!.manifest();
    fonts.fallback = {
      manifest: async () => ({ fonts: [...base.fonts, ...jpFiles] }),
      load: async (f: string) => new Uint8Array(await readFile(f.startsWith("noto-sans-jp-") ? join(jp, "files", f) : join(dirname(require.resolve("@fontsource/noto-sans/package.json")), "files", f))),
    };
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }]);
    const objects: EditorObject[] = [
      { kind: "text", id: "t", page: "p0", x: 100, y: 200, wrap: null, lines: ["日本語のテキスト"], w: 200, h: 20, rot: 0, text: "日本語のテキスト", font: "arimo", size: 14, bold: false, italic: false, underline: false, color: "#000000", align: "left" },
    ];
    const out = await buildPdf({ bytes: await source(), pages: pages.slice(0, 1), objects, assets: {} }, fonts, fontkit);
    const { items } = await pdfText(out);
    // Characters from different Noto subset files are separate pdf.js items, but they sit edge to
    // edge (full-width glyphs, 14 pt each) with no gap, so extractors that join by position (pdfium,
    // Acrobat, the pdf.js text layer) read one word. A space only appears when items are joined with one.
    const parts = items[0].filter((i) => /[\u3040-\u30ff\u4e00-\u9fff]/u.test(i.str));
    expect(parts.map((i) => i.str).join("")).toBe("日本語のテキスト");
    for (let k = 1; k < parts.length; k++) expect(parts[k]!.x - parts[k - 1]!.x).toBeCloseTo(14 * [...parts[k - 1]!.str].length, 1);
    expect(new Set(parts.map((i) => i.y)).size).toBe(1);
  });

  it("puts objects on the right copy of a duplicated page and draws them in order (AC-69)", async () => {
    const fonts = await nodeFonts();
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }]);
    const withDup: PageEntry[] = [pages[0], { ...pages[0], id: "copy" }];
    const objects: EditorObject[] = [
      { kind: "text", id: "t1", page: "copy", x: 10, y: 10, wrap: null, lines: ["only on the copy"], w: 100, h: 15, rot: 0, text: "", font: "arimo", size: 12, bold: false, italic: false, underline: false, color: "#000000", align: "left" },
    ];
    const out = await buildPdf({ bytes: await source(), pages: withDup, objects, assets: {} }, fonts, fontkit);
    const { texts } = await pdfText(out);
    expect(texts[0]).not.toContain("only on the copy");
    expect(texts[1]).toContain("only on the copy");
  });
  it("with no form, a copy moved before its original keeps content, annotations and objects on the right pages", async () => {
    const fonts = await nodeFonts();
    const src = await PDFDocument.load(await source());
    // A link annotation on page 1 that every copy should carry.
    const link = src.context.obj({ Type: "Annot", Subtype: "Link", Rect: [50, 50, 150, 80], Border: [0, 0, 0] });
    src.getPage(0).node.set(PDFName.of("Annots"), src.context.obj([src.context.register(link)]));
    const bytes = await src.save();
    const pages = initialPages(Array.from({ length: 3 }, (_, i) => ({ view: [0, 0, 600, 800] as [number, number, number, number], rotate: i === 2 ? 90 : 0 })));
    const copy: PageEntry = { ...pages[0], id: "copy", rotate: 90 };
    const order = [copy, pages[1], pages[0]];
    const objects: EditorObject[] = [
      { kind: "shape", id: "on-copy", page: "copy", shape: "rect", x: 10, y: 10, w: 50, h: 50, rot: 0, stroke: "#000000", fill: "#ff0000", width: 1 },
      { kind: "shape", id: "on-original", page: "p0", shape: "rect", x: 10, y: 10, w: 50, h: 50, rot: 0, stroke: "#000000", fill: "#0000ff", width: 1 },
    ];
    const out = await buildPdf({ bytes, pages: order, objects, assets: {} }, fonts, fontkit);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 0]);
    const { texts } = await pdfText(out);
    expect(texts).toEqual([expect.stringContaining("Original page 1"), expect.stringContaining("Original page 2"), expect.stringContaining("Original page 1")]);
    const links = (i: number) => (doc.getPage(i).node.lookup(PDFName.of("Annots"), PDFArray)?.size() ?? 0);
    expect([links(0), links(1), links(2)]).toEqual([1, 0, 1]);
    // Each copy got only its own object: red on page 1, blue on page 3.
    const fills = async (i: number) => {
      const c = doc.getPage(i).node.Contents();
      const raw = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
      const { decodePDFRawStream } = await import("@cantoo/pdf-lib");
      return raw.map((x) => new TextDecoder().decode(decodePDFRawStream(x as never).decode())).join("\n");
    };
    expect(await fills(0)).toMatch(/1 0 0 rg/);
    expect(await fills(0)).not.toMatch(/0 0 1 rg/);
    expect(await fills(2)).toMatch(/0 0 1 rg/);
    expect(await fills(2)).not.toMatch(/1 0 0 rg/);
  });

  it("writes form changes with page actions: filled values, new fields, and widgets on a duplicated page (F16 E3)", async () => {
    const fonts = await nodeFonts();
    const src = await PDFDocument.create();
    for (let i = 0; i < 2; i++) src.addPage([600, 800]);
    const tf = src.getForm().createTextField("name");
    tf.addToPage(src.getPage(0), { x: 50, y: 700, width: 200, height: 20 });
    const bytes = await src.save();
    const { form } = await readFormFromBytes(bytes);
    const pages = initialPages(Array.from({ length: 2 }, () => ({ view: [0, 0, 600, 800] as [number, number, number, number], rotate: 0 })));
    let doc: DocState = { pages, objects: [], engine: 0, forms: form };
    doc = duplicatePage(doc, "p0").state;
    const copy = doc.pages[1];
    expect(copy.src).toBe(0);
    let state = doc.forms!;
    expect(state.fields[0].widgets.map((w) => w.page)).toEqual(["p0", copy.id]);
    state = setValue(state, state.fields[0].id, "Ada").state;
    const box = createField(state, { kind: "checkbox", page: "p1", box: { x: 40, y: 40, w: 14, h: 14 } });
    state = addField(state, box);
    // Reverse the order too: widgets follow their pages.
    const order = [doc.pages[2], doc.pages[1], doc.pages[0]];
    const out = await buildPdf({ bytes, pages: order, objects: [], assets: {}, forms: { state, original: form } }, fonts, fontkit);
    const back = await PDFDocument.load(out);
    const f = back.getForm();
    expect(f.getTextField("name").getText()).toBe("Ada");
    expect(f.getCheckBox(box.name).isChecked()).toBe(false);
    const widgets = f.getTextField("name").acroField.getWidgets();
    expect(widgets).toHaveLength(2);
    const outPages = back.getPages();
    const onPage = (i: number) => (outPages[i].node.Annots()?.asArray() ?? []).length;
    // Page order out: p1 (checkbox), the copy (name), p0 (name). No stray widgets from the copy.
    expect([onPage(0), onPage(1), onPage(2)]).toEqual([1, 1, 1]);
    const pRefs = widgets.map((w) => w.P());
    expect(new Set(pRefs.map(String)).size).toBe(2);
    expect(pRefs.every((r) => outPages.some((p) => p.ref === r))).toBe(true);
  });
});

// ---- complex scripts (AC-224) -------------------------------------------------------------------

/** The shaping build of the engine, straight from public/engine (copied there by the engine build). */
async function shapingEngine(): Promise<ShapingEngine> {
  const dir = new URL("../../../public/engine/", import.meta.url);
  const mod = (await import(/* @vite-ignore */ new URL("berry_engine_shaping.js", dir).href)) as ShapingEngine & { initSync: (o: { module: BufferSource }) => unknown };
  mod.initSync({ module: await readFile(new URL("berry_engine_shaping_bg.wasm", dir)) });
  return mod;
}

/** The shaping fonts the way scripts/copy-fonts.mjs lists them, read from node_modules. */
async function nodeShapingFonts(): Promise<{ manifest: ShapingManifest; load: (url: string) => Promise<Uint8Array> }> {
  const list = [
    { family: "Noto Naskh Arabic", pkg: "noto-naskh-arabic", key: "arabic" },
    { family: "Noto Sans Devanagari", pkg: "noto-sans", key: "devanagari" },
    { family: "Noto Sans", pkg: "noto-sans", key: "latin" },
  ];
  const where = new Map<string, string>();
  const fonts = [];
  for (const { family, pkg, key } of list) {
    const root = dirname(require.resolve(`@fontsource/${pkg}/package.json`));
    const unicode = JSON.parse(await readFile(join(root, "unicode.json"), "utf8"));
    const url = `/fonts/x/${pkg}-${key}-400-normal.woff`;
    where.set(url, join(root, "files", `${pkg}-${key}-400-normal.woff`));
    fonts.push({ family, url, ranges: parse(unicode[key]) });
  }
  return { manifest: { fonts }, load: async (u) => new Uint8Array(await readFile(where.get(u)!)) };
}

describe("complex-script text (AC-224)", () => {
  const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }]);
  const box = { kind: "text", id: "t", page: "p0", x: 100, y: 200, wrap: null, w: 200, h: 40, rot: 0, font: "arimo", size: 14, bold: false, italic: false, underline: false, color: "#c80000" } as const;

  it("leaves lines that need shaping to the engine, placed by their shaped width", async () => {
    const fonts = await nodeFonts();
    const objects: EditorObject[] = [{ ...box, lines: ["Total: 5", "مرحبا بالعالم"], text: "Total: 5\nمرحبا بالعالم", align: "right" }];
    const defer: DeferShaped = { measure: () => 50, family: familyOf, lines: [] };
    const out = await buildPdf({ bytes: await source(), pages, objects, assets: {} }, fonts, fontkit, defer);
    const { texts } = await pdfText(out);
    expect(texts[0]).toContain("Total: 5");
    expect(texts[0]).not.toMatch(/[\u0600-\u06ff]/);
    expect(defer.lines).toHaveLength(1);
    const face = fonts.manifestValue.faces.arimo["400-normal"];
    const [line] = defer.lines;
    expect(line).toMatchObject({ page: 0, text: "مرحبا بالعالم", font: "arimo", families: ["Arimo", "Noto Sans"], size: 14, angle: -0, color: [200, 0, 0] });
    // Right aligned: x = right − width.
    expect(line.x).toBeCloseTo(100 + 200 - 50, 5);
    expect(line.y).toBeCloseTo(800 - 200 - baselineOffset(face, 14, 1), 5);
  });

  it("draws Arabic and Hindi with the shaping engine, as real text in reading order", async () => {
    const fonts = await nodeFonts();
    const shaping = await nodeShapingFonts();
    const engine = await shapingEngine();
    const objects: EditorObject[] = [
      { ...box, lines: ["Invoice 42", "مرحبا بالعالم", "नमस्ते दुनिया, धर्म और कार्य"], text: "", align: "right" },
    ];
    const bytes = await source();
    const out = await buildShaped(
      { bytes, objects },
      { engine: async () => engine, editorManifest: fonts.manifest, shapingManifest: async () => shaping.manifest, loadFace: fonts.load, loadUrl: shaping.load },
      (b, defer, pass) => buildPdf({ bytes: b, pages, objects, assets: {} }, fonts, fontkit, defer, pass),
    );
    const doc: BerryDocument = new engine.BerryDocument(out);
    try {
      const lines = doc.pageText(0).lines;
      const arabic = lines.find((l) => l.text.includes("مرحبا"));
      const hindi = lines.find((l) => l.text.includes("नमस्ते"));
      expect(arabic?.text).toBe("مرحبا بالعالم");
      expect(arabic?.direction).toBe("rtl");
      expect(hindi?.text).toBe("नमस्ते दुनिया, धर्म और कार्य");
      // Both end at the box's right edge (x = right − shaped width).
      expect(arabic!.bbox.x1).toBeCloseTo(300, 0);
      expect(hindi!.bbox.x1).toBeCloseTo(300, 0);
      expect(arabic!.runs[0].color).toEqual([200, 0, 0]);
      const families = doc.pageText(0).fonts.map((f) => f.name).join(" ");
      expect(families).toMatch(/Naskh/);
      expect(families).toMatch(/Devanagari/);
    } finally {
      doc.free();
    }
    expect((await pdfText(out)).texts[0]).toContain("Invoice 42");
  });

  const t = (id: string, page: string, line: string) => ({ ...box, id, page, lines: [line], text: line, align: "left" }) as EditorObject;
  const w = (id: string, page: string) => ({ kind: "whiteout", id, page, x: 0, y: 0, w: 10, h: 10, fill: "#ffffff", border: null, borderWidth: 0 }) as unknown as EditorObject;
  it("puts objects in z-order layers around shaped lines, per page", () => {
    const { layers, count } = shapedLayers({ objects: [w("a", "p0"), t("s1", "p0", "مرحبا"), w("b", "p0"), t("l", "p1", "Latin"), t("s2", "p0", "नमस्ते"), w("c", "p0"), w("d", "p1")] });
    expect(Object.fromEntries(layers)).toEqual({ a: 0, s1: 0, b: 1, l: 0, s2: 1, c: 2, d: 0 });
    expect(count).toBe(3);
  });

  it("puts shaped boxes with nothing between them in one engine pass", () => {
    const { layers, count } = shapedLayers({ objects: [t("s1", "p0", "مرحبا"), t("s2", "p0", "नमस्ते"), w("a", "p0"), t("s3", "p0", "مرحبا"), t("s4", "p0", "مرحبا")] });
    expect(Object.fromEntries(layers)).toEqual({ s1: 0, s2: 0, a: 1, s3: 1, s4: 1 });
    expect(count).toBe(2);
  });

  it("writes a filled form once, in the last pdf-lib pass, and keeps it through the engine passes", async () => {
    const { pagesOf, readForm } = await import("@/lib/forms/read");
    const { setValue } = await import("@/lib/forms/model");
    const forms = await import("@/lib/forms/write");
    const bytes = new Uint8Array(await readFile(new URL("../../../tests/fixtures/forms/form-basic.pdf", import.meta.url)));
    const src = await PDFDocument.load(bytes);
    const original = readForm(src, pagesOf(src));
    const state = setValue(original, original.fields.find((f) => f.name === "name")!.id, "Asha Verma").state;
    const formPages = initialPages(src.getPages().map((p) => ({ view: [0, 0, p.getWidth(), p.getHeight()] as [number, number, number, number], rotate: 0 })));
    const fonts = await nodeFonts();
    const shaping = await nodeShapingFonts();
    const engine = await shapingEngine();
    // Two layers: pdf-lib, the engine's Arabic line, pdf-lib again, then the engine.
    const objects: EditorObject[] = [
      { ...box, lines: ["مرحبا بالعالم"], text: "مرحبا بالعالم", align: "left" },
      { kind: "whiteout", id: "w", page: "p0", x: 400, y: 700, w: 20, h: 20, fill: "#00ff00", border: null, borderWidth: 0 } as unknown as EditorObject,
      { ...box, id: "t2", y: 600, lines: ["नमस्ते"], text: "नमस्ते", align: "left" },
    ];
    const spy = vi.spyOn(forms, "applyForms");
    const passes: number[] = [];
    const out = await buildShaped(
      { bytes, objects },
      { engine: async () => engine, editorManifest: fonts.manifest, shapingManifest: async () => shaping.manifest, loadFace: fonts.load, loadUrl: shaping.load },
      (b, defer, pass) => {
        passes.push(pass.layer);
        return buildPdf({ bytes: b, pages: formPages, objects, assets: {}, forms: { state, original } }, fonts, fontkit, defer, pass);
      },
    );
    expect(passes).toEqual([0, 1]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    const back = readForm(await PDFDocument.load(out));
    expect(back.fields.find((f) => f.name === "name")!.value).toBe("Asha Verma");
    expect((await pdfText(out)).texts[0].replace(/\s+/g, "")).toContain("नमस्ते");
  });

  it("draws an object added after a shaped line over it (z-order)", async () => {
    const fonts = await nodeFonts();
    const shaping = await nodeShapingFonts();
    const engine = await shapingEngine();
    const objects: EditorObject[] = [
      { ...box, lines: ["مرحبا بالعالم"], text: "مرحبا بالعالم", align: "left" },
      { kind: "whiteout", id: "w", page: "p0", x: 90, y: 190, w: 240, h: 40, fill: "#00ff00", border: null, borderWidth: 0 } as unknown as EditorObject,
    ];
    const out = await buildShaped(
      { bytes: await source(), objects },
      { engine: async () => engine, editorManifest: fonts.manifest, shapingManifest: async () => shaping.manifest, loadFace: fonts.load, loadUrl: shaping.load },
      (b, defer, pass) => buildPdf({ bytes: b, pages, objects, assets: {} }, fonts, fontkit, defer, pass),
    );
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: out.slice(), verbosity: 0 });
    const ops = await (await (await task.promise).getPage(1)).getOperatorList();
    await task.destroy();
    const last = (op: number) => ops.fnArray.lastIndexOf(op);
    const green = ops.fnArray.findLastIndex((f, i) => f === OPS.setFillRGBColor && /^#00ff00$/i.test(String(ops.argsArray[i]?.[0])));
    expect(last(OPS.showText)).toBeGreaterThan(0);
    // The whiteout's fill comes after the Arabic text in the page's drawing order.
    expect(green).toBeGreaterThan(last(OPS.showText));
  });
});
