/**
 * The zoom a document opens at on a wide screen (M12). Pure, unit tested.
 *
 * Fit width fills the view; it is capped so the page stays crisp and a line a readable length:
 * at most the zoom at which the page's canvas, at the device pixel ratio render.ts draws with
 * (`renderDpr`), still fits the renderer's canvas cap (MAX_CANVAS_PIXELS; above it render.ts lowers
 * the ratio and text softens), and never above OPEN_ZOOM_MAX. At a ratio of 2 a Letter page then
 * opens at up to 220% and A4 at up to about 217%: about 1,720 to 1,800 px wide, so it fills 83% or
 * more of a 1920 px screen. The cap never goes below OPEN_ZOOM_FLOOR (or the fit, when that is
 * smaller), so a very tall page still opens at a readable size; its canvas is then drawn at a lower
 * ratio, as before.
 */

/** Largest canvas the renderer draws, in pixels (the iOS limit, U-E5). */
export const MAX_CANVAS_PIXELS = 16_700_000;
/** Never open above this, whatever the page's size. */
export const OPEN_ZOOM_MAX = 2.2;
/** The cap never cuts the opening zoom below this (the cap before M12). */
export const OPEN_ZOOM_FLOOR = 1.5;

/** The device pixel ratio the renderer draws pages at: the screen's, at most 2. */
export function renderDpr(devicePixelRatio: number | undefined): number {
  return Math.min(2, devicePixelRatio || 1);
}

/**
 * The largest zoom at which the page's canvas stays within MAX_CANVAS_PIXELS, at most OPEN_ZOOM_MAX.
 * @param width  the page's width at zoom 1, in CSS pixels
 * @param height its height at zoom 1, in CSS pixels
 * @param dpr    the ratio render.ts draws at (`renderDpr`)
 */
export function openZoomCap(width: number, height: number, dpr: number): number {
  const crisp = Math.sqrt(MAX_CANVAS_PIXELS / (Math.max(1, width) * dpr * Math.max(1, height) * dpr));
  return Math.min(OPEN_ZOOM_MAX, crisp);
}

/** The opening zoom: fit width (`fit`), capped on wide screens. `capped` says the fit was cut. */
export function openZoom(fit: number, width: number, height: number, wide: boolean, dpr: number): { zoom: number; capped: boolean } {
  const cap = Math.max(Math.min(fit, OPEN_ZOOM_FLOOR), openZoomCap(width, height, dpr));
  return wide && fit > cap ? { zoom: cap, capped: true } : { zoom: fit, capped: false };
}
