/**
 * Was a click on existing text, before the engine could say which line? Pure, unit tested.
 *
 * pdf.js text items (available as soon as a page renders) answer "is there text here"; once the
 * engine has read the page, `lineAt` picks the engine line under the same point. Both work in
 * PDF user space (y up).
 */
import type { Rect } from "./berry-engine";

export type TextItemLike = { str: string; transform: number[]; width: number; height: number };

/** True when a non-blank pdf.js text item covers (ux, uy), give or take `slop` points. */
export function textAt(items: readonly TextItemLike[], ux: number, uy: number, slop = 2): boolean {
  return items.some((it) => {
    if (!it.str.trim()) return false;
    const [a, b, , , e, f] = it.transform as [number, number, number, number, number, number];
    if (Math.abs(b) > Math.abs(a) * 0.01) return false; // rotated text: left to the engine
    const h = it.height || Math.hypot(a, b);
    const x0 = Math.min(e, e + it.width);
    const x1 = Math.max(e, e + it.width);
    return ux >= x0 - slop && ux <= x1 + slop && uy >= f - h * 0.3 - slop && uy <= f + h + slop;
  });
}

/** The editable line under (ux, uy), nearest first, or -1. */
export function lineAt(lines: readonly { bbox: Rect; editable: boolean; text: string }[], ux: number, uy: number, slop = 2): number {
  let best = -1;
  let dist = Infinity;
  lines.forEach((l, i) => {
    if (!l.editable || !l.text.trim()) return;
    const { x0, y0, x1, y1 } = l.bbox;
    if (ux < x0 - slop || ux > x1 + slop || uy < y0 - slop || uy > y1 + slop) return;
    const d = Math.abs(uy - (y0 + y1) / 2);
    if (d < dist) [best, dist] = [i, d];
  });
  return best;
}
