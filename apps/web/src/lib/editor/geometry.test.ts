import { describe, expect, it } from "vitest";
import { displaySize, lineBox, quarterTurns, rectToScreen, toScreen } from "./geometry";

// A Letter page with a non-zero origin, to catch a missing page-box offset.
const box = [10, 20, 622, 812] as const; // 612 × 792
const s = 0.5;

describe("editor geometry", () => {
  it("normalises rotations", () => {
    expect([0, 90, 180, 270, 360, -90, 450].map(quarterTurns)).toEqual([0, 1, 2, 3, 0, 3, 1]);
  });

  it("swaps the displayed size for quarter turns", () => {
    expect(displaySize(box, 0, s)).toEqual({ width: 306, height: 396 });
    expect(displaySize(box, 90, s)).toEqual({ width: 396, height: 306 });
    expect(displaySize(box, 180, s)).toEqual({ width: 306, height: 396 });
    expect(displaySize(box, 270, s)).toEqual({ width: 396, height: 306 });
  });

  it("maps the page corners like pdf.js does", () => {
    // Bottom-left of the unrotated page.
    expect(toScreen(10, 20, box, 0, s)).toEqual([0, 396]);
    // /Rotate 90 (clockwise): the bottom-left corner goes to the top-left.
    expect(toScreen(10, 20, box, 90, s)).toEqual([0, 0]);
    // The top-left corner goes to the top-right.
    expect(toScreen(10, 812, box, 90, s)).toEqual([396, 0]);
    expect(toScreen(10, 20, box, 180, s)).toEqual([306, 0]);
    expect(toScreen(10, 20, box, 270, s)).toEqual([396, 306]);
  });

  it("maps rects to axis-aligned screen rects", () => {
    const r = { x0: 110, y0: 700, x1: 310, y1: 720 };
    expect(rectToScreen(r, box, 0, s)).toEqual({ left: 50, top: 46, width: 100, height: 10 });
    expect(rectToScreen(r, box, 90, s)).toEqual({ left: 340, top: 50, width: 10, height: 100 });
    expect(rectToScreen(r, box, 180, s)).toEqual({ left: 156, top: 340, width: 100, height: 10 });
    expect(rectToScreen(r, box, 270, s)).toEqual({ left: 46, top: 156, width: 10, height: 100 });
  });

  it("turns the edit box with the page and with the baseline", () => {
    const r = { x0: 110, y0: 700, x1: 310, y1: 720 };
    expect(lineBox(r, 0, box, 0, s)).toEqual({ cx: 100, cy: 51, length: 100, thickness: 10, angle: 0 });
    // Horizontal text on a page shown turned clockwise runs top to bottom.
    expect(lineBox(r, 0, box, 90, s)).toMatchObject({ length: 100, thickness: 10, angle: 90 });
    // Text drawn at 90° (bottom to top) on a /Rotate 90 page reads normally on screen.
    const up = { x0: 100, y0: 100, x1: 112, y1: 400 };
    expect(lineBox(up, 90, box, 90, s)).toMatchObject({ length: 150, thickness: 6, angle: 0 });
    expect(lineBox(r, 0, box, 270, s).angle).toBe(270);
  });
});
