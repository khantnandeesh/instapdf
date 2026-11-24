import { describe, expect, it } from "vitest";
import type { FontInfo, Line } from "./berry-engine";
import type { PageEntry } from "./model";
import { editorFontFor, lineReplacement } from "./replace-line";
import { baselineOffset } from "./text-layout";

const font = (over: Partial<FontInfo>): FontInfo => ({
  name: "CMR10",
  family: "CMR10",
  kind: "type1",
  embedded: true,
  subset: true,
  bold: false,
  italic: false,
  serif: true,
  monospace: false,
  object: 5,
  stand_ins: [],
  ...over,
});

const line = (over: Partial<Line> = {}): Line => ({
  id: 0,
  text: "The effect of finite stiffness",
  bbox: { x0: 72, y0: 697, x1: 220, y1: 708 },
  origin: [72, 700],
  angle: 0,
  size: 9.9626,
  direction: "ltr",
  runs: [{ start: 0, end: 30, text: "The effect of finite stiffness", font: 0, size: 9.9626, color: [26, 26, 26], bbox: { x0: 72, y0: 697, x1: 220, y1: 708 } }],
  words: [],
  editable: true,
  paragraph: 0,
  ...over,
});

const entry: PageEntry = { id: "p0", src: 0, view: [0, 0, 612, 792], baseRotate: 0, rotate: 0 };
const metrics = { ascent: 0.9, descent: 0.25 };
const measure = (s: string) => s.length * 5;

describe("editorFontFor", () => {
  it("maps fonts in the file to the closest editor family", () => {
    expect(editorFontFor(font({}))).toEqual({ font: "tinos", bold: false, italic: false });
    expect(editorFontFor(font({ name: "Calibri-Bold", family: "Calibri", serif: false, bold: true }))).toEqual({ font: "carlito", bold: true, italic: false });
    expect(editorFontFor(font({ name: "Cambria", family: "Cambria" })).font).toBe("caladea");
    expect(editorFontFor(font({ name: "CMTT10", family: "CMTT10", monospace: true })).font).toBe("cousine");
    expect(editorFontFor(font({ name: "ArialMT", family: "Arial", serif: false })).font).toBe("arimo");
    expect(editorFontFor(undefined).font).toBe("arimo");
  });
});

describe("lineReplacement", () => {
  it("covers the line and puts the new text on its baseline, in its size and colour", () => {
    const r = lineReplacement({ line: line(), fonts: [font({})], entry, text: "The effect of finite stiffness ₹", face: editorFontFor(font({})), metrics, measure });
    expect(r).not.toBeNull();
    const [w, t] = r!;
    expect(w.kind).toBe("whiteout");
    // The whiteout covers the line's box in the page frame (y down from the top).
    expect(w.x).toBeLessThanOrEqual(72);
    expect(w.y).toBeLessThanOrEqual(792 - 708);
    expect(w.x + w.w).toBeGreaterThanOrEqual(220);
    expect(w.y + w.h).toBeGreaterThanOrEqual(792 - 697);
    expect(t.kind).toBe("text");
    expect(t.text).toBe("The effect of finite stiffness ₹");
    expect(t.size).toBeCloseTo(9.9626);
    expect(t.color).toBe("#1a1a1a");
    expect(t.font).toBe("tinos");
    expect(t.x).toBe(72);
    // Its first baseline is the line's baseline.
    expect(t.y + baselineOffset(metrics, t.size)).toBeCloseTo(792 - 700);
    expect(t.wrap).toBeNull();
    expect(w.page).toBe("p0");
    expect(t.page).toBe("p0");
  });

  it("wraps at the page edge instead of running past it", () => {
    const long = "x".repeat(200);
    const [, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text: long, face: editorFontFor(font({})), metrics, measure })!;
    expect(t.wrap).not.toBeNull();
    expect(t.x + t.w).toBeLessThanOrEqual(612);
    expect(t.lines.length).toBeGreaterThan(1);
  });

  it("keeps the right edge of a right-to-left line", () => {
    const [, t] = lineReplacement({ line: line({ direction: "rtl" }), fonts: [font({})], entry, text: "abc", face: editorFontFor(font({})), metrics, measure })!;
    expect(t.x + t.w).toBeCloseTo(220);
    expect(t.align).toBe("right");
  });

  it("is not offered for a rotated line", () => {
    expect(lineReplacement({ line: line({ angle: 90 }), fonts: [font({})], entry, text: "a", face: editorFontFor(font({})), metrics, measure })).toBeNull();
  });
});
