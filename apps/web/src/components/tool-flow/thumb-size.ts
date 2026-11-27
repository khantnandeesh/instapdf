/** Thumbnail backing sizes (eval G-1). Plain TS: unit-tested, and loaded with the grids. */

/** Thumbnails are drawn at the screen's pixel ratio up to this (eval G-1: memory stays bounded on 3x phones). */
export const THUMB_DPR_MAX = 2.5;
/** The renderer's own cap (lib/pdf/thumbnails.ts MAX_DPR): asked sizes are scaled past it. */
const RENDERER_DPR = 2;
/** Backing sizes go up in steps of this many device pixels, so a small resize does not redraw. */
const STEP = 32;

/**
 * The longest side (CSS px) to ask the renderer for, so a page shown `longest` CSS px long comes out at
 * min(ratio, 2.5) device pixels per CSS pixel (eval G-1), rounded up to the next step.
 */
export function thumbRenderSize(longest: number, deviceRatio: number): number {
  const dpr = Math.max(1, deviceRatio || 1);
  const device = Math.ceil((longest * Math.min(THUMB_DPR_MAX, dpr)) / STEP) * STEP;
  return device / Math.min(RENDERER_DPR, dpr);
}

/** Device pixels per CSS pixel the renderer draws at (lib/pdf/thumbnails.ts), for comparing canvases drawn at different ratios. */
export function rendererScale(deviceRatio: number): number {
  return Math.min(RENDERER_DPR, deviceRatio || 1);
}
