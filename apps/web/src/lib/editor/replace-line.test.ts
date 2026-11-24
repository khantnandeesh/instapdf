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
  complete: true,
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
    const r = lineReplacement({ line: line(), fonts: [font({})], entry, text: "The effect of finite stiff ₹", face: editorFontFor(font({})), metrics, measure });
    expect(r).not.toBeNull();
    const [w, t] = r!;
    expect(w.kind).toBe("whiteout");
    // The whiteout covers the line's box in the page frame (y down from the top).
    expect(w.x).toBeLessThanOrEqual(72);
    expect(w.y).toBeLessThanOrEqual(792 - 708);
    expect(w.x + w.w).toBeGreaterThanOrEqual(220);
    expect(w.y + w.h).toBeGreaterThanOrEqual(792 - 697);
    expect(t.kind).toBe("text");
    expect(t.text).toBe("The effect of finite stiff ₹");
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

  it("keeps to the line's width: a little longer text is set smaller, on one line", () => {
    // 33 characters × 5 = 165 at full size; the line is 148 wide (+5 slack): 93% of the size fits.
    const [, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text: "The effect of finite stiffness ₹₹", face: editorFontFor(font({})), metrics, measure })!;
    expect(t.wrap).toBeNull();
    expect(t.lines).toHaveLength(1);
    expect(t.size).toBeLessThan(9.9626);
    expect(t.size).toBeGreaterThanOrEqual(9.9626 * 0.8 - 0.05);
    // The box's own padding aside, the text keeps to the line's width.
    expect(t.w).toBeLessThanOrEqual(148 + 5 + 2);
    // Still on the line's baseline at the smaller size.
    expect(t.y + baselineOffset(metrics, t.size)).toBeCloseTo(792 - 700, 1);
  });

  it("wraps at the line's width (never into the text beside it, nor past the page edge) once 80% isn't enough", () => {
    const long = "word ".repeat(60).trim();
    const [, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text: long, face: editorFontFor(font({})), metrics, measure })!;
    expect(t.wrap).not.toBeNull();
    expect(t.wrap!).toBeLessThanOrEqual(148 + 5 + 0.01);
    expect(t.size).toBeCloseTo(Math.floor(9.9626 * 8) / 10, 5);
    expect(t.x + t.w).toBeLessThanOrEqual(612);
    expect(t.lines.length).toBeGreaterThan(1);
  });

  it("grows the whiteout over the wrapped lines when nothing else is there", () => {
    const text = "x".repeat(45); // 80% of the size is not enough, so it wraps
    const [w, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text, face: editorFontFor(font({})), metrics, measure })!;
    expect(t.lines.length).toBeGreaterThan(1);
    expect(t.size).toBeCloseTo(Math.floor(9.9626 * 8) / 10, 5);
    expect(w.y).toBeLessThanOrEqual(t.y);
    expect(w.y + w.h).toBeGreaterThanOrEqual(t.y + t.h);
    expect(w.x + w.w).toBeGreaterThanOrEqual(t.x + t.w);
  });

  it("sets the text smaller, down to 60%, rather than whiting out the text below", () => {
    const text = "x".repeat(45);
    const below = { x0: 72, y0: 683, x1: 220, y1: 694 };
    const [w, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text, face: editorFontFor(font({})), metrics, measure, others: [below] })!;
    expect(t.lines.length).toBe(1);
    expect(t.size).toBeLessThan(9.9626 * 0.8);
    expect(t.size).toBeGreaterThanOrEqual(Math.floor(9.9626 * 6) / 10);
    // The whiteout stays on the line, clear of the text below.
    expect(w.y + w.h).toBeLessThanOrEqual(792 - below.y1);
  });

  it("at 60% and still too long, wraps but leaves the text below uncovered", () => {
    const text = "word ".repeat(30).trim();
    const below = { x0: 72, y0: 683, x1: 220, y1: 694 };
    const [w, t] = lineReplacement({ line: line(), fonts: [font({})], entry, text, face: editorFontFor(font({})), metrics, measure, others: [below] })!;
    expect(t.lines.length).toBeGreaterThan(1);
    expect(t.size).toBeCloseTo(Math.floor(9.9626 * 6) / 10, 5);
    expect(w.y + w.h).toBeLessThanOrEqual(792 - below.y1);
  });

  it("wraps at the page edge for a line that ends near it", () => {
    const near = line({ bbox: { x0: 400, y0: 697, x1: 600, y1: 708 }, origin: [400, 700] });
    const [, t] = lineReplacement({ line: near, fonts: [font({})], entry, text: "word ".repeat(60).trim(), face: editorFontFor(font({})), metrics, measure })!;
    expect(t.x + t.w).toBeLessThanOrEqual(612);
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
