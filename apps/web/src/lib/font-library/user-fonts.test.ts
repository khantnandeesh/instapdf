import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_FONT_ACCEPT, describeFont, readUserFont, toRanges, userFontId, type ParsedFont } from "./user-fonts";

const base: ParsedFont = { familyName: "My Sans", subfamilyName: "Regular", unitsPerEm: 1000, ascent: 800, descent: -200, characterSet: [65, 66, 67, 97] };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../../../../../tests/parity/editor/fonts", name)));

describe("the user's own fonts (F24)", () => {
  it("AC-294: accepts TTF, OTF, WOFF and WOFF2", () => {
    for (const ext of [".ttf", ".otf", ".woff", ".woff2"]) expect(USER_FONT_ACCEPT.split(",")).toContain(ext);
  });

  it("AC-294: a broken or foreign file is refused, not guessed", async () => {
    expect(await readUserFont(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({ error: "not-a-font" });
    expect(await readUserFont(new TextEncoder().encode("%PDF-1.7 not a font at all"))).toEqual({ error: "not-a-font" });
    expect(describeFont(null)).toEqual({ error: "not-a-font" });
    expect(describeFont({ ...base, characterSet: [] })).toEqual({ error: "not-a-font" });
    expect(describeFont({ ...base, fonts: [{}, {}] })).toEqual({ error: "collection" });
  });

  it("AC-295: a font that forbids embedding is refused", () => {
    expect(describeFont({ ...base, "OS/2": { fsType: { noEmbedding: true } } })).toEqual({ error: "no-embedding" });
    expect(describeFont({ ...base, "OS/2": { fsType: { bitmapOnly: true } } })).toEqual({ error: "no-embedding" });
    expect(describeFont({ ...base, "OS/2": { fsType: { noEmbedding: false } } })).toMatchObject({ family: "My Sans" });
  });

  it("reads the style and the metrics", () => {
    expect(describeFont(base)).toEqual({ family: "My Sans", bold: false, italic: false, face: { ascent: 0.8, descent: 0.2 }, ranges: [[65, 67], [97, 97]] });
    expect(describeFont({ ...base, "OS/2": { usWeightClass: 700 } })).toMatchObject({ bold: true, italic: false });
    expect(describeFont({ ...base, subfamilyName: "Bold Italic" })).toMatchObject({ bold: true, italic: true });
    expect(describeFont({ ...base, italicAngle: -12 })).toMatchObject({ italic: true });
    expect(describeFont({ ...base, familyName: "", postscriptName: "MySans-Regular" })).toMatchObject({ family: "MySans-Regular" });
  });

  it("turns code points into ranges", () => {
    expect(toRanges([5, 1, 2, 3, 9, 10, 3])).toEqual([[1, 3], [5, 5], [9, 10]]);
    expect(toRanges([])).toEqual([]);
  });

  it("reads a real font file into a face the editor can register, bytes untouched", async () => {
    const bytes = fixture("NotoSansDevanagari-Regular.ttf");
    const font = await readUserFont(bytes);
    if ("error" in font) throw new Error(font.error);
    expect(font.label).toBe("Noto Sans Devanagari");
    expect(font.id).toBe(userFontId("Noto Sans Devanagari"));
    expect(font.id.startsWith("user:")).toBe(true);
    const face = font.faces["400-normal"];
    expect(face.files).toHaveLength(1);
    expect(face.files[0].file.startsWith("user:")).toBe(true);
    expect(face.files[0].ranges.some(([lo, hi]) => lo <= 0x915 && hi >= 0x915)).toBe(true);
    expect(face.ascent).toBeGreaterThan(0.5);
    expect(font.bytes[face.files[0].file]).toBe(bytes);
  });
});
