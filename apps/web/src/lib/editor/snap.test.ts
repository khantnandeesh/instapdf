import { describe, expect, it } from "vitest";
import { snapMove, snapPoint } from "./snap";
import { baselineOffset, layoutText, textBoxSize, alignOffset } from "./text-layout";

const page = { w: 600, h: 800 };

describe("snapping (AC-64)", () => {
  it("snaps an edge to the page edge and draws a guide", () => {
    const r = snapMove({ x: 10, y: 100, w: 50, h: 20 }, -7, 0, page, [], 6);
    expect(r.dx).toBe(-10);
    expect(r.guides).toEqual([{ axis: "x", at: 0, from: 0, to: 800 }]);
  });

  it("snaps centres to the page centre and edges to another object, each axis on its own", () => {
    const r = snapMove({ x: 0, y: 0, w: 100, h: 20 }, 248, 197, page, [{ x: 400, y: 220, w: 50, h: 50 }], 6);
    expect(r.dx).toBe(250); // centre 300 = page centre
    expect(r.dy).toBe(200); // bottom 220 = other's top
    expect(r.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
  });

  it("leaves moves outside the threshold alone", () => {
    const r = snapMove({ x: 100, y: 100, w: 30, h: 30 }, 20, 20, page, [], 6);
    expect(r).toEqual({ dx: 20, dy: 20, guides: [] });
  });

  it("snaps a single point", () => {
    expect(snapPoint([597, 401], page, [], 6).p).toEqual([600, 400]);
  });
});

describe("text layout (AC-23, AC-91)", () => {
  const measure = (s: string) => s.length * 5;

  it("keeps explicit lines without a wrap width", () => {
    expect(layoutText("one\ntwo three", null, measure)).toEqual(["one", "two three"]);
  });

  it("wraps between words at the box width, and breaks a long word", () => {
    expect(layoutText("aa bb cc dd", 30, measure)).toEqual(["aa bb", "cc dd"]);
    expect(layoutText("abcdefghij", 20, measure)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("sizes the box and places baselines like a CSS line box", () => {
    expect(textBoxSize(["abc", "a"], null, 10, measure)).toEqual({ w: 16, h: 25 });
    expect(textBoxSize(["abc"], 100, 10, measure).w).toBe(100);
    const m = { ascent: 0.9, descent: 0.2 };
    expect(baselineOffset(m, 10)).toBeCloseTo(((1.25 - 1.1) * 10) / 2 + 9);
    expect(baselineOffset(m, 10, 2) - baselineOffset(m, 10)).toBeCloseTo(25);
    expect(alignOffset("center", 100, 40)).toBe(30);
    expect(alignOffset("right", 100, 40)).toBe(60);
  });
});
