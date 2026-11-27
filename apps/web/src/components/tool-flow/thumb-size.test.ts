import { describe, expect, it } from "vitest";
import { THUMB_DPR_MAX, thumbRenderSize } from "./thumb-size";

/** Device pixels the renderer draws for an asked size (it scales by the pixel ratio, up to 2). */
const drawn = (asked: number, dpr: number) => asked * Math.min(2, dpr);

describe("thumbRenderSize (eval G-1)", () => {
  it("draws a page at the screen's pixel ratio, up to 2.5", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3])
      for (const shown of [72, 113, 160, 226, 300]) {
        const ratio = drawn(thumbRenderSize(shown, dpr), dpr) / shown;
        expect(ratio).toBeGreaterThanOrEqual(Math.min(dpr, THUMB_DPR_MAX));
        // Rounded up to the next 32 device pixels, never more.
        expect(drawn(thumbRenderSize(shown, dpr), dpr) - shown * Math.min(dpr, THUMB_DPR_MAX)).toBeLessThan(32);
      }
  });
  it("asks for the same size for boxes a few pixels apart (no redraw on a small resize)", () => {
    expect(thumbRenderSize(226, 2)).toBe(thumbRenderSize(230, 2));
  });
  it("treats a missing or odd ratio as 1", () => {
    expect(thumbRenderSize(160, 0)).toBe(thumbRenderSize(160, 1));
    expect(thumbRenderSize(160, 0.5)).toBe(160);
  });
});
