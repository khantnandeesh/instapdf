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
