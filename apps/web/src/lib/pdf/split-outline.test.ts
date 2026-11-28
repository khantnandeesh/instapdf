import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { outlineDepth, outlineEntries, partsFromOutline, titleAsName, type OutlineDoc, type OutlineEntry } from "./split-outline";

const e = (level: number, page: number, title: string): OutlineEntry => ({ level, page, title });
const book = [e(1, 0, "Intro"), e(1, 2, "Chapter 1"), e(2, 3, "1.1"), e(2, 5, "1.2"), e(1, 6, "Chapter 2"), e(1, 6, "Also here")];

describe("partsFromOutline", () => {
  it("starts a part at each bookmark of the level", () => {
    const r = partsFromOutline(book, 1, 9);
    expect(r.parts).toEqual([[0, 1], [2, 3, 4, 5], [6, 7, 8]]);
    expect(r.titles).toEqual(["Intro", "Chapter 1", "Chapter 2"]);
  });
  it("keeps pages before the first bookmark as a part with no title", () => {
    const r = partsFromOutline(book, 2, 9);
    expect(r.parts).toEqual([[0, 1, 2], [3, 4], [5, 6, 7, 8]]);
    expect(r.titles).toEqual([undefined, "1.1", "1.2"]);
  });
  it("filters by title text, ignoring case", () => {
    expect(partsFromOutline(book, 1, 9, "chapter").parts).toEqual([[0, 1], [2, 3, 4, 5], [6, 7, 8]]);
    expect(partsFromOutline(book, 1, 9, "chapter 2").parts).toEqual([[0, 1, 2, 3, 4, 5], [6, 7, 8]]);
  });
  it("is one part when nothing matches or targets lie outside the file", () => {
    expect(partsFromOutline(book, 3, 4).parts).toEqual([[0, 1, 2, 3]]);
    expect(partsFromOutline([e(1, 12, "Far")], 1, 4).parts).toEqual([[0, 1, 2, 3]]);
  });
  it("knows the depth", () => {
    expect(outlineDepth(book)).toBe(2);
    expect(outlineDepth([])).toBe(0);
  });
});

describe("titleAsName", () => {
  it("drops characters a file name cannot hold", () => {
    expect(titleAsName('1/2: "Costs" <draft>?')).toBe("1 2 Costs draft");
    expect(titleAsName("  ..hidden. ")).toBe("hidden");
    expect(titleAsName("x".repeat(120))).toHaveLength(80);
  });
});

describe("outlineEntries", () => {
  it("reads the bookmarks of a real file", async () => {
    const bytes = await readFile(new URL("../../../tests/fixtures/bookmarks.pdf", import.meta.url));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    const entries = await outlineEntries(doc as unknown as OutlineDoc);
    await doc.loadingTask.destroy();
    expect(entries).toEqual([e(1, 0, "Chapter 1"), e(1, 1, "Chapter 2"), e(1, 2, "Chapter 3")]);
  });
});
