import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { faceId, familyRow, fontFileName, parseUnicodeRange, printSubset } from "../../../scripts/font-library/lib.mjs";
import { isSfnt, mayEmbed, verticalMetrics, woffToSfnt } from "../../../scripts/font-library/sfnt.mjs";

const require = createRequire(import.meta.url);
const arimo = join(dirname(require.resolve("@fontsource/arimo/package.json")), "files", "arimo-latin-400-normal.woff");

describe("WOFF unpacking", () => {
  const woff = readFileSync(arimo);
  const sfnt = woffToSfnt(woff)!;

  it("gives the TrueType file inside", () => {
    expect(isSfnt(sfnt)).toBe(true);
    expect(isSfnt(woff)).toBe(false);
    expect(sfnt.length).toBeGreaterThan(woff.length);
    expect(sfnt.length % 4).toBe(0);
  });

  it("reads Arimo's vertical metrics (same as Arial: 0.905 and 0.212)", () => {
    const m = verticalMetrics(sfnt)!;
    expect(m.ascent).toBeCloseTo(0.905, 3);
    expect(m.descent).toBeCloseTo(0.212, 3);
    expect(mayEmbed(sfnt)).toBe(true);
  });

  it("refuses bytes that are not a sound WOFF", () => {
    expect(woffToSfnt(Buffer.from("not a font at all, just some text padding to pass 44 bytes"))).toBeNull();
    expect(woffToSfnt(woff.subarray(0, 200))).toBeNull();
    const cut = Buffer.from(woff);
    cut.writeUInt32BE(woff.length + 10, 44 + 4);
    expect(woffToSfnt(cut)).toBeNull();
    expect(verticalMetrics(Buffer.alloc(40))).toBeNull();
  });

  it("reads the embedding permission", () => {
    const locked = Buffer.from(sfnt);
    const n = locked.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (locked.toString("latin1", o, o + 4) === "OS/2") locked.writeUInt16BE(0x0002, locked.readUInt32BE(o + 8) + 8);
    }
    expect(mayEmbed(locked)).toBe(false);
  });
});

describe("library layout", () => {
  it("parses unicode ranges and drops junk", () => {
    expect(parseUnicodeRange("U+0000-00FF,U+0131, u+20ac,U+ZZ,U+5-1,")).toEqual([
      [0, 255],
      [305, 305],
      [0x20ac, 0x20ac],
    ]);
    expect(parseUnicodeRange(undefined)).toEqual([]);
  });

  it("names faces and files", () => {
    expect(faceId("open-sans", 700, "italic")).toBe("open-sans_700_italic");
    expect(fontFileName("latin", 400, "normal", "abcdef0123456789")).toBe("latin-400-normal.abcdef01.woff");
  });

  it("fingerprints Latin when a family has it, else its main subset", () => {
    expect(printSubset({ subsets: ["devanagari", "latin"] }, "devanagari")).toBe("latin");
    expect(printSubset({ subsets: ["arabic", "math"] }, "arabic")).toBe("arabic");
    expect(printSubset({ subsets: ["khmer"] }, "latin")).toBe("khmer");
  });

  it("writes a compact family row", () => {
    const row = familyRow({ id: "lato", family: "Lato", category: "sans-serif", licence: "OFL-1.1", subsets: ["latin"], weights: [400, 700], styles: ["normal", "italic"] }, "0123456789abcdef");
    expect(row).toEqual({ i: "lato", n: "Lato", c: "sans-serif", l: "OFL-1.1", s: ["latin"], w: [400, 700], t: 1, m: "01234567" });
  });
});
