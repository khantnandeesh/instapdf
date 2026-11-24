import { describe, expect, it } from "vitest";
import { color255, isComplex, needsShaping, printable, shapingFontsFor, type ShapingManifest } from "./shaping";

const m: ShapingManifest = {
  fonts: [
    { family: "Noto Naskh Arabic", url: "/fonts/shaping/a.woff", ranges: [[0x0600, 0x06ff]] },
    { family: "Noto Sans Devanagari", url: "/fonts/noto/d.woff", ranges: [[0x0900, 0x097f]] },
    { family: "Noto Sans", url: "/fonts/noto/l.woff", ranges: [[0x20, 0x7e]] },
  ],
};
const face = { files: [{ file: "arimo-latin-400-normal.woff", ranges: [[0x20, 0x7e]] as [number, number][] }] };

describe("needsShaping (AC-224)", () => {
  it("is true for Hindi, Arabic, Hebrew, Thai and the other complex scripts", () => {
    for (const t of ["नमस्ते", "مرحبا", "שלום", "สวัสดี", "বাংলা", "தமிழ்", "ﷺ", "a‏b"]) expect(needsShaping(t)).toBe(true);
  });
  it("is false for Latin, Greek, Cyrillic, CJK and symbols", () => {
    for (const t of ["Hello, world: 2024.", "Ελληνικά", "Привет", "日本語", "₹ 5,000 · €", ""]) expect(needsShaping(t)).toBe(false);
  });
  it("covers the engine's complex ranges at their edges", () => {
    expect(isComplex(0x0900)).toBe(true);
    expect(isComplex(0x0dff)).toBe(true);
    expect(isComplex(0xfeff)).toBe(true);
    expect(isComplex(0x058f)).toBe(false);
    expect(isComplex(0x1100)).toBe(false);
  });
});

describe("shaping fonts", () => {
  it("picks only the fonts a text needs, in manifest order", () => {
    expect(shapingFontsFor(m, "नमस्ते: مرحبا").map((f) => f.family)).toEqual(["Noto Naskh Arabic", "Noto Sans Devanagari", "Noto Sans"]);
    expect(shapingFontsFor(m, "नमस्ते").map((f) => f.family)).toEqual(["Noto Sans Devanagari"]);
  });
  it("writes ? for characters no font covers and keeps spaces and joiners", () => {
    expect(printable("مرحبا 日本 x", face, m)).toBe("مرحبا ?? x");
    expect(printable("क्‍ष", face, m)).toBe("क्‍ष");
  });
  it("converts colours to 0–255", () => {
    expect(color255([1, 128 / 255, 0])).toEqual([255, 128, 0]);
    expect(color255([1.2, -0.1, 0.5])).toEqual([255, 0, 128]);
  });
});
