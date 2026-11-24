import { describe, expect, it } from "vitest";
import { clampDelta, clampedResize, clampPoint, fitToPage, insidePage, keepOnPage, objectBounds, type EditorObject, type ImageObj, type SignatureObj, type TextObj } from "./model";

const page = { w: 612, h: 792 };
const sig = (over: Partial<SignatureObj> = {}): SignatureObj => ({ kind: "signature", id: "s", page: "p", x: 100, y: 100, w: 180, h: 30, rot: 0, role: "signature", sig: { type: "typed", text: "Long name", face: "caveat" }, color: "#000000", ...over });
const img = (over: Partial<ImageObj> = {}): ImageObj => ({ kind: "image", id: "i", page: "p", x: 100, y: 100, w: 200, h: 100, rot: 0, asset: "a", opacity: 1, ...over });
const inside = (o: EditorObject) => insidePage(objectBounds(o), page);

describe("clampDelta (move and nudge)", () => {
  it("stops at each edge", () => {
    const b = { x: 100, y: 100, w: 50, h: 20 };
    expect(clampDelta(b, -500, 0, page)).toEqual([-100, 0]);
    expect(clampDelta(b, 1000, 0, page)).toEqual([462, 0]);
    expect(clampDelta(b, 0, -500, page)).toEqual([0, -100]);
    expect(clampDelta(b, 0, 2000, page)).toEqual([0, 672]);
  });
  it("uses the rotated bounds", () => {
    const o = sig({ x: 200, y: 200, w: 300, h: 40, rot: 90 });
    const b = objectBounds(o);
    expect(b.w).toBeCloseTo(40);
    expect(b.h).toBeCloseTo(300);
    const [, dy] = clampDelta(b, 0, 2000, page);
    expect(b.y + b.h + dy).toBeCloseTo(792);
  });
});

describe("fitToPage (placement, paste, drop, rotate)", () => {
  it("leaves an object that fits alone", () => {
    const o = sig();
    expect(fitToPage([o], page, 12)[0]).toBe(o);
  });
  it("scales a typed signature wider than the page down proportionally, with a margin", () => {
    const o = sig({ x: -50, y: 300, w: 900, h: 60 });
    const [f] = fitToPage([o], page, 12);
    expect(f.w).toBeCloseTo(612 - 24);
    expect(f.w / f.h).toBeCloseTo(900 / 60);
    expect(f).toMatchObject({ x: expect.closeTo(12, 3), y: expect.closeTo(310.4, 1) });
    expect(inside(f)).toBe(true);
  });
  it("fits a rotated object by its rotated bounds", () => {
    const o = img({ x: 0, y: 300, w: 1000, h: 50, rot: 90 });
    const [f] = fitToPage([o], page, 12);
    expect(inside(f)).toBe(true);
    expect(objectBounds(f).h).toBeCloseTo(792 - 24, 0);
    expect((f as ImageObj).rot).toBe(90);
  });
  it("shifts an object hanging off an edge back on without scaling it", () => {
    const [f] = fitToPage([img({ x: 550, y: -30 })], page, 12);
    expect(f.w).toBe(200);
    expect(f.x).toBe(412);
    expect(f.y).toBe(0);
  });
  it("scales text through its size and wrap", () => {
    const t: TextObj = { kind: "text", id: "t", page: "p", x: 0, y: 0, wrap: 800, lines: ["a"], w: 800, h: 20, rot: 0, text: "a", font: "arimo", size: 16, bold: false, italic: false, underline: false, color: "#000", align: "left" };
    const [f] = fitToPage([t], page, 0) as TextObj[];
    expect(f.size).toBeCloseTo(16 * (612 / 800));
    expect(f.wrap).toBeCloseTo(612);
  });
  it("fits lines, ink and a group together", () => {
    const objs: EditorObject[] = [
      { kind: "line", id: "l", page: "p", a: [-100, 10], b: [700, 10], arrow: false, stroke: "#000", width: 2 },
      { kind: "ink", id: "k", page: "p", points: [[10, 10], [20, 900]], color: "#000", width: 2, marker: false },
    ];
    for (const o of fitToPage(objs, page, 0)) expect(inside(o)).toBe(true);
  });
});

describe("clampedResize", () => {
  const box = { x: 400, y: 600, w: 100, h: 50, rot: 0 };
  it("stops an unrotated box at the edge on each side", () => {
    expect(clampedResize(box, "e", [900, 620], false, page)).toMatchObject({ x: 400, w: 212 });
    expect(clampedResize(box, "w", [-300, 620], false, page)).toMatchObject({ x: 0, w: 500 });
    expect(clampedResize(box, "s", [450, 1200], false, page)).toMatchObject({ y: 600, h: 192 });
    expect(clampedResize(box, "n", [450, -200], false, page)).toMatchObject({ y: 0, h: 650 });
  });
  it("keeps the aspect and the anchored corner when a locked corner hits the edge", () => {
    const r = clampedResize(box, "se", [2000, 900], true, page);
    expect(r.x).toBeCloseTo(400);
    expect(r.y).toBeCloseTo(600);
    expect(r.w / r.h).toBeCloseTo(2);
    expect(insidePage(r, page)).toBe(true);
    expect(r.x + r.w).toBeCloseTo(612, 1);
  });
  it("stops a rotated box where its rotated bounds touch the edge", () => {
    const rb = { x: 300, y: 300, w: 200, h: 40, rot: 45 };
    const r = clampedResize(rb, "e", [2000, 2000], false, page);
    const corners = objectBounds({ ...img(), ...r, rot: 45 });
    expect(insidePage(corners, page, 0.05)).toBe(true);
    expect(r.w).toBeGreaterThan(200);
    // It touches an edge: a little more would not fit.
    expect(Math.max(corners.x + corners.w - 612, corners.y + corners.h - 792)).toBeGreaterThan(-0.5);
  });
  it("lets a box that was already off the page shrink", () => {
    const off = { x: 500, y: 10, w: 300, h: 50, rot: 0 };
    expect(clampedResize(off, "e", [700, 20], false, page).w).toBe(112);
  });
  it("clampPoint keeps line ends on the page", () => {
    expect(clampPoint([-5, 900], page)).toEqual([0, 792]);
  });
});

describe("keepOnPage", () => {
  const text = (over: Partial<TextObj> = {}): TextObj => ({ kind: "text", id: "t", page: "p", x: 400, y: 100, wrap: null, lines: ["x".repeat(60)], w: 360, h: 15, rot: 0, text: "x".repeat(60), font: "arimo", size: 12, bold: false, italic: false, underline: false, color: "#000", align: "left", ...over });
  // 6 pt per character, 15 pt lines.
  const reflow = (t: TextObj, wrap: number): TextObj => {
    const per = Math.floor(wrap / 6);
    const lines = t.text.match(new RegExp(`.{1,${per}}`, "g"))!;
    return { ...t, wrap, lines, w: Math.min(wrap, t.text.length * 6), h: lines.length * 15 };
  };
  it("wraps text that runs past the right edge at the edge, keeping its size and left edge", () => {
    const r = keepOnPage(text(), page, reflow) as TextObj;
    expect(r.size).toBe(12);
    expect(r.x).toBe(400);
    expect(r.wrap).toBe(212);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(insidePage(objectBounds(r), page)).toBe(true);
  });
  it("moves a box that starts at the right edge left before wrapping it", () => {
    const r = keepOnPage(text({ x: 600 }), page, reflow) as TextObj;
    expect(r.x).toBeCloseTo(612 - 96);
    expect(insidePage(objectBounds(r), page)).toBe(true);
  });
  it("wraps a rotated box past the edge instead of shrinking it, its first corner kept", async () => {
    const { rotatedCorners } = await import("./model");
    const t = text({ x: 380, y: 300, rot: 30 });
    expect(inside(t)).toBe(false);
    const r = keepOnPage(t, page, reflow) as TextObj;
    expect(r.size).toBe(12);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(inside(r)).toBe(true);
    const [a, b] = [rotatedCorners(t, 30)[0], rotatedCorners(r, 30)[0]];
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
  });
  it("wraps rotated text longer than the page, then slides it on", () => {
    const long = "x".repeat(200);
    const r = keepOnPage(text({ x: 100, y: 300, rot: 90, text: long, lines: [long], w: 1200 }), page, reflow) as TextObj;
    expect(r.size).toBe(12);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(inside(r)).toBe(true);
  });
  it("shrinks a signature dragged or resized past the page", () => {
    const r = keepOnPage(sig({ x: -100, w: 1000, h: 80 }), page);
    expect(insidePage(objectBounds(r), page)).toBe(true);
    expect((r as SignatureObj).w / (r as SignatureObj).h).toBeCloseTo(1000 / 80);
  });
  it("returns the same object when it is on the page", () => {
    const o = img();
    expect(keepOnPage(o, page)).toBe(o);
  });
});

describe("fitTypedSize", () => {
  it("shrinks a typed signature's font so its text stays inside the box", async () => {
    const { fitTypedSize } = await import("./draw-math");
    expect(fitTypedSize(20, 100, 200)).toBe(20);
    expect(fitTypedSize(20, 400, 200)).toBeCloseTo((20 * 192) / 400);
    expect(fitTypedSize(20, 0, 0)).toBe(20);
  });
});
