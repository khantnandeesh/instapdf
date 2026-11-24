/**
 * Pure drawing maths shared by the canvas (preview) and the PDF build, so the editor chunk can
 * use them without loading pdf-lib.
 */
import type { Box, PageEntry, Pt } from "./model";

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Frame → PDF user space for a page. */
export function toPdf(page: Pick<PageEntry, "view">, [x, y]: Pt): Pt {
  return [page.view[0] + x, page.view[3] - y];
}

/** A point of a box (in the box's own unrotated frame, origin top-left) after turning the box `rot`° clockwise about its centre. */
export function boxPoint(b: Box, rot: number, lx: number, ly: number): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = (rot * Math.PI) / 180;
  const dx = b.x + lx - cx;
  const dy = b.y + ly - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

/** Arrow head: the two short strokes at `b` of a line from `a`. */
export function arrowHead(a: Pt, b: Pt, width: number): [Pt, Pt] {
  const len = Math.max(8, width * 4.5);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const spread = Math.PI / 7;
  return [
    [b[0] - len * Math.cos(ang - spread), b[1] - len * Math.sin(ang - spread)],
    [b[0] - len * Math.cos(ang + spread), b[1] - len * Math.sin(ang + spread)],
  ];
}

/** Sizes of a typed signature's text in its box: font size from the box height, so it scales with the box. */
export function typedSignatureSize(h: number, m: { ascent: number; descent: number }): number {
  return h / ((m.ascent + m.descent) * 1.15);
}

/**
 * A typed signature's font size after shrinking to fit the box width: text measured `tw` wide at
 * `size` never runs past the box (it would otherwise spill past the page edge on a fitted box).
 */
export function fitTypedSize(size: number, tw: number, w: number): number {
  const room = w * 0.96;
  return tw > room && tw > 0 ? (size * room) / tw : size;
}

/** Polyline path "M x y L x y …" in frame coordinates (SVG y down). */
export function svgPolyline(points: Pt[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${round(x)} ${round(y)}`).join(" ");
}
const round = (n: number) => Math.round(n * 100) / 100;

/** QuadPoints for boxes (frame): upper-left, upper-right, lower-left, lower-right of each. */
export function quadPoints(entry: Pick<PageEntry, "view">, rects: Box[]): number[] {
  return rects.flatMap((q) => [...toPdf(entry, [q.x, q.y]), ...toPdf(entry, [q.x + q.w, q.y]), ...toPdf(entry, [q.x, q.y + q.h]), ...toPdf(entry, [q.x + q.w, q.y + q.h])]);
}

