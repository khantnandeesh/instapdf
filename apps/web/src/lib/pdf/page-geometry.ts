/**
 * Page geometry shared by the page-shape tools (spec F8: Crop, Resize, Flip, N-up): where a spot on
 * the page as shown lies in the page's own coordinates, and how to move a page's content and its
 * links, notes and fields by one matrix. Nothing is redrawn: text stays text.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";
import type { Area } from "./area";
import { visibleBox, type Box } from "./split-half";

export type { Box };

/** A PDF matrix [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const applyMatrix = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const turn = (rotate: number) => ((rotate % 360) + 360) % 360;

/** The part of the page a reader sees, in page coordinates, and its /Rotate (0, 90, 180, 270 clockwise). */
export function shownBox(page: PDFPage): { box: Box; rotate: number } {
  return { box: visibleBox(page.getCropBox(), page.getMediaBox()), rotate: turn(page.getRotation().angle) };
}

/** The size the reader sees: width and height swap on a page turned a quarter. */
export function shownSize(box: Box, rotate: number): { width: number; height: number } {
  return turn(rotate) % 180 === 0 ? { width: box.width, height: box.height } : { width: box.height, height: box.width };
}

/** A point on the page as shown (fractions, 0,0 = top left) in page coordinates. */
export function shownToPage(u: number, v: number, box: Box, rotate: number): [number, number] {
  switch (turn(rotate)) {
    case 90:
      return [box.x + v * box.width, box.y + u * box.height];
    case 180:
      return [box.x + (1 - u) * box.width, box.y + v * box.height];
    case 270:
      return [box.x + (1 - v) * box.width, box.y + (1 - u) * box.height];
    default:
      return [box.x + u * box.width, box.y + (1 - v) * box.height];
  }
}

/** An area of the page as shown, as a box in page coordinates. */
export function areaToBox(area: Area, box: Box, rotate: number): Box {
  const [x0, y0] = shownToPage(area.x, area.y, box, rotate);
  const [x1, y1] = shownToPage(area.x + area.w, area.y + area.h, box, rotate);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

/** Amounts for the four sides as the reader sees them. */
export type Sides = { top: number; right: number; bottom: number; left: number };

/** The same amounts for the sides of the page's own box: which side is "top" depends on the rotation. */
export function sidesToPage(s: Sides, rotate: number): { x0: number; y0: number; x1: number; y1: number } {
  switch (turn(rotate)) {
    case 90:
      return { x0: s.top, x1: s.bottom, y0: s.left, y1: s.right };
    case 180:
      return { x0: s.right, x1: s.left, y0: s.top, y1: s.bottom };
    case 270:
      return { x0: s.bottom, x1: s.top, y0: s.right, y1: s.left };
    default:
      return { x0: s.left, x1: s.right, y0: s.bottom, y1: s.top };
  }
}

/** Sets the page's box: what is printed and what is shown become the same rectangle. */
export function setPageBox(page: PDFPage, b: Box) {
  for (const key of ["TrimBox", "BleedBox", "ArtBox"]) page.node.delete(PDFName.of(key));
  page.setMediaBox(b.x, b.y, b.width, b.height);
  page.setCropBox(b.x, b.y, b.width, b.height);
}

const num = (n: number) => String(Math.round(n * 1e5) / 1e5);

/**
 * Draws everything on the page through `m`: the content is wrapped, not rewritten. With `clip`
 * (in the page's coordinates before `m`), nothing outside that box is drawn any more: what the old
 * page box hid stays hidden when the new one is larger.
 */
export function transformContent(doc: PDFDocument, page: PDFPage, m: Matrix, clip?: Box) {
  // Two pages may point at one list of content streams: this page gets its own list first, so the wrap stays on it.
  const contents = page.node.get(PDFName.of("Contents"));
  const list = contents && doc.context.lookup(contents);
  if (list instanceof PDFArray) page.node.set(PDFName.of("Contents"), doc.context.obj(list.asArray()));
  // Normalising first closes any graphics state the page left open, so the matrix cannot leak or be undone.
  page.node.normalize();
  const cut = clip ? `${[clip.x, clip.y, clip.width, clip.height].map(num).join(" ")} re W n\n` : "";
  const start = doc.context.register(doc.context.stream(`q ${m.map(num).join(" ")} cm\n${cut}`));
  const end = doc.context.register(doc.context.stream("\nQ"));
  page.node.wrapContentStreams(start, end);
}

/** True when the page's shown box is smaller than its media box: something is hidden outside it. */
export function hidesContent(page: PDFPage, box: Box): boolean {
  const media = page.getMediaBox();
  return box.x > media.x + 0.01 || box.y > media.y + 0.01 || box.x + box.width < media.x + media.width - 0.01 || box.y + box.height < media.y + media.height - 0.01;
}

const numbers = (arr: PDFArray) => Array.from({ length: arr.size() }, (_, i) => arr.lookupMaybe(i, PDFNumber)?.asNumber() ?? 0);

function movePairs(arr: PDFArray, m: Matrix, doc: PDFDocument): PDFObject {
  const n = numbers(arr);
  const out: number[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push(...applyMatrix(m, n[i], n[i + 1]));
  return doc.context.obj(out);
}

/** Moves the page's links, notes and form fields with the content: their rectangles and their point lists. */
export function transformAnnotations(doc: PDFDocument, page: PDFPage, m: Matrix) {
  const annots = page.node.Annots();
  if (!annots) return;
  for (let k = 0; k < annots.size(); k++) {
    const dict = annots.lookupMaybe(k, PDFDict);
    if (!dict) continue;
    const rect = dict.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (rect && rect.size() === 4) {
      const n = numbers(rect);
      const [ax, ay] = applyMatrix(m, n[0], n[1]);
      const [bx, by] = applyMatrix(m, n[2], n[3]);
      dict.set(PDFName.of("Rect"), doc.context.obj([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]));
    }
    for (const key of ["QuadPoints", "Vertices", "L", "CL"]) {
      const points = dict.lookupMaybe(PDFName.of(key), PDFArray);
      if (points) dict.set(PDFName.of(key), movePairs(points, m, doc));
    }
    const ink = dict.lookupMaybe(PDFName.of("InkList"), PDFArray);
    if (ink) dict.set(PDFName.of("InkList"), doc.context.obj(Array.from({ length: ink.size() }, (_, i) => ink.lookupMaybe(i, PDFArray)).filter((a): a is PDFArray => !!a).map((a) => movePairs(a, m, doc))));
  }
}
