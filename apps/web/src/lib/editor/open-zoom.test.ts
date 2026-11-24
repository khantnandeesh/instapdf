import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PIXELS, OPEN_ZOOM_FLOOR, OPEN_ZOOM_MAX, openZoom, openZoomCap, renderDpr } from "./open-zoom";

/** A page's size at zoom 1 in CSS pixels (pdf.js draws 1 pt as 4/3 px at 100%). */
const px = (wPt: number, hPt: number) => [(wPt * 4) / 3, (hPt * 4) / 3] as const;
const LETTER = px(612, 792);
const A4 = px(595.28, 841.89);
/** A very tall page (a receipt or a long web capture). */
const TALL = px(612, 7920);

describe("renderDpr", () => {
  it("is the screen's ratio, at most 2, and 1 when unknown", () => {
    expect(renderDpr(1)).toBe(1);
    expect(renderDpr(1.5)).toBe(1.5);
    expect(renderDpr(2)).toBe(2);
    expect(renderDpr(3)).toBe(2);
    expect(renderDpr(undefined)).toBe(1);
    expect(renderDpr(0)).toBe(1);
  });
});

describe("openZoomCap", () => {
  it("keeps a Letter or A4 canvas at device pixel ratio 2 within the canvas cap", () => {
    for (const [w, h] of [LETTER, A4]) {
      const z = openZoomCap(w, h, 2);
      expect(w * z * 2 * h * z * 2).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
      expect(z).toBeGreaterThan(2);
    }
  });

  it("opens Letter and A4 wide enough to fill 83% of a 1920 px screen", () => {
    for (const [w, h] of [LETTER, A4]) expect((w * openZoomCap(w, h, 2)) / 1920).toBeGreaterThanOrEqual(0.83);
  });

  it("follows the ratio render.ts draws at: DPR 1, 2 and 3", () => {
    // DPR 1: a Letter canvas is small at any opening zoom, so only the maximum applies.
    expect(openZoomCap(...LETTER, renderDpr(1))).toBe(OPEN_ZOOM_MAX);
    const at2 = openZoomCap(...LETTER, renderDpr(2));
    expect(at2).toBeLessThanOrEqual(OPEN_ZOOM_MAX);
    // DPR 3 draws at 2 (render.ts), so it caps the same as DPR 2.
    expect(openZoomCap(...LETTER, renderDpr(3))).toBe(at2);
    // A3 at DPR 1 and 2: the higher ratio caps lower.
    const A3 = px(841.89, 1190.55);
    expect(openZoomCap(...A3, renderDpr(2))).toBeLessThan(openZoomCap(...A3, renderDpr(1)));
  });

  it("never opens a small page above the maximum", () => {
    expect(openZoomCap(200, 300, 2)).toBe(OPEN_ZOOM_MAX);
  });
});

describe("openZoom", () => {
  it("fits width below the cap, on any screen", () => {
    expect(openZoom(1.41, ...LETTER, true, 2)).toEqual({ zoom: 1.41, capped: false });
    expect(openZoom(0.48, ...LETTER, false, 2)).toEqual({ zoom: 0.48, capped: false });
  });

  it("caps a wide screen's fit, never a phone's", () => {
    const wide = openZoom(3, ...LETTER, true, 2);
    expect(wide.capped).toBe(true);
    expect(wide.zoom).toBeCloseTo(openZoomCap(...LETTER, 2));
    expect(openZoom(3, ...LETTER, false, 2)).toEqual({ zoom: 3, capped: false });
  });

  it("opens a very tall page at fit width up to 150%, not at its canvas cap", () => {
    // Its canvas cap at DPR 2 is about 70%: far too small to read.
    expect(openZoomCap(...TALL, 2)).toBeLessThan(0.75);
    // Fit width on a laptop (141%) is kept; a wide screen's fit is cut to the floor, as before M12.
    expect(openZoom(1.41, ...TALL, true, 2)).toEqual({ zoom: 1.41, capped: false });
    expect(openZoom(3, ...TALL, true, 2)).toEqual({ zoom: OPEN_ZOOM_FLOOR, capped: true });
    expect(openZoom(3, ...TALL, true, 1)).toEqual({ zoom: OPEN_ZOOM_FLOOR, capped: true });
  });
});
