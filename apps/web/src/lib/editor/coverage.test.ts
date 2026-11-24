import { describe, expect, it } from "vitest";
import { listChars, missingChars } from "./coverage";

const latin = [{ file: "latin.woff", ranges: [[0, 255]] as [number, number][] }];
const cjk = [{ file: "jp.woff", ranges: [[0x3000, 0x9fff]] as [number, number][] }];

describe("missingChars", () => {
  it("names Arabic when no font covers it, once each, and never spaces", () => {
    expect(missingChars("Hello مرحبا مرحبا", latin, cjk)).toEqual(["م", "ر", "ح", "ب", "ا"]);
  });
  it("counts the fallback fonts", () => {
    expect(missingChars("日本語 ok", latin, cjk)).toEqual([]);
    expect(missingChars("日本語", latin, [])).toEqual(["日", "本", "語"]);
  });
  it("lists a few for a note", () => {
    expect(listChars(["a", "b", "c"], 2)).toBe("a b …");
  });
});
