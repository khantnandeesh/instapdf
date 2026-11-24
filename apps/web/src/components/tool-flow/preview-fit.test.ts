import { describe, expect, it } from "vitest";
import { renderDpr } from "@/lib/pdf/thumbnails";
import { fitPage, keyTarget, neighbours, readGesture } from "./preview-fit";

const A4 = { width: 595, height: 842 };

describe("fitPage", () => {
  it("fills the stage height for a portrait page on a landscape screen (1280x720 stage)", () => {
    const { box, shown } = fitPage(A4, 0, { width: 1152, height: 652 });
    expect(shown.height).toBe(652);
    expect(shown.width).toBe(Math.floor(595 * (652 / 842)));
    expect(box).toEqual(shown);
  });

  it("fills the stage width on a phone (390 wide, 8px gutters)", () => {
    const { shown } = fitPage(A4, 0, { width: 374, height: 700 });
    expect(shown.width).toBe(374);
    expect(shown.height).toBeLessThanOrEqual(700);
  });

  it("keeps the aspect ratio", () => {
    const { shown } = fitPage({ width: 300, height: 100 }, 0, { width: 900, height: 900 });
    expect(shown).toEqual({ width: 900, height: 300 });
  });

  it("swaps the sides for a quarter turn: the on-screen box fits, the element box is the page's own", () => {
    const { box, shown } = fitPage(A4, 90, { width: 1000, height: 600 });
    expect(shown.height).toBe(600);
    expect(shown.width).toBeLessThanOrEqual(1000);
    expect(box).toEqual({ width: shown.height, height: shown.width });
    expect(fitPage(A4, -270, { width: 1000, height: 600 })).toEqual(fitPage(A4, 90, { width: 1000, height: 600 }));
    expect(fitPage(A4, 180, { width: 1000, height: 600 }).box).toEqual(fitPage(A4, 0, { width: 1000, height: 600 }).box);
  });

  it("never returns a negative size for an empty stage", () => {
    expect(fitPage(A4, 0, { width: 0, height: -5 }).box).toEqual({ width: 0, height: 0 });
  });
});

describe("neighbours", () => {
  it("draws next then previous, inside the range", () => {
    expect(neighbours(3, 10)).toEqual([4, 2]);
    expect(neighbours(0, 10)).toEqual([1]);
    expect(neighbours(9, 10)).toEqual([8]);
    expect(neighbours(0, 1)).toEqual([]);
  });
});

describe("keyTarget", () => {
  it("moves with the arrows and jumps with Home/End", () => {
    expect(keyTarget("ArrowRight", 3, 10)).toBe(4);
    expect(keyTarget("ArrowLeft", 3, 10)).toBe(2);
    expect(keyTarget("Home", 3, 10)).toBe(0);
    expect(keyTarget("End", 3, 10)).toBe(9);
  });
  it("does nothing at the ends or for other keys", () => {
    expect(keyTarget("ArrowRight", 9, 10)).toBeNull();
    expect(keyTarget("ArrowLeft", 0, 10)).toBeNull();
    expect(keyTarget("Home", 0, 10)).toBeNull();
    expect(keyTarget("End", 9, 10)).toBeNull();
    expect(keyTarget("Enter", 3, 10)).toBeNull();
    expect(keyTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("readGesture", () => {
  it("reads a left swipe as next and a right swipe as previous", () => {
    expect(readGesture(-80, 10)).toBe("next");
    expect(readGesture(80, -10)).toBe("prev");
  });
  it("reads a small move as a tap", () => {
    expect(readGesture(3, 4)).toBe("tap");
  });
  it("ignores short or mostly vertical drags", () => {
    expect(readGesture(-30, 0)).toBeNull();
    expect(readGesture(-60, 80)).toBeNull();
  });
});

describe("renderDpr", () => {
  it("uses the screen's ratio up to the cap, never below 1", () => {
    expect(renderDpr(3, 3)).toBe(3);
    expect(renderDpr(3)).toBe(2);
    expect(renderDpr(1.5, 3)).toBe(1.5);
    expect(renderDpr(undefined, 3)).toBe(1);
    expect(renderDpr(0.5, 3)).toBe(1);
  });
});
