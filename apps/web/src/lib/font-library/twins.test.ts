import { describe, expect, it } from "vitest";
import type { FontMatch } from "./match";
import { twinOf, withTwin } from "./twins";

const match = (family: string, grade: FontMatch["grade"]): FontMatch => ({ face: `${family}_400_normal`, family, weight: 400, italic: false, grade, distance: 1, letters: 20 });
const font = (name: string, embedded: boolean) => ({ name, family: name.split("-")[0]!, embedded, bold: /bold/i.test(name), italic: /italic/i.test(name) });
const all = () => true;

describe("metric twins (F24, AC-283)", () => {
  it.each([
    ["Arial", "arimo"],
    ["ABCDEF+Arial-BoldMT", "arimo"],
    ["ArialMT", "arimo"],
    ["Helvetica", "arimo"],
    ["Helvetica-Oblique", "arimo"],
    ["Times New Roman", "tinos"],
    ["TimesNewRomanPS-BoldItalicMT", "tinos"],
    ["Times-Roman", "tinos"],
    ["Courier New", "cousine"],
    ["Courier-Bold", "cousine"],
    ["Calibri", "carlito"],
    ["Cambria", "caladea"],
    ["Georgia", "gelasio"],
    ["Segoe UI", "selawik"],
    ["LiberationSerif-Bold", "tinos"],
    ["Liberation Sans", "arimo"],
  ])("%s has the twin %s", (name, twin) => {
    expect(twinOf(name)).toBe(twin);
  });

  it.each(["Arial Narrow", "ArialNarrow-Bold", "Arial Black", "Helvetica-Condensed", "Liberation Sans Narrow", "Helvetica Neue", "Helvetica-Light", "Calibri-Light", "SegoeUI-Semibold", "Cambria Math", "Verdana", "Carlito", "Inter"])("%s has no twin", (name) => {
    expect(twinOf(name)).toBeUndefined();
  });

  it("a font the PDF doesn't carry gets its twin first, whatever the stand-in's shapes said", () => {
    const out = withTwin(font("Courier", false), [match("bitcount", "close"), match("cousine", "loose")], all);
    expect(out.map((m) => m.family)).toEqual(["cousine", "bitcount"]);
    expect(out[0]!.grade).toBe("twin");
  });

  it("a font the PDF doesn't carry gets its twin with nothing compared", () => {
    const out = withTwin(font("Helvetica-Bold", false), [], all);
    expect(out).toEqual([{ face: "arimo_700_normal", family: "arimo", weight: 700, italic: false, grade: "twin", distance: 0, letters: 0 }]);
  });

  it("an embedded font whose shapes agree with its name gets the twin first", () => {
    const out = withTwin(font("ABCDEF+Calibri", true), [match("lato", "close"), match("carlito", "very-close")], all);
    expect(out.map((m) => m.family)).toEqual(["carlito", "lato"]);
    expect(out[0]!.grade).toBe("very-close");
  });

  it("AC-282: an embedded font whose shapes disagree with its name keeps the order its shapes gave", () => {
    const serif = [match("adamina", "close"), match("besley", "close")];
    expect(withTwin(font("Arial", true), serif, all)).toEqual(serif);
    const far = [match("adamina", "close"), match("arimo", "loose")];
    expect(withTwin(font("Arial", true), far, all)).toEqual(far);
  });

  it("no twin is named when the library hasn't got it", () => {
    const got = [match("open-sans", "close")];
    expect(withTwin(font("Segoe UI", false), got, (id) => id !== "selawik")).toEqual(got);
  });
});
