/**
 * PDF user space to screen (CSS px) for the editor overlay. Pure, unit tested.
 *
 * The engine gives boxes in PDF user space: points, origin at the bottom-left of the
 * unrotated page, y up (berry-engine.d.ts). The screen shows the page with its /Rotate
 * applied (clockwise), y down, origin top-left, as pdf.js renders it.
 */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type PageBox = readonly [number, number, number, number];

/** Displayed page size in CSS px at `scale` (CSS px per point), rotation applied. */
export function displaySize(pageBox: PageBox, rotation: number, scale: number): { width: number; height: number } {
  const w = (pageBox[2] - pageBox[0]) * scale;
  const h = (pageBox[3] - pageBox[1]) * scale;
  return quarterTurns(rotation) % 2 ? { width: h, height: w } : { width: w, height: h };
}

/** 0, 90, 180, 270 (any multiple of 90, negative too) → 0..3. */
export function quarterTurns(rotation: number): number {
  return ((Math.round(rotation / 90) % 4) + 4) % 4;
}

/** One user-space point to screen px. Matches pdf.js's viewport transform. */
export function toScreen(x: number, y: number, pageBox: PageBox, rotation: number, scale: number): [number, number] {
  const [bx0, by0, bx1, by1] = pageBox;
  const W = (bx1 - bx0) * scale;
  const H = (by1 - by0) * scale;
  // Unrotated screen coordinates.
  const X = (x - bx0) * scale;
  const Y = (by1 - y) * scale;
  switch (quarterTurns(rotation)) {
    case 1:
      return [H - Y, X];
    case 2:
      return [W - X, H - Y];
    case 3:
      return [Y, W - X];
    default:
      return [X, Y];
  }
}

/** A user-space rect to an axis-aligned screen rect. */
export function rectToScreen(r: Rect, pageBox: PageBox, rotation: number, scale: number): { left: number; top: number; width: number; height: number } {
  const [ax, ay] = toScreen(r.x0, r.y0, pageBox, rotation, scale);
  const [bx, by] = toScreen(r.x1, r.y1, pageBox, rotation, scale);
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/**
 * Where to draw a line's hit box and edit field: an unrotated box of `length` × `thickness`
 * centred at (cx, cy), then turned `angle` degrees clockwise on screen. Text that reads left to
 * right on screen has angle 0; text on a page with /Rotate 90 reads top to bottom (angle 90).
 */
export type LineBox = { cx: number; cy: number; length: number; thickness: number; angle: number };

/**
 * `lineAngle` is the baseline direction in user space (degrees, counter-clockwise, y up);
 * the page rotation is clockwise, so on screen the text runs at rotation − lineAngle.
 */
export function lineBox(bbox: Rect, lineAngle: number, pageBox: PageBox, rotation: number, scale: number): LineBox {
  const s = rectToScreen(bbox, pageBox, rotation, scale);
  const angle = (((rotation - lineAngle) % 360) + 360) % 360;
  // The bbox is axis-aligned in user space, so only quarter-turn baselines map exactly.
  const along = quarterTurns(angle) % 2 ? s.height : s.width;
  const across = quarterTurns(angle) % 2 ? s.width : s.height;
  return { cx: s.left + s.width / 2, cy: s.top + s.height / 2, length: along, thickness: across, angle: quarterTurns(angle) * 90 };
}

/**
 * A point on the displayed (rotated) page, in CSS px from its top-left, to the page frame in
 * CSS px (unrotated, origin top-left). `w`/`h` are the unrotated page size in CSS px.
 */
export function screenToFrame(sx: number, sy: number, w: number, h: number, rotation: number): [number, number] {
  switch (quarterTurns(rotation)) {
    case 1:
      return [sy, h - sx];
    case 2:
      return [w - sx, h - sy];
    case 3:
      return [w - sy, sx];
    default:
      return [sx, sy];
  }
}

/** A movement on screen (CSS px) to a movement in the page frame (CSS px). */
export function screenDeltaToFrame(dx: number, dy: number, rotation: number): [number, number] {
  switch (quarterTurns(rotation)) {
    case 1:
      return [dy, -dx];
    case 2:
      return [-dx, -dy];
    case 3:
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

/** A user-space rect (PDF points, y up) to a page-frame box (points, y down from the view's top-left). */
export function userRectToFrame(r: Rect, view: PageBox): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(r.x0, r.x1) - view[0], y: view[3] - Math.max(r.y0, r.y1), w: Math.abs(r.x1 - r.x0), h: Math.abs(r.y1 - r.y0) };
}
