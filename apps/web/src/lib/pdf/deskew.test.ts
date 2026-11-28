import { PDFArray, PDFDocument, StandardFonts, decodePDFRawStream, type PDFRawStream } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { deskewPdf, turnMatrix } from "./deskew";
import { applyMatrix } from "./page-geometry";
import { estimateSkew, MAX_SKEW } from "./skew";

/** A page of "text": rows of dashes, the whole turned clockwise by `degrees` about its middle. */
function scan(degrees: number, { width = 560, height = 800, rule = false, lines = 30 } = {}) {
  const px = new Uint8ClampedArray(width * height * 4).fill(255);
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dot = (x: number, y: number) => {
    // Where the straight page's point lands once the page is turned (screen axes, y down).
    const u = x - width / 2;
    const v = y - height / 2;
    const X = Math.round(width / 2 + u * cos - v * sin);
    const Y = Math.round(height / 2 + u * sin + v * cos);
    if (X >= 0 && X < width && Y >= 0 && Y < height) px.set([20, 20, 20, 255], (Y * width + X) * 4);
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let l = 0; l < lines; l++) {
    const y = 90 + l * 20;
    for (let x = 60; x < width - 60; ) {
      const word = 12 + Math.floor(rnd() * 40);
      for (let k = 0; k < word && x + k < width - 60; k += 0.5) for (let h = 0; h < 7; h += 0.5) dot(x + k, y + h);
      x += word + 8;
    }
  }
  if (rule) for (let y = 60; y < height - 60; y += 0.5) for (let w = 0; w < 2; w += 0.5) dot(40 + w, y);
  return { px, width, height };
}

describe("skew of a scanned page (spec F15 §1)", () => {
  it("AC-1500: the tilt of a page of text is found to a tenth of a degree", () => {
    for (const tilt of [3, -1.5, 0.4, -7.25, 11]) {
      const { px, width, height } = scan(tilt);
      const found = estimateSkew(px, width, height);
      expect(found.clarity).toBeGreaterThan(1.6);
      expect(Math.abs(found.angle - tilt)).toBeLessThanOrEqual(0.1);
    }
  });

  it("AC-1501: a straight page is left alone", () => {
    const { px, width, height } = scan(0);
    expect(estimateSkew(px, width, height).angle).toBe(0);
  });

  it("AC-1502: a page with no lines to go by (blank, photo-like noise, mostly dark) gives no tilt", () => {
    const blank = new Uint8ClampedArray(300 * 400 * 4).fill(255);
    expect(estimateSkew(blank, 300, 400).angle).toBe(0);
    const noise = new Uint8ClampedArray(300 * 400 * 4).fill(255);
    let seed = 3;
    for (let i = 0; i < noise.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      if (seed % 5 === 0) noise.set([0, 0, 0], i);
    }
    expect(estimateSkew(noise, 300, 400).angle).toBe(0);
    const dark = new Uint8ClampedArray(300 * 400 * 4).fill(30);
    expect(estimateSkew(dark, 300, 400).angle).toBe(0);
  });

  it("AC-1503: a page tilted further than the search reaches is not guessed at", () => {
    const { px, width, height } = scan(MAX_SKEW + 6);
    expect(Math.abs(estimateSkew(px, width, height).angle)).toBeLessThan(MAX_SKEW);
  });

  it("AC-1504: rules and table edges count as well as lines of text", () => {
    const { px, width, height } = scan(2, { rule: true, lines: 3 });
    expect(Math.abs(estimateSkew(px, width, height).angle - 2)).toBeLessThanOrEqual(0.1);
  });
});

describe("deskew (spec F15 §1)", () => {
  it("AC-1510: the turn is clockwise as seen, about the middle of the page", () => {
    const box = { x: 0, y: 0, width: 200, height: 100 };
    const m = turnMatrix(box, 90);
    // The middle stays; the top middle (PDF y up) goes to the right middle.
    expect(applyMatrix(m, 100, 50).map(Math.round)).toEqual([100, 50]);
    expect(applyMatrix(m, 100, 100).map(Math.round)).toEqual([150, 50]);
    const back = turnMatrix({ x: 10, y: 20, width: 200, height: 100 }, 0);
    expect(back.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("AC-1511: only the pages named are turned; text stays text and the page keeps its size", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 3; i++) doc.addPage([300, 400]).drawText(`Page ${i}`, { x: 40, y: 300, size: 24, font });
    const src = await doc.save({ useObjectStreams: false });
    const out = await deskewPdf({ bytes: src, turns: { 1: -2.5 } });
    expect(out.pageCount).toBe(3);
    const made = await PDFDocument.load(out.bytes);
    const text = (i: number) => {
      const page = made.getPage(i);
      expect(page.getSize()).toEqual({ width: 300, height: 400 });
      const contents = page.node.Contents();
      const first = contents instanceof PDFArray ? made.context.lookup(contents.get(0)) : contents;
      return Buffer.from(decodePDFRawStream(first as PDFRawStream).decode()).toString("latin1");
    };
    const cos = Math.cos((2.5 * Math.PI) / 180);
    expect(text(1)).toMatch(new RegExp(`^q ${String(cos).slice(0, 6)}\\d* 0\\.0436\\d* -0\\.0436\\d* ${String(cos).slice(0, 6)}\\d* [-\\d.]+ [-\\d.]+ cm`));
    expect(text(0)).not.toMatch(/^q [\d.]+ [-\d.]+ [-\d.]+ [\d.]+ [-\d.]+ [-\d.]+ cm/);
  });

  it("AC-1512: a link on a turned page moves with the content", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [150, 95, 190, 105] }));
    page.node.set((await import("@cantoo/pdf-lib")).PDFName.of("Annots"), doc.context.obj([link]));
    const out = await deskewPdf({ bytes: await doc.save(), turns: { 0: 10 } });
    const made = await PDFDocument.load(out.bytes);
    const { PDFDict, PDFName, PDFNumber } = await import("@cantoo/pdf-lib");
    const rect = made.getPage(0).node.Annots()!.lookup(0, PDFDict).lookup(PDFName.of("Rect"), PDFArray);
    const y = rect.lookup(1, PDFNumber).asNumber();
    // Right of the middle, a clockwise turn moves things down the page (PDF y falls).
    expect(y).toBeLessThan(90);
  });

  it("AC-1513: a field keeps its size and its picture turns with the page", async () => {
    const { PDFDict, PDFName, PDFNumber, PDFStream } = await import("@cantoo/pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 200]);
    const look = doc.context.register(doc.context.stream("0 0 400 12 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 400, 12] }));
    const stamp = (rect: number[]) => doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Stamp", Rect: rect, AP: { N: look } }));
    page.node.set(PDFName.of("Annots"), doc.context.obj([stamp([100, 94, 500, 106]), stamp([100, 20, 500, 32])]));
    const made = await PDFDocument.load((await deskewPdf({ bytes: await doc.save(), turns: { 0: 5 } })).bytes);
    const annots = made.getPage(0).node.Annots()!;
    const rect = annots.lookup(0, PDFDict).lookup(PDFName.of("Rect"), PDFArray);
    const n = [0, 1, 2, 3].map((i) => rect.lookup(i, PDFNumber).asNumber());
    // The box around a 400 by 12 strip turned 5 degrees: 400cos5 + 12sin5 wide, 400sin5 + 12cos5 high.
    expect(n[2] - n[0]).toBeCloseTo(399.52, 1);
    expect(n[3] - n[1]).toBeCloseTo(46.82, 1);
    const ap = (i: number) => annots.lookup(i, PDFDict).lookup(PDFName.of("AP"), PDFDict);
    const matrix = ap(0).lookup(PDFName.of("N"), PDFStream).dict.lookup(PDFName.of("Matrix"), PDFArray);
    const m = [0, 1, 2, 3].map((i) => matrix.lookup(i, PDFNumber).asNumber());
    expect(m[0]).toBeCloseTo(Math.cos((5 * Math.PI) / 180), 4);
    expect(m[1]).toBeCloseTo(-Math.sin((5 * Math.PI) / 180), 4);
    // The picture the two shared was copied for each: neither is turned twice.
    expect(ap(0).get(PDFName.of("N"))).not.toBe(ap(1).get(PDFName.of("N")));
    const second = ap(1).lookup(PDFName.of("N"), PDFStream).dict.lookup(PDFName.of("Matrix"), PDFArray);
    expect(second.lookup(0, PDFNumber).asNumber()).toBeCloseTo(m[0], 4);
  });

  it("AC-1514: what the page box hid stays hidden after a turn", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.setCropBox(100, 100, 200, 200);
    page.drawText("x", { x: 150, y: 150, size: 10 });
    const made = await PDFDocument.load((await deskewPdf({ bytes: await doc.save(), turns: { 0: 3 } })).bytes);
    const { PDFArray: Arr, PDFName, PDFStream } = await import("@cantoo/pdf-lib");
    const first = made.getPage(0).node.lookup(PDFName.of("Contents"), Arr).lookup(0, PDFStream);
    expect(new TextDecoder().decode(first.getContents())).toMatch(/cm\n100 100 200 200 re W n/);
  });
});
