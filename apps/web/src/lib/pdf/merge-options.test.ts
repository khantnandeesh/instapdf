import { describe, expect, it } from "vitest";
import { changedCount, defaultMergeOptions, parseMergeOptions } from "./merge-options";
import { isWinAnsi, parseUnicodeRange } from "./text";

describe("merge options", () => {
  it("AC-40: defaults on a first visit", () => {
    expect(parseMergeOptions(null)).toEqual({ toc: "none", cover: false, bookmarks: "keep", footer: false, sameWidth: false, doubleSided: false, forms: "rename" });
    expect(changedCount(defaultMergeOptions)).toBe(0);
  });
  it("AC-42: restores stored choices and ignores bad values", () => {
    const o = parseMergeOptions(JSON.stringify({ toc: "names", doubleSided: true, forms: "nope", cover: "yes", extra: 1 }));
    expect(o).toMatchObject({ toc: "names", doubleSided: true, forms: "rename", cover: false });
    expect(changedCount(o)).toBe(2);
    expect(parseMergeOptions("{not json")).toEqual(defaultMergeOptions);
    expect(parseMergeOptions("[1,2]")).toEqual(defaultMergeOptions);
  });
});

describe("text helpers", () => {
  it("knows what Helvetica (WinAnsi) can show", () => {
    expect(isWinAnsi("résumé – “final” €5.pdf")).toBe(true);
    expect(isWinAnsi("résumé-日本.pdf")).toBe(false);
    expect(isWinAnsi("Привет.pdf")).toBe(false);
  });
  it("parses CSS unicode ranges", () => {
    expect(parseUnicodeRange("U+0000-00FF, U+0131,U+4??")).toEqual([
      [0, 255],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
  });
});
