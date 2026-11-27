import { PDFDocument, degrees, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { bookletOrder, halfBoxes, HALF_DEFAULTS, resolveDirection, splitHalfPdf } from "./split-half";

const box = { x: 0, y: 0, width: 200, height: 100 };

describe("halfBoxes", () => {
  it("cuts left then right on an unrotated page", () => {
    expect(halfBoxes(box, 0, "sideBySide")).toEqual([{ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 }]);
  });
  it("cuts top then bottom on an unrotated page (top is the high y)", () => {
    expect(halfBoxes(box, 0, "topBottom")).toEqual([{ x: 0, y: 50, width: 200, height: 50 }, { x: 0, y: 0, width: 200, height: 50 }]);
  });
  it("follows the page's rotation", () => {
    // Rotated 90 clockwise, the reader's left is the low y and the top is the low x.
    expect(halfBoxes(box, 90, "sideBySide")[0]).toEqual({ x: 0, y: 0, width: 200, height: 50 });
    expect(halfBoxes(box, 90, "topBottom")[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(halfBoxes(box, 180, "sideBySide")[0]).toEqual({ x: 100, y: 0, width: 100, height: 100 });
    expect(halfBoxes(box, 180, "topBottom")[0]).toEqual({ x: 0, y: 0, width: 200, height: 50 });
    expect(halfBoxes(box, 270, "sideBySide")[0]).toEqual({ x: 0, y: 50, width: 200, height: 50 });
    expect(halfBoxes(box, 270, "topBottom")[0]).toEqual({ x: 100, y: 0, width: 100, height: 100 });
  });
  it("keeps a box's offset", () => {
    expect(halfBoxes({ x: 10, y: 20, width: 200, height: 100 }, 0, "sideBySide")[1]).toEqual({ x: 110, y: 20, width: 100, height: 100 });
  });
});

describe("resolveDirection", () => {
  it("auto goes by the shape the reader sees", () => {
    expect(resolveDirection("auto", box, 0)).toBe("sideBySide");
    expect(resolveDirection("auto", box, 90)).toBe("topBottom");
    expect(resolveDirection("auto", { ...box, width: 100, height: 200 }, 0)).toBe("topBottom");
    expect(resolveDirection("topBottom", box, 0)).toBe("topBottom");
  });
});

describe("bookletOrder", () => {
  it("puts a 12-page booklet scan back in order", () => {
    const scanned = [12, 1, 2, 11, 10, 3, 4, 9, 8, 5, 6, 7];
    expect(bookletOrder(12).map((i) => scanned[i])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("handles a single sheet", () => {
    expect(bookletOrder(2)).toEqual([1, 0]);
  });
});

/** Sheets with a word in each half: "L1 | R1", "L2 | R2" … on landscape pages. */
async function sheets(labels: [string, string][], rotate = 0) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [l, r] of labels) {
    const page = doc.addPage([400, 200]);
    page.drawText(l, { x: 40, y: 100, size: 20, font, color: rgb(0, 0, 0) });
    page.drawText(r, { x: 240, y: 100, size: 20, font, color: rgb(0, 0, 0) });
    if (rotate) page.setRotation(degrees(rotate));
  }
  return doc.save();
}

/** What each output page shows: the words whose position lies inside the page's box. */
async function visible(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
    out.push(items.filter((t) => t.str.trim() && t.transform[4] >= x0 && t.transform[4] < x1 && t.transform[5] >= y0 && t.transform[5] < y1).map((t) => t.str).join(" "));
  }
  await doc.loadingTask.destroy();
  return out;
}

describe("splitHalfPdf", () => {
  it("AC-920: each sheet becomes its left page, then its right page", async () => {
    const r = await splitHalfPdf({ bytes: await sheets([["L1", "R1"], ["L2", "R2"]]), cut: [0, 1], options: HALF_DEFAULTS });
    expect(r.pageCount).toBe(4);
    expect(await visible(r.bytes)).toEqual(["L1", "R1", "L2", "R2"]);
  });
  it("AC-921: right to left puts the right page first", async () => {
    const r = await splitHalfPdf({ bytes: await sheets([["L1", "R1"]]), cut: [0], options: { ...HALF_DEFAULTS, rightToLeft: true } });
    expect(await visible(r.bytes)).toEqual(["R1", "L1"]);
  });
  it("AC-922: pages that are not picked stay whole, in place", async () => {
    const r = await splitHalfPdf({ bytes: await sheets([["Cover", "page"], ["L2", "R2"]]), cut: [1], options: HALF_DEFAULTS });
    expect(await visible(r.bytes)).toEqual(["Cover page", "L2", "R2"]);
  });
  it("AC-923: a booklet scan comes out in reading order", async () => {
    const r = await splitHalfPdf({ bytes: await sheets([["p4", "p1"], ["p2", "p3"]]), cut: [0, 1], options: { ...HALF_DEFAULTS, booklet: true } });
    expect(await visible(r.bytes)).toEqual(["p1", "p2", "p3", "p4"]);
  });
  it("AC-924: the halves share the page's content, so the file does not double", async () => {
    const input = await sheets(Array.from({ length: 10 }, (_, i) => [`L${i}`, `R${i}`] as [string, string]));
    const r = await splitHalfPdf({ bytes: input, cut: Array.from({ length: 10 }, (_, i) => i), options: HALF_DEFAULTS });
    expect(r.pageCount).toBe(20);
    expect(r.bytes.length).toBeLessThan(input.length * 1.6);
  });
});
