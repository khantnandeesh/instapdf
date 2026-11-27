/** A rectangle on a page as shown, in fractions of its width and height (0,0 = top left). */
export type Area = { x: number; y: number; w: number; h: number };

/** Keeps an area inside the page and at least `min` wide and tall. */
export function clampArea(a: Area, min = 0.02): Area {
  const w = Math.min(1, Math.max(min, a.w));
  const h = Math.min(1, Math.max(min, a.h));
  return { x: Math.min(1 - w, Math.max(0, a.x)), y: Math.min(1 - h, Math.max(0, a.y)), w, h };
}
