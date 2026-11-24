/**
 * Snapping while moving or resizing (AC-64). Pure, unit tested.
 *
 * Edges and centres of the moving box snap to the page edges, the page centre lines and the
 * edges and centres of the other objects on the page, within a threshold (6 screen px, given in
 * points). Each axis snaps on its own. The guides say where to draw the dashed lines.
 */
import type { Box } from "./model";

export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

export type SnapResult = { dx: number; dy: number; guides: Guide[] };

type Candidate = { at: number; from: number; to: number };

const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

/** Snaps box `b` moved by (dx, dy) against the page and `others`. */
export function snapMove(b: Box, dx: number, dy: number, page: { w: number; h: number }, others: Box[], threshold: number): SnapResult {
  const moved = { ...b, x: b.x + dx, y: b.y + dy };
  const vx: Candidate[] = [0, page.w / 2, page.w].map((at) => ({ at, from: 0, to: page.h }));
  const vy: Candidate[] = [0, page.h / 2, page.h].map((at) => ({ at, from: 0, to: page.w }));
  for (const o of others) {
    for (const at of xs(o)) vx.push({ at, from: o.y, to: o.y + o.h });
    for (const at of ys(o)) vy.push({ at, from: o.x, to: o.x + o.w });
  }
  const guides: Guide[] = [];
  const bestX = best(xs(moved), vx, threshold);
  const bestY = best(ys(moved), vy, threshold);
  let ndx = dx;
  let ndy = dy;
  if (bestX) ndx += bestX.shift;
  if (bestY) ndy += bestY.shift;
  const final = { ...b, x: b.x + ndx, y: b.y + ndy };
  if (bestX) guides.push({ axis: "x", at: bestX.c.at, from: Math.min(bestX.c.from, final.y), to: Math.max(bestX.c.to, final.y + final.h) });
  if (bestY) guides.push({ axis: "y", at: bestY.c.at, from: Math.min(bestY.c.from, final.x), to: Math.max(bestY.c.to, final.x + final.w) });
  return { dx: ndx, dy: ndy, guides };
}

/** Snaps a single point (a resize handle or a line end) on each axis. */
export function snapPoint(p: [number, number], page: { w: number; h: number }, others: Box[], threshold: number): { p: [number, number]; guides: Guide[] } {
  const r = snapMove({ x: p[0], y: p[1], w: 0, h: 0 }, 0, 0, page, others, threshold);
  return { p: [p[0] + r.dx, p[1] + r.dy], guides: r.guides };
}

function best(values: number[], candidates: Candidate[], threshold: number): { shift: number; c: Candidate } | null {
  let out: { shift: number; c: Candidate } | null = null;
  for (const v of values) {
    for (const c of candidates) {
      const shift = c.at - v;
      if (Math.abs(shift) <= threshold && (!out || Math.abs(shift) < Math.abs(out.shift))) out = { shift, c };
    }
  }
  return out;
}
