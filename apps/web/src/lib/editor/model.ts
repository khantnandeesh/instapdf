/**
 * Editor document model (F16 E1). Pure data and pure operations, unit tested.
 *
 * Coordinates: every object lives on one page entry, in that page's **frame**: points, origin at
 * the top-left of the unrotated visible page box (pdf.js `view`), x right, y down. The page's
 * rotation (its own /Rotate plus the user's turns) is applied on screen by turning the whole
 * overlay, and in the output by /Rotate, so objects turn with their page (U-E5). An object's own
 * `rot` is clockwise degrees in the frame (CSS convention).
 */

import { duplicateWidgetsToPage, prunePages } from "@/lib/forms/model";
import type { FormState } from "@/lib/forms/types";

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

/** A page of the edited document: a source page of the PDF (or a blank page) plus the user's turns. */
export type PageEntry = {
  /** Stable id: objects point at it, so duplicates and reorders keep their objects. */
  id: string;
  /** Zero-based source page, or null for an inserted blank page. */
  src: number | null;
  /** Visible box of the unrotated page: [x0, y0, x1, y1] in PDF user space. */
  view: [number, number, number, number];
  /** The source page's own /Rotate (0, 90, 180, 270). */
  baseRotate: number;
  /** Quarter turns the user added, in degrees (0, 90, 180, 270). */
  rotate: number;
};

export type TextObj = {
  kind: "text";
  id: string;
  page: string;
  x: number;
  y: number;
  /** Wrap width in points, or null: as wide as the longest line. */
  wrap: number | null;
  /** Laid-out lines (from `layoutText`) and the box they need. Kept on the object, so the output matches the screen. */
  lines: string[];
  w: number;
  h: number;
  rot: number;
  text: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: "left" | "center" | "right";
  /** 0–1; absent = solid. Set by the stamping tools (a watermark), not by the editor. */
  opacity?: number;
  /** One line that must stay inside `w`: the build draws it smaller when it measures wider. Set by the stamping tools. */
  fit?: boolean;
};

export type ImageObj = { kind: "image"; id: string; page: string; x: number; y: number; w: number; h: number; rot: number; asset: string; opacity: number };

export type SigSource =
  | { type: "typed"; text: string; face: string }
  /** Strokes in a 0..1 box (x and y both scaled by the box width/height). */
  | { type: "drawn"; strokes: Pt[][]; aspect: number }
  | { type: "image"; asset: string };

export type SignatureObj = { kind: "signature"; id: string; page: string; x: number; y: number; w: number; h: number; rot: number; role: "signature" | "initials"; sig: SigSource; color: string };

export type ShapeObj = { kind: "shape"; id: string; page: string; shape: "rect" | "ellipse"; x: number; y: number; w: number; h: number; rot: number; stroke: string | null; fill: string | null; width: number };

export type LineObj = { kind: "line"; id: string; page: string; arrow: boolean; a: Pt; b: Pt; stroke: string; width: number };

export type InkObj = { kind: "ink"; id: string; page: string; points: Pt[]; color: string; width: number; marker: boolean };

export type MarkupKind = "highlight" | "underline" | "strike";
export type MarkupObj = { kind: "markup"; id: string; page: string; type: MarkupKind; rects: Box[]; color: string; text: string };

export type WhiteoutObj = { kind: "whiteout"; id: string; page: string; x: number; y: number; w: number; h: number; fill: string; border: string | null; borderWidth: number };

export type EditorObject = TextObj | ImageObj | SignatureObj | ShapeObj | LineObj | InkObj | MarkupObj | WhiteoutObj;
export type ObjectKind = EditorObject["kind"];
/** Objects with an x/y/w/h box. */
export type BoxObject = Extract<EditorObject, { w: number }>;

export type DocState = {
  pages: PageEntry[];
  /** Drawing order: later objects draw above earlier ones on the same page. */
  objects: EditorObject[];
  /** Index of the engine byte version these pages and lines are drawn from (existing-text edits). */
  engine: number;
  /** The file's form fields and the ones the user added (F16 E3 forms, lib/forms). Absent: no form. */
  forms?: FormState;
};

let counter = 0;
/** A short id, unique within the session. */
export function newId(prefix = "o"): string {
  counter = (counter + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Normalises any angle to 0..359. */
export const norm360 = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

export const pageSize = (p: Pick<PageEntry, "view">) => ({ w: p.view[2] - p.view[0], h: p.view[3] - p.view[1] });
export const totalRotation = (p: Pick<PageEntry, "baseRotate" | "rotate">) => norm360(p.baseRotate + p.rotate);

export function initialPages(sizes: { view: [number, number, number, number]; rotate: number }[]): PageEntry[] {
  return sizes.map((s, i) => ({ id: `p${i}`, src: i, view: s.view, baseRotate: norm360(s.rotate), rotate: 0 }));
}

// ---- object geometry ----------------------------------------------------------------------

const bounds = (pts: Pt[], pad = 0): Box => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
};

/** Corners of a box turned `rot` degrees clockwise about its centre. */
export function rotatedCorners(b: Box, rot: number): Pt[] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = (rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return ([
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ] as Pt[]).map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** Axis-aligned bounds in the page frame, rotation included. */
export function objectBounds(o: EditorObject): Box {
  switch (o.kind) {
    case "line":
      return bounds([o.a, o.b], o.width / 2);
    case "ink":
      return bounds(o.points, o.width / 2);
    case "markup":
      return bounds(o.rects.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y + r.h]] as Pt[]));
    case "whiteout":
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    default:
      return o.rot ? bounds(rotatedCorners(o, o.rot)) : { x: o.x, y: o.y, w: o.w, h: o.h };
  }
}

export const hasBox = (o: EditorObject): o is BoxObject => "w" in o && "x" in o;

/** Moves an object by (dx, dy) points. */
export function moveObject<T extends EditorObject>(o: T, dx: number, dy: number): T {
  switch (o.kind) {
    case "line":
      return { ...o, a: [o.a[0] + dx, o.a[1] + dy], b: [o.b[0] + dx, o.b[1] + dy] };
    case "ink":
      return { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy] as Pt) };
    case "markup":
      return { ...o, rects: o.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) };
    default:
      return { ...o, x: (o as BoxObject).x + dx, y: (o as BoxObject).y + dy };
  }
}

/** Keeps an object's bounds inside the page (as far as it fits). Returns the shift applied. */
export function clampDelta(b: Box, dx: number, dy: number, page: { w: number; h: number }): [number, number] {
  const cx = Math.min(Math.max(b.x + dx, Math.min(0, page.w - b.w)), Math.max(0, page.w - b.w)) - b.x;
  const cy = Math.min(Math.max(b.y + dy, Math.min(0, page.h - b.h)), Math.max(0, page.h - b.h)) - b.y;
  return [cx, cy];
}

type Size = { w: number; h: number };

/** True when a box lies inside the page (with `eps` points of slack for rounding). */
export const insidePage = (b: Box, page: Size, eps = 0.01) => b.x >= -eps && b.y >= -eps && b.x + b.w <= page.w + eps && b.y + b.h <= page.h + eps;

/** Scales an object by `k` about the point `c` (page frame). Text scales its size and wrap with it. */
export function scaleObject<T extends EditorObject>(o: T, k: number, c: Pt): T {
  const sp = ([x, y]: Pt): Pt => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k];
  switch (o.kind) {
    case "line":
      return { ...o, a: sp(o.a), b: sp(o.b) };
    case "ink":
      return { ...o, points: o.points.map(sp) };
    case "markup":
      return { ...o, rects: o.rects.map((r) => ({ ...r, x: c[0] + (r.x - c[0]) * k, y: c[1] + (r.y - c[1]) * k, w: r.w * k, h: r.h * k })) };
    default: {
      const b = o as BoxObject;
      // Scale about the box centre's image so a rotated box keeps its angle.
      const [ncx, ncy] = sp([b.x + b.w / 2, b.y + b.h / 2]);
      const w = b.w * k;
      const h = b.h * k;
      const out = { ...o, x: ncx - w / 2, y: ncy - h / 2, w, h } as T;
      if (o.kind === "text") Object.assign(out, { size: o.size * k, wrap: o.wrap === null ? null : o.wrap * k });
      return out;
    }
  }
}

/**
 * Fits objects into the page: a group larger than the page (minus `margin` on each side) is scaled
 * down proportionally about its centre, then the group is shifted inside. Rotation is included
 * through the rotated bounds. Returns the objects unchanged when they already fit.
 */
export function fitToPage<T extends EditorObject>(objs: T[], page: Size, margin = 0): T[] {
  if (!objs.length) return objs;
  let u = unionOf(objs.map(objectBounds));
  if (insidePage(u, page)) return objs;
  let out = objs;
  const m = Math.min(margin, page.w / 4, page.h / 4);
  let scaled = false;
  // Strokes keep their width when scaled, so a second pass absorbs what they add.
  for (let pass = 0; pass < 3; pass++) {
    const k = Math.min(1, (page.w - 2 * m) / Math.max(u.w, 1e-6), (page.h - 2 * m) / Math.max(u.h, 1e-6));
    if (k >= 1) break;
    const c: Pt = [u.x + u.w / 2, u.y + u.h / 2];
    out = out.map((o) => scaleObject(o, k * (pass ? 0.9999 : 1), c));
    u = unionOf(out.map(objectBounds));
    scaled = true;
  }
  // A scaled-down group keeps the margin on every side; one that only hung off an edge goes flush.
  const inset = scaled ? m : 0;
  const [ix, iy] = clampDelta({ ...u, x: u.x - inset, y: u.y - inset }, 0, 0, { w: page.w - 2 * inset, h: page.h - 2 * inset });
  const [dx, dy] = [ix, iy];
  return dx || dy ? out.map((o) => moveObject(o, dx, dy)) : out;
}

/**
 * Keeps one object on its page (move, resize, rotate, nudge, paste, drop and typing all end here).
 * Unrotated text that runs past the right edge wraps at the edge (via `reflow`, which lays the text
 * out at a new wrap width) instead of shrinking; anything else larger than the page scales down
 * with `margin`, and anything hanging off an edge is shifted back on.
 */
export function keepOnPage(o: EditorObject, page: Size, reflow?: (t: TextObj, wrap: number) => TextObj, margin = 12): EditorObject {
  if (insidePage(objectBounds(o), page)) return o;
  let t = o;
  if (t.kind === "text" && !t.rot && reflow && t.x + t.w > page.w) {
    // Keep at least a few words of room: a box that starts near the right edge moves left first.
    const least = Math.min(t.w, t.size * 8, page.w);
    const x = Math.min(Math.max(0, t.x), page.w - least);
    const room = page.w - x;
    t = t.w > room ? reflow({ ...t, x }, room) : { ...t, x };
  } else if (t.kind === "text" && t.rot && reflow) t = wrapRotated(t, page, reflow, margin);
  return fitToPage([t], page, margin)[0];
}

/**
 * A rotated text box past the page edge wraps too, rather than shrinking: its first corner (where
 * the text starts) stays put, and the widest wrap, down to a few words, that keeps the box on the
 * page wins. If none does from there, the widest wrap whose size fits the page is kept and
 * fitToPage slides it in; if none fits at all, the box is left as it was (fitToPage shrinks it).
 */
function wrapRotated(t: TextObj, page: Size, reflow: (t: TextObj, wrap: number) => TextObj, margin: number): TextObj {
  // fitToPage slides a box on without shrinking it only when it fits inside its margins.
  const m = 2 * Math.min(margin, page.w / 4, page.h / 4);
  const [ax, ay] = rotatedCorners(t, t.rot)[0];
  const at = (w: number): TextObj => {
    const r = reflow(t, w);
    const [cx, cy] = rotatedCorners(r, t.rot)[0];
    return { ...r, x: r.x + ax - cx, y: r.y + ay - cy };
  };
  const least = Math.min(t.w, t.size * 8);
  const steps = 24;
  let sized: TextObj | null = null;
  for (let i = 1; i <= steps && t.w > least; i++) {
    const r = at(t.w - ((t.w - least) * i) / steps);
    const b = objectBounds(r);
    if (insidePage(b, page)) return r;
    if (!sized && b.w <= page.w - m && b.h <= page.h - m) sized = r;
  }
  return sized ?? t;
}

function unionOf(bs: Box[]): Box {
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A point kept on the page. */
export const clampPoint = (p: Pt, page: Size): Pt => [Math.min(Math.max(p[0], 0), page.w), Math.min(Math.max(p[1], 0), page.h)];

/**
 * Resizes like `resizeBox`, but never past the page edge: an unrotated box stops at the edge per
 * axis; a rotated or aspect-locked box stops growing where its rotated bounds first touch the edge
 * (the anchored corner or side stays put). A box that was already off the page may still shrink.
 */
export function clampedResize(b: Box & { rot: number }, handle: Handle, p: Pt, keepAspect: boolean, page: Size): Box {
  const q = b.rot ? p : clampPoint(p, page);
  const next = resizeBox(b, handle, q, keepAspect);
  const fits = (x: Box) => insidePage(b.rot ? bounds(rotatedCorners(x, b.rot)) : x, page);
  if (fits(next) || !fits(b)) return next;
  // Between the start box and the wanted one, the anchor stays fixed and the aspect is kept, so
  // the largest box that fits lies on the straight path between them.
  let lo = 0;
  let hi = 1;
  const at = (t: number): Box => ({ x: b.x + (next.x - b.x) * t, y: b.y + (next.y - b.y) * t, w: b.w + (next.w - b.w) * t, h: b.h + (next.h - b.h) * t });
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    if (fits(at(t))) lo = t;
    else hi = t;
  }
  return at(lo);
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Which handles an object gets (U-E4 table). */
export function handlesOf(o: EditorObject): Handle[] {
  switch (o.kind) {
    case "image":
    case "signature":
      return ["nw", "ne", "se", "sw"];
    case "shape":
    case "whiteout":
      return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    case "text":
      return ["w", "e"];
    default:
      return [];
  }
}

export const canRotate = (o: EditorObject) => o.kind === "image" || o.kind === "signature" || o.kind === "shape";
export const aspectLocked = (o: EditorObject) => o.kind === "image" || o.kind === "signature";

const MIN = 4;

/**
 * Resizes a box from `handle` with the pointer at `p` (page frame). Works in the box's own frame,
 * so rotated boxes resize along their sides, and the opposite corner or side stays put.
 * `keepAspect` locks the width/height ratio.
 */
export function resizeBox(b: Box & { rot: number }, handle: Handle, p: Pt, keepAspect: boolean): Box {
  const r = (b.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Pointer in the box's local frame (origin at the centre, unrotated).
  const lx = (p[0] - cx) * c + (p[1] - cy) * s;
  const ly = -(p[0] - cx) * s + (p[1] - cy) * c;
  let x0 = -b.w / 2;
  let y0 = -b.h / 2;
  let x1 = b.w / 2;
  let y1 = b.h / 2;
  if (handle.includes("w")) x0 = Math.min(lx, x1 - MIN);
  if (handle.includes("e")) x1 = Math.max(lx, x0 + MIN);
  if (handle.includes("n")) y0 = Math.min(ly, y1 - MIN);
  if (handle.includes("s")) y1 = Math.max(ly, y0 + MIN);
  if (keepAspect && b.w > 0 && b.h > 0) {
    const ratio = b.w / b.h;
    let w = x1 - x0;
    let h = y1 - y0;
    if (handle.length === 2) {
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
    } else if (handle === "e" || handle === "w") h = w / ratio;
    else w = h * ratio;
    if (handle.includes("w")) x0 = x1 - w;
    else if (handle.includes("e")) x1 = x0 + w;
    else {
      x0 = -w / 2;
      x1 = w / 2;
    }
    if (handle.includes("n")) y0 = y1 - h;
    else if (handle.includes("s")) y1 = y0 + h;
    else {
      y0 = -h / 2;
      y1 = h / 2;
    }
  }
  // New centre in local coordinates, back to the page frame.
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const ncx = cx + mx * c - my * s;
  const ncy = cy + mx * s + my * c;
  const w = x1 - x0;
  const h = y1 - y0;
  return { x: ncx - w / 2, y: ncy - h / 2, w, h };
}

/** Rotation angle (clockwise degrees) for a rotate handle dragged to `p`: snaps to quarter turns within 5°, or steps by 15°. */
export function rotationFor(b: Box, p: Pt, step15: boolean): number {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let deg = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90;
  deg = norm360(deg);
  if (step15) return norm360(Math.round(deg / 15) * 15);
  const q = Math.round(deg / 90) * 90;
  return Math.abs(deg - q) <= 5 ? norm360(q) : deg;
}

/** Line end dragged to `p`; Shift keeps the line at a multiple of 45°. */
export function constrain45(from: Pt, p: Pt): Pt {
  const dx = p[0] - from[0];
  const dy = p[1] - from[1];
  const len = Math.hypot(dx, dy);
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [from[0] + Math.cos(a) * len, from[1] + Math.sin(a) * len];
}

/** A box from a drag (any direction); `square` keeps it square (Shift). */
export function dragBox(a: Pt, b: Pt, square = false): Box {
  let w = b[0] - a[0];
  let h = b[1] - a[1];
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * m;
    h = Math.sign(h || 1) * m;
  }
  return { x: Math.min(a[0], a[0] + w), y: Math.min(a[1], a[1] + h), w: Math.abs(w), h: Math.abs(h) };
}

// ---- document operations --------------------------------------------------------------------

export const objectsOn = (s: DocState, pageId: string) => s.objects.filter((o) => o.page === pageId);

export function addObjects(s: DocState, objs: EditorObject[]): DocState {
  return { ...s, objects: [...s.objects, ...objs] };
}

export function updateObjects(s: DocState, ids: readonly string[], fn: (o: EditorObject) => EditorObject): DocState {
  const set = new Set(ids);
  return { ...s, objects: s.objects.map((o) => (set.has(o.id) ? fn(o) : o)) };
}

export function removeObjects(s: DocState, ids: readonly string[]): DocState {
  const set = new Set(ids);
  return { ...s, objects: s.objects.filter((o) => !set.has(o.id)) };
}

/**
 * Copies of the objects, each a line (or 16 pt) lower, or on the next page at the same spot
 * (`nextPage`, AC-58). Returns the new state and the copies' ids.
 */
export function duplicateObjects(s: DocState, ids: readonly string[], nextPage = false): { state: DocState; ids: string[] } {
  const copies: EditorObject[] = [];
  for (const o of s.objects) {
    if (!ids.includes(o.id)) continue;
    if (nextPage) {
      const i = s.pages.findIndex((p) => p.id === o.page);
      const next = s.pages[i + 1];
      if (!next) continue;
      copies.push({ ...o, id: newId(), page: next.id });
    } else {
      const step = o.kind === "text" ? o.size * LINE_HEIGHT : Math.max(16, objectBounds(o).h + 8);
      copies.push({ ...moveObject(o, 0, step), id: newId() });
    }
  }
  return { state: addObjects(s, copies), ids: copies.map((o) => o.id) };
}

/** Moves objects one step up (`+1`, bring forward) or down (`-1`, send backward) among the objects of their page. */
export function reorderObjects(s: DocState, ids: readonly string[], dir: 1 | -1): DocState {
  const list = [...s.objects];
  const set = new Set(ids);
  const order = dir === 1 ? [...list.keys()].reverse() : [...list.keys()];
  for (const i of order) {
    const o = list[i];
    if (!set.has(o.id)) continue;
    // Next object on the same page in that direction, skipping selected ones.
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j].page !== o.page) j += dir;
    if (j < 0 || j >= list.length || set.has(list[j].id)) continue;
    list.splice(i, 1);
    list.splice(j, 0, o);
  }
  return { ...s, objects: list };
}

/** Line height used for added text, as a multiple of the font size (screen and output). */
export const LINE_HEIGHT = 1.25;

// ---- page operations ------------------------------------------------------------------------

export function rotatePage(s: DocState, pageId: string, delta: 90 | -90): DocState {
  return { ...s, pages: s.pages.map((p) => (p.id === pageId ? { ...p, rotate: norm360(p.rotate + delta) } : p)) };
}

/** Deletes a page and its objects. The last remaining page is never deleted. */
export function deletePage(s: DocState, pageId: string): DocState {
  if (s.pages.length <= 1) return s;
  const pages = s.pages.filter((p) => p.id !== pageId);
  return { ...s, pages, objects: s.objects.filter((o) => o.page !== pageId), ...(s.forms ? { forms: prunePages(s.forms, pages.map((p) => p.id)) } : {}) };
}

/** Duplicates a page right after itself, with copies of its objects. */
export function duplicatePage(s: DocState, pageId: string): { state: DocState; id: string } {
  const i = s.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return { state: s, id: pageId };
  const id = newId("p");
  const pages = [...s.pages];
  pages.splice(i + 1, 0, { ...s.pages[i], id });
  const copies = s.objects.filter((o) => o.page === pageId).map((o) => ({ ...o, id: newId(), page: id }));
  // Fields on the page show on the copy too, as more widgets of the same fields (same values).
  const forms = s.forms ? { forms: duplicateWidgetsToPage(s.forms, pageId, id) } : {};
  return { state: { ...s, pages, objects: [...s.objects, ...copies], ...forms }, id };
}

/** Inserts a blank page after `pageId`, the same size and orientation as it. */
export function insertBlankAfter(s: DocState, pageId: string): { state: DocState; id: string } {
  const i = s.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return { state: s, id: pageId };
  const ref = s.pages[i];
  const { w, h } = pageSize(ref);
  const id = newId("p");
  const pages = [...s.pages];
  pages.splice(i + 1, 0, { id, src: null, view: [0, 0, w, h], baseRotate: ref.baseRotate, rotate: ref.rotate });
  return { state: { ...s, pages }, id };
}

/** Moves a page to index `to` (AC-80 thumbnail reorder). */
export function movePage(s: DocState, pageId: string, to: number): DocState {
  const i = s.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return s;
  const pages = [...s.pages];
  const [p] = pages.splice(i, 1);
  pages.splice(Math.max(0, Math.min(pages.length, to)), 0, p);
  return { ...s, pages };
}

/** True when the state differs from the untouched document (no objects, original pages, no text edits). */
/** No edits at all. `forms` is the form as read from the file (a changed form is an edit). */
export function isPristine(s: DocState, forms?: FormState): boolean {
  return !s.objects.length && !s.engine && (!s.forms || s.forms === forms) && s.pages.every((p, i) => p.src === i && !p.rotate && p.id === `p${i}`);
}

// ---- names (accessible names, object list, history) -----------------------------------------

const KIND_NAMES: Record<ObjectKind, string> = {
  text: "Text",
  image: "Image",
  signature: "Signature",
  shape: "Shape",
  line: "Line",
  ink: "Drawing",
  markup: "Highlight",
  whiteout: "Whiteout",
};

/** Short type name: "Text", "Initials", "Rectangle", "Underline"… */
export function kindName(o: EditorObject): string {
  if (o.kind === "signature") return o.role === "initials" ? "Initials" : "Signature";
  if (o.kind === "shape") return o.shape === "rect" ? "Rectangle" : "Ellipse";
  if (o.kind === "line") return o.arrow ? "Arrow" : "Line";
  if (o.kind === "markup") return o.type === "highlight" ? "Highlight" : o.type === "underline" ? "Underline" : "Strike-out";
  if (o.kind === "ink") return o.marker ? "Marker" : "Drawing";
  return KIND_NAMES[o.kind];
}

/** Object list row and accessible name: "Text: Signed by A. Rao", "Highlight: quarterly total", "Rectangle". */
export function objectLabel(o: EditorObject): string {
  const name = kindName(o);
  const text = o.kind === "text" ? o.text : o.kind === "markup" ? o.text : o.kind === "signature" && o.sig.type === "typed" ? o.sig.text : "";
  const short = text.replace(/\s+/g, " ").trim();
  return short ? `${name}: ${short.length > 40 ? `${short.slice(0, 39)}…` : short}` : name;
}
