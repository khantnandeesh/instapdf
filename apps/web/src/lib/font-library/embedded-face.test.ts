import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as fontkit from "@cantoo/fontkit";
import { describe, expect, it } from "vitest";
import { woffToSfnt } from "../../../scripts/font-library/sfnt.mjs";
import { cffGlyphCount, coveredBy, verticalOf, webFontFromProgram, type EmbeddedProgram } from "./embedded-face";

const require = createRequire(import.meta.url);
const arimo = woffToSfnt(readFileSync(join(dirname(require.resolve("@fontsource/arimo/package.json")), "files", "arimo-latin-400-normal.woff")))!;
const cff = new Uint8Array(readFileSync(join(__dirname, "__fixtures__", "berry-test.cff")));

type Parsed = { numGlyphs: number; unitsPerEm: number; familyName: string; hasGlyphForCodePoint(cp: number): boolean; glyphForCodePoint(cp: number): { id: number; advanceWidth: number } };
const parse = (b: Uint8Array) => fontkit.create(b as unknown as Buffer) as unknown as Parsed;

/** A TrueType file as a PDF keeps it: only the tables a PDF reader needs (no cmap, name, OS/2, post). */
function asInPdf(sfnt: Uint8Array): Uint8Array {
  const v = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const keep = new Set(["head", "hhea", "hmtx", "maxp", "glyf", "loca", "cvt ", "fpgm", "prep"]);
  const tables: { tag: string; data: Uint8Array }[] = [];
  for (let i = 0; i < v.getUint16(4); i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(sfnt[o]!, sfnt[o + 1]!, sfnt[o + 2]!, sfnt[o + 3]!);
    if (keep.has(tag)) tables.push({ tag, data: sfnt.subarray(v.getUint32(o + 8), v.getUint32(o + 8) + v.getUint32(o + 12)) });
  }
  let at = 12 + tables.length * 16;
  const out = new Uint8Array(at + tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), 0));
  const w = new DataView(out.buffer);
  w.setUint32(0, 0x00010000);
  w.setUint16(4, tables.length);
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[o + k] = t.tag.charCodeAt(k);
    w.setUint32(o + 8, at);
    w.setUint32(o + 12, t.data.length);
    out.set(t.data, at);
    at += (t.data.length + 3) & ~3;
  });
  return out;
}

describe("a browser font from a PDF's embedded TrueType program", () => {
  const whole = parse(arimo);
  const glyphs = [..."Hello, ž"].map((c) => {
    const cp = c.codePointAt(0)!;
    const g = whole.hasGlyphForCodePoint(cp) ? whole.glyphForCodePoint(cp) : { id: 0, advanceWidth: 0 };
    return { cp, gid: g.id, width: (g.advanceWidth * 1000) / whole.unitsPerEm };
  });
  const program: EmbeddedProgram = { bytes: asInPdf(arimo), format: "truetype", glyphs };

  it("can't be read as a font before the missing tables are added", () => {
    expect(() => parse(program.bytes).glyphForCodePoint(72).id).toThrow();
  });

  it("gets a character map, a name and metrics, and keeps the outlines and widths", () => {
    const file = webFontFromProgram(program, "Arimo")!;
    const font = parse(file);
    expect(font.familyName).toBe("Arimo");
    expect(font.numGlyphs).toBe(whole.numGlyphs);
    for (const c of "Helo,") {
      const cp = c.codePointAt(0)!;
      expect(font.glyphForCodePoint(cp).id).toBe(whole.glyphForCodePoint(cp).id);
      expect(font.glyphForCodePoint(cp).advanceWidth).toBe(whole.glyphForCodePoint(cp).advanceWidth);
    }
    expect(verticalOf(file)).toEqual({ ascent: expect.closeTo(0.905, 3), descent: expect.closeTo(0.212, 3) });
  });

  it("takes each glyph's width from the PDF, not from the program's own advance table", () => {
    // A subset whose advance table is wrong (seen from reportlab on fixed-pitch fonts): the PDF
    // says 600 for every letter, and that is what a PDF reader draws.
    const fixed = { ...program, glyphs: glyphs.map((g) => ({ ...g, width: g.gid ? 600 : 0 })) };
    const font = parse(webFontFromProgram(fixed, "Arimo")!);
    for (const c of "Helo,") expect(font.glyphForCodePoint(c.codePointAt(0)!).advanceWidth).toBe(Math.round((600 * whole.unitsPerEm) / 1000));
    // A glyph the PDF says nothing about keeps the program's advance.
    expect(font.numGlyphs).toBe(whole.numGlyphs);
  });

  it("maps only the characters the document font has (the rest are reported missing)", () => {
    const lacking = { ...program, glyphs: glyphs.map((g) => (g.cp === 0x17e ? { ...g, gid: 0 } : g)) };
    const font = parse(webFontFromProgram(lacking)!);
    expect(font.hasGlyphForCodePoint(0x17e)).toBe(false);
    expect(font.hasGlyphForCodePoint(0x48)).toBe(true);
    expect(coveredBy(lacking).has(0x17e)).toBe(false);
    expect(coveredBy(lacking).has(0x48)).toBe(true);
  });

  it("refuses what it can't use: no program, no glyphs, damaged bytes, a glyph outside the font", () => {
    expect(webFontFromProgram({ bytes: new Uint8Array(0), format: "none", glyphs })).toBeNull();
    expect(webFontFromProgram({ ...program, glyphs: [] })).toBeNull();
    expect(webFontFromProgram({ ...program, bytes: program.bytes.subarray(0, 40) })).toBeNull();
    expect(webFontFromProgram({ ...program, glyphs: [{ cp: 65, gid: 60000, width: 500 }] })).toBeNull();
  });
});

describe("a browser font from a PDF's bare CFF program", () => {
  const program: EmbeddedProgram = {
    bytes: cff,
    format: "cff",
    glyphs: [
      { cp: 65, gid: 1, width: 600 },
      { cp: 66, gid: 2, width: 700 },
      { cp: 32, gid: 3, width: 250 },
      { cp: 67, gid: 0, width: 0 },
    ],
  };

  it("counts the glyphs of the program", () => {
    expect(cffGlyphCount(cff)).toBe(4);
    expect(cffGlyphCount(new Uint8Array([1, 0, 4, 1]))).toBe(0);
  });

  it("wraps it in an OpenType file with the PDF's widths", () => {
    const file = webFontFromProgram(program, "Berry Test")!;
    expect(String.fromCharCode(...file.subarray(0, 4))).toBe("OTTO");
    const font = parse(file);
    expect(font.numGlyphs).toBe(4);
    expect(font.unitsPerEm).toBe(1000);
    expect(font.glyphForCodePoint(65).id).toBe(1);
    expect(font.glyphForCodePoint(65).advanceWidth).toBe(600);
    expect(font.glyphForCodePoint(66).advanceWidth).toBe(700);
    expect(font.hasGlyphForCodePoint(67)).toBe(false);
    expect(verticalOf(file)).toEqual({ ascent: 0.8, descent: 0.2 });
  });
});
