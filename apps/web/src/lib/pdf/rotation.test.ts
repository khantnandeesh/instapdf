import { describe, expect, it } from "vitest";
import { describeDelta, finalRotation, formatDelta, hasPendingRotation, isInScope, normalizeRotation, rotatePage, rotateScope } from "./rotation";

describe("normalizeRotation", () => {
  it.each([
    [0, 0], [90, 90], [180, 180], [270, 270], [360, 0], [450, 90],
    [-90, 270], [-180, 180], [-270, 90], [-360, 0], [720, 0], [-450, 270],
  ])("%i -> %i", (input, expected) => expect(normalizeRotation(input)).toBe(expected));
});

describe("isInScope", () => {
  it("uses 1-based page numbers for odd and even", () => {
    const idx = [0, 1, 2, 3, 4];
    expect(idx.filter((i) => isInScope("all", i))).toEqual([0, 1, 2, 3, 4]);
    expect(idx.filter((i) => isInScope("odd", i))).toEqual([0, 2, 4]);
    expect(idx.filter((i) => isInScope("even", i))).toEqual([1, 3]);
  });
});

describe("rotateScope", () => {
  it("AC-30: rotates all pages right", () => {
    expect(rotateScope([], 3, "all", 90)).toEqual([90, 90, 90]);
  });
  it("AC-31: rotates left to 270 after normalizing", () => {
    expect(rotateScope([], 3, "all", -90).map(normalizeRotation)).toEqual([270, 270, 270]);
  });
  it("AC-33: respects odd and even scopes", () => {
    expect(rotateScope([], 3, "odd", 90)).toEqual([90, 0, 90]);
    expect(rotateScope([], 3, "even", 90)).toEqual([0, 90, 0]);
  });
  it("AC-34: is cumulative and keeps unbounded display values", () => {
    let d: number[] = [];
    d = rotateScope(d, 2, "all", 90);
    d = rotateScope(d, 2, "all", 90);
    expect(d.map(normalizeRotation)).toEqual([180, 180]);
    d = rotateScope(d, 2, "all", 90);
    d = rotateScope(d, 2, "all", 90);
    expect(d).toEqual([360, 360]);
    expect(d.map(normalizeRotation)).toEqual([0, 0]);
  });
  it("does not mutate its input", () => {
    const d = [0, 0];
    rotateScope(d, 2, "all", 90);
    expect(d).toEqual([0, 0]);
  });
});

describe("rotatePage", () => {
  it("AC-32: changes only that page", () => {
    expect(rotatePage([], 3, 1, 90)).toEqual([0, 90, 0]);
  });
  it("ignores an out-of-range index", () => {
    expect(rotatePage([0, 0], 2, 5, 90)).toEqual([0, 0]);
  });
});

describe("finalRotation", () => {
  it("AC-36: adds to the existing rotation", () => {
    expect([0, 90, 0].map((orig) => finalRotation(orig, 90))).toEqual([90, 180, 90]);
    expect(finalRotation(270, 90)).toBe(0);
    expect(finalRotation(90, -90)).toBe(0);
  });
});

describe("labels", () => {
  it("formats deltas", () => {
    expect(formatDelta(0)).toBe("");
    expect(formatDelta(360)).toBe("");
    expect(formatDelta(90)).toBe("+90°");
    expect(formatDelta(-90)).toBe("\u221290°");
    expect(formatDelta(180)).toBe("180°");
    expect(describeDelta(90)).toBe("will rotate 90° clockwise");
    expect(describeDelta(0)).toBe("no change");
  });
  it("detects pending rotation", () => {
    expect(hasPendingRotation(undefined)).toBe(false);
    expect(hasPendingRotation([0, 360, -360])).toBe(false);
    expect(hasPendingRotation([0, 90])).toBe(true);
  });
});
