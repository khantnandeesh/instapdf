import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, degrees } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { cropPdf } from "./crop";
import { flipPdf } from "./flip";
import { nupCell, nupGrid, nupPdf, NUP_DEFAULTS } from "./nup";
import { areaToBox, sidesToPage } from "./page-geometry";
import { resizePdf } from "./resize";
import { pointsOf, type TextItem } from "./split-text";

/** One page per entry: words at page coordinates, on a `size` page with its own rotation. */
async function make(pages: { words: Record<string, [number, number]>; rotate?: number }[], size: [number, number] = [400, 200]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = doc.addPage(size);
    for (const [word, [x, y]] of Object.entries(p.words)) page.drawText(word, { x, y, size: 10, font });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return doc.save();
}

/** What a reader sees, by pdf.js: each page's size and where each word's middle is, in fractions (2 decimals). */
async function seen(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: { size: [number, number]; words: Record<string, [number, number]> }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const points = pointsOf((await page.getTextContent()).items as unknown as TextItem[], viewport);
    const on = points.filter((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    out.push({ size: [Math.round(viewport.width), Math.round(viewport.height)], words: Object.fromEntries(on.map((p) => [p.str, [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]])) });
  }
  await doc.loadingTask.destroy();
  return out;
}

const two = { words: { L: [40, 100], R: [340, 100], T: [200, 170] } } as { words: Record<string, [number, number]>; rotate?: number };

describe("page geometry", () => {
  const box = { x: 10, y: 20, width: 400, height: 200 };
  it("maps an area of the shown page to the page's own box, for every rotation", () => {
    const leftHalf = { x: 0, y: 0, w: 0.5, h: 1 };
    expect(areaToBox(leftHalf, box, 0)).toEqual({ x: 10, y: 20, width: 200, height: 200 });
    expect(areaToBox(leftHalf, box, 90)).toEqual({ x: 10, y: 20, width: 400, height: 100 });
    expect(areaToBox(leftHalf, box, 180)).toEqual({ x: 210, y: 20, width: 200, height: 200 });
    expect(areaToBox(leftHalf, box, 270)).toEqual({ x: 10, y: 120, width: 400, height: 100 });
    expect(areaToBox({ x: 0, y: 0, w: 1, h: 0.25 }, box, 0)).toEqual({ x: 10, y: 170, width: 400, height: 50 });
  });
  it("maps the reader's sides to the page's sides", () => {
    const s = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(sidesToPage(s, 0)).toEqual({ x0: 4, x1: 2, y0: 3, y1: 1 });
    expect(sidesToPage(s, 90)).toEqual({ x0: 1, x1: 3, y0: 4, y1: 2 });
    expect(sidesToPage(s, 180)).toEqual({ x0: 2, x1: 4, y0: 1, y1: 3 });
    expect(sidesToPage(s, 270)).toEqual({ x0: 3, x1: 1, y0: 2, y1: 4 });
  });
});

describe("Flip (F8 AC-1000 to AC-1003)", () => {
  it("AC-1000: horizontally, left and right swap and the height stays", async () => {
    const before = (await seen(await make([two])))[0];
    const after = (await seen((await flipPdf({ bytes: await make([two]), pages: [0], direction: "horizontal" })).bytes))[0];
    expect(after.size).toEqual([400, 200]);
    expect(after.words.L[0]).toBeCloseTo(1 - before.words.L[0], 1);
    expect(after.words.R[0]).toBeLessThan(0.2);
    expect(after.words.L[1]).toBeCloseTo(before.words.L[1], 1);
  });
  it("AC-1001: vertically, top and bottom swap", async () => {
    const after = (await seen((await flipPdf({ bytes: await make([two]), pages: [0], direction: "vertical" })).bytes))[0];
    expect(after.words.T[1]).toBeGreaterThan(0.8);
    expect(after.words.L[0]).toBeLessThan(0.2);
  });
  it("AC-1002: on a turned page, left and right are the reader's", async () => {
    const bytes = await make([{ ...two, rotate: 90 }]);
    const before = (await seen(bytes))[0];
    const after = (await seen((await flipPdf({ bytes, pages: [0], direction: "horizontal" })).bytes))[0];
    expect(after.size).toEqual([200, 400]);
    expect(after.words.T[0]).toBeCloseTo(1 - before.words.T[0], 1);
    expect(after.words.L[1]).toBeCloseTo(before.words.L[1], 1);
  });
  it("AC-1003: only the picked pages change, and a link moves with its text", async () => {
    const doc = await PDFDocument.load(await make([two, two]));
    const page = doc.getPage(0);
    page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [30, 90, 80, 120], A: { S: "URI", URI: PDFString.of("https://example.com/") } }))]));
    const r = await flipPdf({ bytes: await doc.save(), pages: [0], direction: "horizontal" });
    const pages = await seen(r.bytes);
    expect(pages[0].words.L[0]).toBeGreaterThan(0.8);
    expect(pages[1].words.L[0]).toBeLessThan(0.2);
    const out = await PDFDocument.load(r.bytes);
    const rect = out.getPage(0).node.Annots()!.lookup(0, PDFDict).lookup(PDFName.of("Rect"), PDFArray);
    expect([0, 1, 2, 3].map((i) => rect.lookup(i, PDFNumber).asNumber())).toEqual([320, 90, 370, 120]);
  });
});

describe("Resize (F8 AC-1010 to AC-1014)", () => {
  it("AC-1010: margins grow the page and the content keeps its size", async () => {
    const r = await resizePdf({ bytes: await make([two]), pages: [0], options: { mode: "margins", margins: { top: 10, right: 20, bottom: 30, left: 40 } } });
    const page = (await seen(r.bytes))[0];
    expect(page.size).toEqual([460, 240]);
    // L sat 40pt from the left; it now sits 80pt from it.
    expect(page.words.L[0]).toBeCloseTo((80 + 3) / 460, 1);
  });
  it("AC-1011: on a turned page the margins go where the reader sees them", async () => {
    const r = await resizePdf({ bytes: await make([{ ...two, rotate: 90 }]), pages: [0], options: { mode: "margins", margins: { top: 100, right: 0, bottom: 0, left: 0 } } });
    expect((await seen(r.bytes))[0].size).toEqual([200, 500]);
    const box = (await PDFDocument.load(r.bytes)).getPage(0).getMediaBox();
    expect(box).toEqual({ x: -100, y: 0, width: 500, height: 200 });
  });
  it("AC-1012: a new paper size scales the content to fit, centred, on its side for a wide page", async () => {
    const before = (await seen(await make([two])))[0];
    const r = await resizePdf({ bytes: await make([two]), pages: [0], options: { mode: "size", width: 595, height: 842 } });
    const page = (await seen(r.bytes))[0];
    expect(page.size).toEqual([842, 595]);
    // The width fits exactly, so sideways positions keep their share of the page.
    expect(page.words.L[0]).toBeCloseTo(before.words.L[0], 1);
    expect(page.words.R[0]).toBeCloseTo(before.words.R[0], 1);
    // 400 × 200 becomes 842 × 421, with 87pt above and below.
    expect(page.words.T[1]).toBeGreaterThan(87 / 595);
  });
  it("AC-1013: an upright page gets the paper upright, whatever its rotation", async () => {
    const r = await resizePdf({ bytes: await make([{ ...two, rotate: 90 }]), pages: [0], options: { mode: "size", width: 595, height: 842 } });
    expect((await seen(r.bytes))[0].size).toEqual([595, 842]);
  });
  it("AC-1014: pages that were not picked stay as they are", async () => {
    const r = await resizePdf({ bytes: await make([two, two]), pages: [1], options: { mode: "size", width: 300, height: 300 } });
    expect((await seen(r.bytes)).map((p) => p.size)).toEqual([[400, 200], [300, 300]]);
  });
});

describe("Crop (F8 AC-1020 to AC-1022)", () => {
  it("AC-1020: a page keeps only its area", async () => {
    const r = await cropPdf({ bytes: await make([two, two]), areas: { 0: { x: 0, y: 0, w: 0.5, h: 1 } } });
    const pages = await seen(r.bytes);
    expect(pages[0].size).toEqual([200, 200]);
    expect(Object.keys(pages[0].words)).toEqual(["L"]);
    expect(pages[1].size).toEqual([400, 200]);
  });
  it("AC-1021: the area is the reader's on a turned page", async () => {
    // Turned a quarter right, the page's left edge is at the top: the top half holds L.
    const r = await cropPdf({ bytes: await make([{ ...two, rotate: 90 }]), areas: { 0: { x: 0, y: 0, w: 1, h: 0.5 } } });
    const page = (await seen(r.bytes))[0];
    expect(page.size).toEqual([200, 200]);
    expect(Object.keys(page.words)).toEqual(["L"]);
  });
  it("AC-1022: an area that is the whole page changes nothing", async () => {
    const r = await cropPdf({ bytes: await make([two]), areas: { 0: { x: 0, y: 0, w: 1, h: 1 } } });
    expect((await PDFDocument.load(r.bytes)).getPage(0).node.has(PDFName.of("CropBox"))).toBe(false);
  });
});

describe("N-up (F8 AC-1030 to AC-1034)", () => {
  const upright = (n: number) => make(Array.from({ length: n }, (_, i) => ({ words: { [`P${i + 1}`]: [90, 150] as [number, number] } })), [200, 300]);
  const column = (x: number) => Math.floor(x * 2);

  it("grids: upright pages go side by side, wide pages stack", () => {
    expect(nupGrid(2, 200, 300)).toEqual({ cols: 2, rows: 1 });
    expect(nupGrid(2, 300, 200)).toEqual({ cols: 1, rows: 2 });
    expect(nupGrid(8, 200, 300)).toEqual({ cols: 4, rows: 2 });
    expect(nupGrid(16, 200, 300)).toEqual({ cols: 4, rows: 4 });
  });
  it("order: across then down, down then across, and from the right", () => {
    expect([0, 1, 2, 3].map((k) => nupCell(k, 2, 2, "rows", false))).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
    expect([0, 1, 2, 3].map((k) => nupCell(k, 2, 2, "columns", false))).toEqual([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 0 }, { col: 1, row: 1 }]);
    expect(nupCell(0, 2, 2, "rows", true)).toEqual({ col: 1, row: 0 });
  });
  it("AC-1030: two pages per sheet, side by side at full size; an odd last page sits alone", async () => {
    const r = await nupPdf({ bytes: await upright(3), options: NUP_DEFAULTS });
    const sheets = await seen(r.bytes);
    expect(r.pageCount).toBe(2);
    expect(sheets.map((s) => s.size)).toEqual([[400, 300], [400, 300]]);
    expect(column(sheets[0].words.P1[0])).toBe(0);
    expect(column(sheets[0].words.P2[0])).toBe(1);
    expect(Object.keys(sheets[1].words)).toEqual(["P3"]);
  });
  it("AC-1031: keeping the paper size shrinks the pages onto the first page's paper, on its side", async () => {
    const r = await nupPdf({ bytes: await upright(2), options: { ...NUP_DEFAULTS, keepSize: true } });
    const sheets = await seen(r.bytes);
    expect(sheets[0].size).toEqual([300, 200]);
    expect(column(sheets[0].words.P2[0])).toBe(1);
  });
  it("AC-1032: four per sheet, in columns, from the right", async () => {
    const r = await nupPdf({ bytes: await upright(4), options: { perSheet: 4, order: "columns", rightToLeft: true, keepSize: false } });
    const w = (await seen(r.bytes))[0].words;
    const cell = (p: [number, number]) => [column(p[0]), Math.floor(p[1] * 2)];
    expect([cell(w.P1), cell(w.P2), cell(w.P3), cell(w.P4)]).toEqual([[1, 0], [1, 1], [0, 0], [0, 1]]);
  });
  it("AC-1033: a turned page is placed the way the reader saw it", async () => {
    // Wide pages turned a quarter are upright to the reader: they go side by side, text still readable.
    const bytes = await make([{ ...two, rotate: 90 }, { words: { A: [40, 100], B: [200, 170] }, rotate: 270 }, { words: { C: [40, 100], D: [200, 170] }, rotate: 180 }]);
    const before = await seen(bytes);
    const sheets = await seen((await nupPdf({ bytes, options: NUP_DEFAULTS })).bytes);
    expect(sheets[0].size).toEqual([400, 400]);
    const w = sheets[0].words;
    for (const word of ["L", "T"]) {
      expect(w[word][0], word).toBeCloseTo(before[0].words[word][0] / 2, 1);
      expect(w[word][1], word).toBeCloseTo(before[0].words[word][1], 1);
    }
    for (const word of ["A", "B"]) {
      expect(w[word][0], word).toBeCloseTo(0.5 + before[1].words[word][0] / 2, 1);
      expect(w[word][1], word).toBeCloseTo(before[1].words[word][1], 1);
    }
    // The third page is upside down and wide (the first page set the cells): it is fitted in its cell, still upside down.
    expect(sheets[1].words.C[0]).toBeGreaterThan(sheets[1].words.D[0]);
  });
  it("AC-1034: text stays text and the pages are stored once each", async () => {
    const bytes = await upright(16);
    const r = await nupPdf({ bytes, options: { ...NUP_DEFAULTS, perSheet: 16 } });
    expect(r.pageCount).toBe(1);
    expect(Object.keys((await seen(r.bytes))[0].words)).toHaveLength(16);
  });
});

describe("options and trim", () => {
  it("lengths: millimetres and inches, comma or point, nothing odd", async () => {
    const { parseLength, marginsFrom } = await import("./page-shape-options");
    expect(parseLength("25.4", "mm")).toBeCloseTo(72, 5);
    expect(parseLength("0,5", "in")).toBeCloseTo(36, 5);
    expect(parseLength(".5", "in")).toBeCloseTo(36, 5);
    for (const bad of ["", "-1", "1e3", "abc", "1.2.3", "9999"]) expect(parseLength(bad, "mm"), bad).toBeNull();
    const none = { all: "10", top: "", right: "", bottom: "", left: "" };
    expect(marginsFrom(none, "mm")).toEqual({ top: 10 * (72 / 25.4), right: 10 * (72 / 25.4), bottom: 10 * (72 / 25.4), left: 10 * (72 / 25.4) });
    expect(marginsFrom({ ...none, all: "0", top: "1" }, "in")).toEqual({ top: 72, right: 0, bottom: 0, left: 0 });
    expect(marginsFrom({ ...none, all: "0" }, "mm")).toBeNull();
    expect(marginsFrom({ ...none, left: "x" }, "mm")).toBeNull();
  });
  it("AC-1023: the trim area holds the ink with a little room; a blank page stays whole", async () => {
    const { contentArea, unionArea } = await import("./trim");
    const w = 100;
    const h = 200;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 50; y < 100; y++) for (let x = 20; x < 60; x++) px.set([0, 0, 0, 255], (y * w + x) * 4);
    const a = contentArea(px, w, h);
    expect(a.x).toBeCloseTo(0.188, 2);
    expect(a.y).toBeCloseTo(0.238, 2);
    expect(a.w).toBeCloseTo(0.424, 2);
    expect(a.h).toBeCloseTo(0.274, 2);
    expect(contentArea(new Uint8ClampedArray(w * h * 4).fill(255), w, h)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(unionArea([{ x: 0.1, y: 0.2, w: 0.3, h: 0.3 }, { x: 0.3, y: 0.1, w: 0.5, h: 0.2 }])).toEqual({ x: 0.1, y: 0.1, w: 0.7000000000000001, h: 0.4 });
  });
});
