/**
 * The zoom a document opens at on a wide screen (M12). Pure, unit tested.
 *
 * Fit width fills the view; it is capped so the page stays crisp and a line a readable length:
 * at most the zoom at which the page's canvas at a device pixel ratio of 2 still fits the
 * renderer's canvas cap (MAX_CANVAS_PIXELS; above it render.ts lowers the ratio and text softens),
 * and never above OPEN_ZOOM_MAX. A Letter page then opens at up to 220% and A4 at up to about 217%:
 * about 1,720 to 1,800 px wide, so it fills 83% or more of a 1920 px screen.
 */

/** Largest canvas the renderer draws, in pixels (the iOS limit, U-E5). */
export const MAX_CANVAS_PIXELS = 16_700_000;
/** Never open above this, whatever the page's size. */
export const OPEN_ZOOM_MAX = 2.2;

/**
 * @param width  the page's width at zoom 1, in CSS pixels
 * @param height its height at zoom 1, in CSS pixels
 */
export function openZoomCap(width: number, height: number): number {
  const crisp = Math.sqrt(MAX_CANVAS_PIXELS / (Math.max(1, width) * 2 * Math.max(1, height) * 2));
  return Math.min(OPEN_ZOOM_MAX, crisp);
}

/** The opening zoom: fit width (`fit`), capped on wide screens. `capped` says the fit was cut. */
export function openZoom(fit: number, width: number, height: number, wide: boolean): { zoom: number; capped: boolean } {
  const cap = openZoomCap(width, height);
  return wide && fit > cap ? { zoom: cap, capped: true } : { zoom: fit, capped: false };
}
