/**
 * Geometry and gestures for the big page view (PagePreviewDialog). Pure, so the unit tests
 * pin the rules in docs/design/berrypdf.md "Modals": the page fills the space it is given,
 * keeps its aspect ratio, and a sideways swipe turns the page.
 */

export type Size = { width: number; height: number };

/**
 * Fits a page into the stage (`avail`, CSS px). `rotation` is the pending turn in degrees:
 * at 90/270 the page lies on its side, so its height has to fit the stage's width.
 * Returns the page box before the turn (`box`, what the element is sized to) and the
 * space it takes on screen after it (`shown`).
 */
export function fitPage(page: Size, rotation: number, avail: Size): { box: Size; shown: Size } {
  const sideways = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const w = Math.max(1, sideways ? page.height : page.width);
  const h = Math.max(1, sideways ? page.width : page.height);
  const k = Math.max(0, Math.min(avail.width / w, avail.height / h));
  const shown = { width: Math.floor(w * k), height: Math.floor(h * k) };
  const box = sideways ? { width: shown.height, height: shown.width } : shown;
  return { box, shown };
}

/** The renderer draws at up to 2 device pixels per CSS pixel (enough for thumbnails). */
const RENDERER_DPR = 2;
/** The big view is drawn at the screen's own ratio, up to 3. */
export const VIEW_DPR = 3;

/**
 * The longest side (CSS px) to ask the thumbnail renderer for, so the page comes out at the screen's pixel ratio
 * (up to 3) although the renderer caps at 2: on a 3x phone it draws a 1.5x larger canvas, which CSS fits to the box.
 */
export function renderSize(longest: number, deviceRatio: number | undefined): number {
  const dpr = Math.max(1, deviceRatio || 1);
  return Math.round((longest * Math.min(VIEW_DPR, dpr)) / Math.min(RENDERER_DPR, dpr));
}

/** The neighbours worth drawing ahead of time: next first (the usual direction), then previous. */
export function neighbours(at: number, total: number): number[] {
  return [at + 1, at - 1].filter((i) => i >= 0 && i < total);
}

/** Where a key moves the view (null: not a navigation key). Home/End go to the ends. */
export function keyTarget(key: string, at: number, total: number): number | null {
  if (total <= 0) return null;
  const to = key === "ArrowRight" ? at + 1 : key === "ArrowLeft" ? at - 1 : key === "Home" ? 0 : key === "End" ? total - 1 : null;
  if (to === null) return null;
  const clamped = Math.max(0, Math.min(total - 1, to));
  return clamped === at ? null : clamped;
}

/** Minimum sideways travel (CSS px) that counts as a swipe. */
export const SWIPE_PX = 48;
/** Most a pointer can move and still count as a tap (a tap on the backdrop closes). */
export const TAP_PX = 8;

/**
 * Reads a finished pointer gesture: a mostly sideways swipe ("next" when the finger moves
 * left, as with a printed page), a tap, or neither (a short drag, a mostly vertical move).
 */
export function readGesture(dx: number, dy: number): "next" | "prev" | "tap" | null {
  if (Math.hypot(dx, dy) <= TAP_PX) return "tap";
  if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? "next" : "prev";
  return null;
}
