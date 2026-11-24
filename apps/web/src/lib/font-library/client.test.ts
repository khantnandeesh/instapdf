import { describe, expect, it } from "vitest";
import { DEFAULT_FONT, faceOf, fontUrl, type EditorFontManifest } from "../editor/fonts";
import { familyByName, foldName, parseFaceId, searchFamilies, type FamilyRow, type Library } from "./client";

const row = (i: string, n: string): FamilyRow => ({ i, n, c: "sans-serif", l: "OFL-1.1", s: ["latin"], w: [400, 700], t: 1, m: "00000000" });
const families = [row("open-sans", "Open Sans"), row("roboto", "Roboto"), row("roboto-mono", "Roboto Mono"), row("pt-sans", "PT Sans"), row("source-sans-3", "Source Sans 3")];
const lib: Library = { manifest: { families: "", faces: "", features: "", counts: { families: 5, faces: 0, files: 0 } }, families, byId: new Map(families.map((f) => [f.i, f])) };

describe("font library client (F24)", () => {
  it("AC-293: search matches every word typed, names that start with the query first", () => {
    expect(searchFamilies(families, "sans").map((f) => f.i)).toEqual(["open-sans", "pt-sans", "source-sans-3"]);
    expect(searchFamilies(families, "rob").map((f) => f.i)).toEqual(["roboto", "roboto-mono"]);
    expect(searchFamilies(families, "mono roboto").map((f) => f.i)).toEqual(["roboto-mono"]);
    expect(searchFamilies(families, "opensans").map((f) => f.i)).toEqual(["open-sans"]);
    expect(searchFamilies(families, "  ")).toHaveLength(5);
    expect(searchFamilies(families, "zzz")).toEqual([]);
  });

  it("finds a family by the name a PDF or the engine uses", () => {
    expect(familyByName(lib, "OpenSans")?.i).toBe("open-sans");
    expect(familyByName(lib, "roboto mono")?.i).toBe("roboto-mono");
    expect(familyByName(lib, "Arial")).toBeUndefined();
    expect(familyByName(lib, "")).toBeUndefined();
    expect(foldName("TimesNewRomanPS-BoldMT")).toBe("timesnewromanpsboldmt");
  });

  it("reads an index face id", () => {
    expect(parseFaceId("source-sans-3_700_italic")).toEqual({ family: "source-sans-3", weight: 700, italic: true });
    expect(parseFaceId("roboto_400_normal")).toEqual({ family: "roboto", weight: 400, italic: false });
  });

  it("AC-275: library files come from our own address, built-in ones from /fonts/editor/", () => {
    expect(fontUrl("lib:roboto/latin-400-normal.6cff1211.woff")).toBe("/fonts/lib/fonts/roboto/latin-400-normal.6cff1211.woff");
    expect(fontUrl("arimo-latin-400-normal.woff")).toBe("/fonts/editor/arimo-latin-400-normal.woff");
  });

  it("picks the nearest face a family has", () => {
    const face = (file: string) => ({ files: [{ file, ranges: [[0, 255]] as [number, number][] }], ascent: 1, descent: 0.2 });
    const m: EditorFontManifest = {
      faces: {
        [DEFAULT_FONT]: { "400-normal": face("a"), "700-normal": face("ab"), "400-italic": face("ai"), "700-italic": face("abi") },
        upright: { "400-normal": face("u"), "700-normal": face("ub") },
        display: { "900-normal": face("d") },
      },
    };
    expect(faceOf(m, "upright", true, true)?.files[0].file).toBe("ub");
    expect(faceOf(m, "upright", false, true)?.files[0].file).toBe("u");
    expect(faceOf(m, "display", false, false)?.files[0].file).toBe("d");
    expect(faceOf(m, "unknown", true, false)?.files[0].file).toBe("ab");
  });
});
