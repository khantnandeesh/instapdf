/**
 * The reader's view of a page ↔ the editor's page frame. Detection works in the view (text reads
 * left to right there); fields are stored in the frame (the unrotated page).
 */
import type { Box } from "../frame";

/** Frame size (unrotated page, points) and the page's total clockwise turn. */
export type Orientation = { w: number; h: number; turn: number };

/** A point in the view → the frame. */
export function viewToFrame(o: Orientation, u: number, v: number): [number, number] {
  switch (o.turn) {
    case 90:
      return [v, o.h - u];
    case 180:
      return [o.w - u, o.h - v];
    case 270:
      return [o.w - v, u];
    default:
      return [u, v];
  }
}

/** A point in the frame → the view. */
export function frameToView(o: Orientation, x: number, y: number): [number, number] {
  switch (o.turn) {
    case 90:
      return [o.h - y, x];
    case 180:
      return [o.w - x, o.h - y];
    case 270:
      return [y, o.w - x];
    default:
      return [x, y];
  }
}

const boxOf = (a: [number, number], b: [number, number]): Box => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });

export const viewBoxToFrame = (o: Orientation, b: Box): Box => boxOf(viewToFrame(o, b.x, b.y), viewToFrame(o, b.x + b.w, b.y + b.h));
export const frameBoxToView = (o: Orientation, b: Box): Box => boxOf(frameToView(o, b.x, b.y), frameToView(o, b.x + b.w, b.y + b.h));
