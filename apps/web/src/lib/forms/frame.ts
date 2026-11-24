/** Page frame ↔ PDF user space for widget boxes. Matches `toPdf` in the editor's draw-math. */
import type { FormPage } from "./types";

export type Box = { x: number; y: number; w: number; h: number };
export type PdfRect = [number, number, number, number];

export const norm360 = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/** The page's total turn as the reader sees it. */
export const pageTurn = (p: Pick<FormPage, "baseRotate" | "rotate">) => norm360(p.baseRotate + p.rotate);

/** A frame box → `/Rect` [llx, lly, urx, ury] in PDF user space. */
export function toPdfRect(page: Pick<FormPage, "view">, b: Box): PdfRect {
  const [x0, , , y1] = page.view;
  return [x0 + b.x, y1 - (b.y + b.h), x0 + b.x + b.w, y1 - b.y];
}

/** A `/Rect` (any corner order) → frame box. */
export function fromPdfRect(page: Pick<FormPage, "view">, r: PdfRect): Box {
  const [x0, , , y1] = page.view;
  const llx = Math.min(r[0], r[2]);
  const urx = Math.max(r[0], r[2]);
  const lly = Math.min(r[1], r[3]);
  const ury = Math.max(r[1], r[3]);
  return { x: llx - x0, y: y1 - ury, w: urx - llx, h: ury - lly };
}

/** Area of the overlap of two boxes over the area of the smaller one (0–1). */
export function overlapOfSmaller(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? (w * h) / small : 0;
}

/** Intersection over union (0–1). */
export function iou(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return i / (a.w * a.h + b.w * b.h - i);
}
