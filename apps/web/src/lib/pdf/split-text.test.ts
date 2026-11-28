import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { clampArea } from "./area";
import { partsFromTexts, pointsOf, textIn, type TextItem } from "./split-text";

const TOP_LEFT = { x: 0, y: 0, w: 0.6, h: 0.15 };

async function points(name: string, rotate = 0) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    out.push(pointsOf((await page.getTextContent()).items as unknown as TextItem[], page.getViewport({ scale: 1, rotation: rotate })));
  }
  await doc.loadingTask.destroy();
  return out;
}

describe("Split by text (F7 AC-940 to AC-944)", () => {
  it("AC-940: reads the text inside the area of each page", async () => {
    const pages = await points("invoices.pdf");
    expect(pages.map((p) => textIn(p, TOP_LEFT))).toEqual(["Invoice 1001", "Invoice 1001", "Invoice 1002", "", "Invoice 1003", "Invoice 1003"]);
    // The big line in the middle of the page is outside the area.
    expect(textIn(pages[0], { x: 0, y: 0.4, w: 1, h: 0.2 })).toBe("Sheet 1");
  });

  it("AC-940: the area follows the page as shown when it is rotated", async () => {
    const pages = await points("invoices.pdf", 90);
    // Turned a quarter right, the top left corner is now at the top right.
    expect(textIn(pages[0], { x: 0.85, y: 0, w: 0.15, h: 0.6 })).toBe("Invoice 1001");
    expect(textIn(pages[0], TOP_LEFT)).toBe("");
  });

  it("AC-941, AC-942: a new part where the text changes; a page with none stays with the part before", () => {
    const r = partsFromTexts(["A", "A", "B", "", "C", "C"], 6);
    expect(r.parts).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(r.titles).toEqual(["A", "B", "C"]);
  });

  it("pages before the first text form a part with no name; the same text again later starts no part of its own until it changes", () => {
    expect(partsFromTexts(["", "A", "", "A", "B"], 5)).toEqual({ parts: [[0], [1, 2, 3], [4]], titles: [undefined, "A", "B"] });
    expect(partsFromTexts([], 3)).toEqual({ parts: [[0, 1, 2]], titles: [undefined] });
  });

  it("an area stays on the page", () => {
    expect(clampArea({ x: -0.2, y: 0.95, w: 0.5, h: 0.5 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(clampArea({ x: 0.5, y: 0.5, w: 0, h: 0 }).w).toBe(0.02);
  });
});
