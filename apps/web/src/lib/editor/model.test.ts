import { describe, expect, it } from "vitest";
import {
  clampDelta,
  constrain45,
  deletePage,
  dragBox,
  duplicateObjects,
  duplicatePage,
  initialPages,
  insertBlankAfter,
  isPristine,
  moveObject,
  movePage,
  objectBounds,
  objectLabel,
  reorderObjects,
  resizeBox,
  rotatePage,
  rotationFor,
  type DocState,
  type EditorObject,
  type ShapeObj,
} from "./model";

const doc = (n = 3): DocState => ({ pages: initialPages(Array.from({ length: n }, () => ({ view: [0, 0, 600, 800] as [number, number, number, number], rotate: 0 }))), objects: [], engine: 0 });
const rect = (id: string, page = "p0", x = 10): ShapeObj => ({ kind: "shape", id, page, shape: "rect", x, y: 20, w: 100, h: 50, rot: 0, stroke: "#000000", fill: null, width: 1 });

describe("geometry", () => {
  it("bounds a rotated box", () => {
    const b = objectBounds({ ...rect("a"), rot: 90 });
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
    expect(b.x + b.w / 2).toBeCloseTo(60);
  });

  it("bounds lines and ink with their stroke width", () => {
    const b = objectBounds({ kind: "line", id: "l", page: "p0", arrow: false, a: [0, 0], b: [10, 0], stroke: "#000000", width: 2 });
    expect(b).toEqual({ x: -1, y: -1, w: 12, h: 2 });
  });

  it("moves every object kind", () => {
    const objs: EditorObject[] = [
      rect("a"),
      { kind: "ink", id: "i", page: "p0", points: [[0, 0], [1, 1]], color: "#000000", width: 1, marker: false },
      { kind: "markup", id: "m", page: "p0", type: "highlight", rects: [{ x: 0, y: 0, w: 5, h: 5 }], color: "#ffe14d", text: "x" },
    ];
    for (const o of objs) {
      const b0 = objectBounds(o);
      const b1 = objectBounds(moveObject(o, 3, 4));
      expect(b1.x - b0.x).toBeCloseTo(3);
      expect(b1.y - b0.y).toBeCloseTo(4);
    }
  });

  it("clamps a move to the page", () => {
    expect(clampDelta({ x: 10, y: 10, w: 50, h: 50 }, -100, 1000, { w: 600, h: 800 })).toEqual([-10, 740]);
  });

  it("resizes from a corner keeping the opposite corner, with and without the aspect lock", () => {
    const b = { x: 0, y: 0, w: 100, h: 50, rot: 0 };
    expect(resizeBox(b, "se", [200, 80], false)).toEqual({ x: 0, y: 0, w: 200, h: 80 });
    const locked = resizeBox(b, "se", [200, 60], true);
    expect(locked.w / locked.h).toBeCloseTo(2);
    expect(locked.x).toBeCloseTo(0);
    expect(locked.y).toBeCloseTo(0);
    const nw = resizeBox(b, "nw", [-50, -10], false);
    expect(nw.x + nw.w).toBeCloseTo(100);
    expect(nw.y + nw.h).toBeCloseTo(50);
  });

  it("resizes a rotated box along its own sides", () => {
    // Turned 90°: its local x axis points down the page.
    const r = resizeBox({ x: 0, y: 0, w: 100, h: 50, rot: 90 }, "e", [75, 125], false);
    expect(r.w).toBeCloseTo(150);
    expect(r.h).toBeCloseTo(50);
  });

  it("snaps rotation to quarter turns within 5 degrees and steps by 15 with Shift", () => {
    const b = { x: 0, y: 0, w: 100, h: 100 };
    expect(rotationFor(b, [150, 52], false)).toBe(90);
    expect(rotationFor(b, [150, 30], true)).toBe(75);
  });

  it("drags boxes in any direction and keeps lines at 45 degrees", () => {
    expect(dragBox([10, 10], [0, 30])).toEqual({ x: 0, y: 10, w: 10, h: 20 });
    expect(dragBox([0, 0], [10, 30], true)).toEqual({ x: 0, y: 0, w: 30, h: 30 });
    const p = constrain45([0, 0], [10, 9]);
    expect(p[0]).toBeCloseTo(p[1]);
  });
});

describe("objects", () => {
  it("duplicates one line below, or onto the next page (AC-58)", () => {
    const s = { ...doc(), objects: [rect("a")] };
    const below = duplicateObjects(s, ["a"]);
    const copy = below.state.objects.find((o) => o.id === below.ids[0]) as ShapeObj;
    expect(copy.y).toBe(20 + 58);
    expect(copy.x).toBe(10);
    const next = duplicateObjects(s, ["a"], true);
    expect(next.state.objects.find((o) => o.id === next.ids[0])!.page).toBe("p1");
  });

  it("brings forward and sends backward within the page only (AC-69)", () => {
    const s = { ...doc(), objects: [rect("a"), rect("x", "p1"), rect("b"), rect("c")] };
    const fwd = reorderObjects(s, ["a"], 1);
    expect(fwd.objects.filter((o) => o.page === "p0").map((o) => o.id)).toEqual(["b", "a", "c"]);
    const back = reorderObjects(s, ["c"], -1);
    expect(back.objects.filter((o) => o.page === "p0").map((o) => o.id)).toEqual(["a", "c", "b"]);
    expect(reorderObjects(s, ["c"], 1)).toEqual(s);
  });

  it("names objects for lists and screen readers", () => {
    expect(objectLabel(rect("a"))).toBe("Rectangle");
    expect(objectLabel({ kind: "markup", id: "m", page: "p0", type: "highlight", rects: [], color: "#ffe14d", text: "quarterly total" })).toBe("Highlight: quarterly total");
  });
});

describe("pages (AC-41)", () => {
  it("rotates, duplicates with objects, inserts blank, moves and deletes", () => {
    let s: DocState = { ...doc(2), objects: [rect("a")] };
    expect(isPristine(doc())).toBe(true);
    s = rotatePage(s, "p0", -90);
    expect(s.pages[0].rotate).toBe(270);
    const dup = duplicatePage(s, "p0");
    s = dup.state;
    expect(s.pages.map((p) => p.src)).toEqual([0, 0, 1]);
    expect(s.objects.filter((o) => o.page === dup.id)).toHaveLength(1);
    const blank = insertBlankAfter(s, "p1");
    s = blank.state;
    expect(s.pages[3]).toMatchObject({ src: null, view: [0, 0, 600, 800] });
    s = movePage(s, blank.id, 0);
    expect(s.pages[0].id).toBe(blank.id);
    s = deletePage(s, "p0");
    expect(s.pages).toHaveLength(3);
    expect(s.objects.some((o) => o.page === "p0")).toBe(false);
    expect(isPristine(s)).toBe(false);
  });

  it("never deletes the last page", () => {
    const s = doc(1);
    expect(deletePage(s, "p0")).toBe(s);
  });
});
