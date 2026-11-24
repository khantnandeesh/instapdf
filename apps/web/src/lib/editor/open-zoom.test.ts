import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PIXELS, OPEN_ZOOM_MAX, openZoom, openZoomCap } from "./open-zoom";

/** A page's size at zoom 1 in CSS pixels (pdf.js draws 1 pt as 4/3 px at 100%). */
const px = (wPt: number, hPt: number) => [(wPt * 4) / 3, (hPt * 4) / 3] as const;
const LETTER = px(612, 792);
const A4 = px(595.28, 841.89);

describe("openZoomCap", () => {
  it("keeps a Letter or A4 canvas at device pixel ratio 2 within the canvas cap", () => {
    for (const [w, h] of [LETTER, A4]) {
      const z = openZoomCap(w, h);
      expect(w * z * 2 * h * z * 2).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
      expect(z).toBeGreaterThan(2);
    }
  });

  it("opens Letter and A4 wide enough to fill 83% of a 1920 px screen", () => {
    for (const [w, h] of [LETTER, A4]) expect((w * openZoomCap(w, h)) / 1920).toBeGreaterThanOrEqual(0.83);
  });

  it("never opens a small page above the maximum", () => {
    expect(openZoomCap(200, 300)).toBe(OPEN_ZOOM_MAX);
  });

  it("lets a big page open smaller (A3)", () => {
    const [w, h] = px(841.89, 1190.55);
    expect(openZoomCap(w, h)).toBeLessThan(1.6);
  });
});

describe("openZoom", () => {
  it("fits width below the cap, on any screen", () => {
    expect(openZoom(1.41, ...LETTER, true)).toEqual({ zoom: 1.41, capped: false });
    expect(openZoom(0.48, ...LETTER, false)).toEqual({ zoom: 0.48, capped: false });
  });

  it("caps a wide screen's fit, never a phone's", () => {
    const wide = openZoom(3, ...LETTER, true);
    expect(wide.capped).toBe(true);
    expect(wide.zoom).toBeCloseTo(openZoomCap(...LETTER));
    expect(openZoom(3, ...LETTER, false)).toEqual({ zoom: 3, capped: false });
  });
});
