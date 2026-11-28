/**
 * Split pages in half (spec F7 §4): a scan with two pages side by side (or one above the other)
 * becomes two pages. Nothing is redrawn: each half is the same page with a smaller box, so text
 * stays text and images are stored once.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFPage, type PDFObject } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";

export type HalfDirection = "auto" | "sideBySide" | "topBottom";
export type HalfOptions = {
  direction: HalfDirection;
  /** Side by side only: the right half comes first (books read right to left). */
  rightToLeft: boolean;
  /** The sheets were scanned as an unstapled booklet (12-1, 2-11, 10-3 …): put the pages back in order. */
  booklet: boolean;
};
export const HALF_DEFAULTS: HalfOptions = { direction: "auto", rightToLeft: false, booklet: false };

export type Box = { x: number; y: number; width: number; height: number };

/** Auto: a page shown wider than tall holds two pages side by side; a tall one, one above the other. */
export function resolveDirection(direction: HalfDirection, box: Box, rotate: number): "sideBySide" | "topBottom" {
  if (direction !== "auto") return direction;
  const turned = rotate % 180 !== 0;
  const [w, h] = turned ? [box.height, box.width] : [box.width, box.height];
  return w >= h ? "sideBySide" : "topBottom";
}

/**
 * The two halves of a page box as the reader sees them, first then second: left then right, or top
 * then bottom. `rotate` is the page's own /Rotate (clockwise), which decides what "left" and "top"
 * are in the page's coordinates.
 */
export function halfBoxes(box: Box, rotate: number, direction: "sideBySide" | "topBottom"): [Box, Box] {
  const r = ((rotate % 360) + 360) % 360;
  const alongX = (direction === "sideBySide") === (r % 180 === 0);
  const low: Box = alongX ? { ...box, width: box.width / 2 } : { ...box, height: box.height / 2 };
  const high: Box = alongX ? { ...low, x: box.x + box.width / 2 } : { ...low, y: box.y + box.height / 2 };
  // Which end of the axis the reader meets first (left, or top), per rotation.
  const lowFirst = direction === "sideBySide" ? r === 0 || r === 90 : r === 90 || r === 180;
  return lowFirst ? [low, high] : [high, low];
}

/**
 * Booklet scans: the halves, in the order they were cut (sheet by sheet, first half then second),
 * hold pages N, 1, 2, N-1, N-2, 3, 4, … Returns, for each place in reading order, which cut half goes there.
 */
export function bookletOrder(halves: number): number[] {
  const pageOf = Array.from({ length: halves }, (_, i) => {
    const sheet = i >> 1;
    const first = i % 2 === 0;
    return (sheet % 2 === 0) === first ? halves - sheet : sheet + 1;
  });
  return pageOf.map((_, i) => i).sort((a, b) => pageOf[a] - pageOf[b]);
}

export type SplitHalfInput = { bytes: Uint8Array; password?: string; /** 0-based pages to cut; the others stay whole. */ cut: readonly number[]; options: HalfOptions };

/** The part of the crop box that lies on the page: a crop box may reach past the media box, where there is nothing. */
export function visibleBox(crop: Box, media: Box): Box {
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
  const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : media;
}

const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

/**
 * Works on the file itself (like Rotate), so bookmarks, form fields and document information stay.
 * Each cut page becomes two page objects with the same content and half the box each; a link or a
 * form field goes to the half its middle lies on.
 */
export async function splitHalfPdf({ bytes, password, cut, options }: SplitHalfInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  const cutSet = new Set(cut);
  // Slots in scan order; a half remembers that it is one, for the booklet order.
  const slots: { page: PDFPage; half: boolean }[] = [];
  pages.forEach((page, i) => {
    if (!cutSet.has(i)) return void slots.push({ page, half: false });
    const box = visibleBox(page.getCropBox(), page.getMediaBox());
    const rotate = page.getRotation().angle;
    const direction = resolveDirection(options.direction, box, rotate);
    let [first, second] = halfBoxes(box, rotate, direction);
    if (direction === "sideBySide" && options.rightToLeft) [first, second] = [second, first];
    // The second half is the same page object again: same content and images, its own box.
    const leaf = page.node.clone(doc.context);
    for (const key of ["Annots", "StructParents", "B"]) leaf.delete(PDFName.of(key));
    const twinRef = doc.context.register(leaf);
    const twin = PDFPage.of(leaf, twinRef, doc);
    // Links and fields: each stays with the half that shows its middle.
    const annots = page.node.Annots();
    if (annots) {
      const keep: PDFObject[] = [];
      const move: PDFObject[] = [];
      for (let k = 0; k < annots.size(); k++) {
        const entry = annots.get(k);
        const dict = annots.lookupMaybe(k, PDFDict);
        const rect = dict?.lookupMaybe(PDFName.of("Rect"), PDFArray);
        const n = rect && rect.size() === 4 ? [0, 1, 2, 3].map((j) => rect.lookupMaybe(j, PDFNumber)?.asNumber() ?? 0) : null;
        const onSecond = !!n && !inside(first, (n[0] + n[2]) / 2, (n[1] + n[3]) / 2) && inside(second, (n[0] + n[2]) / 2, (n[1] + n[3]) / 2);
        if (onSecond && dict) {
          if (dict.has(PDFName.of("P"))) dict.set(PDFName.of("P"), twinRef);
          move.push(entry);
        } else keep.push(entry);
      }
      if (keep.length) page.node.set(PDFName.of("Annots"), doc.context.obj(keep));
      else page.node.delete(PDFName.of("Annots"));
      if (move.length) leaf.set(PDFName.of("Annots"), doc.context.obj(move));
    }
    for (const [p, b] of [[page, first], [twin, second]] as const) {
      for (const key of ["TrimBox", "BleedBox", "ArtBox"]) p.node.delete(PDFName.of(key));
      p.setMediaBox(b.x, b.y, b.width, b.height);
      p.setCropBox(b.x, b.y, b.width, b.height);
      slots.push({ page: p, half: true });
    }
    onProgress?.((0.5 * (i + 1)) / pages.length);
  });
  const halves = slots.filter((s) => s.half).map((s) => s.page);
  const ordered = options.booklet && halves.length % 2 === 0 ? bookletOrder(halves.length).map((i) => halves[i]) : halves;
  let next = 0;
  const final = slots.map((slot) => (slot.half ? ordered[next++] : slot.page));
  // One flat page list in the new order. The page objects (and the bookmarks and links that point at
  // them) stay the same; what a page took from the nodes above it is written onto the page first.
  const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"].map((k) => PDFName.of(k));
  for (const page of final) {
    for (const key of INHERITED) {
      const value = page.node.get(key) ?? page.node.getInheritableAttribute(key);
      if (value && !page.node.has(key)) page.node.set(key, value);
    }
  }
  const rootRef = doc.catalog.get(PDFName.of("Pages"));
  const root = doc.catalog.Pages();
  for (const key of INHERITED) root.delete(key);
  root.set(PDFName.of("Kids"), doc.context.obj(final.map((page) => page.ref)));
  root.set(PDFName.of("Count"), PDFNumber.of(final.length));
  for (const page of final) if (rootRef) page.node.set(PDFName.of("Parent"), rootRef);
  const saved = await doc.save();
  onProgress?.(1);
  return { bytes: saved, pageCount: final.length, wasEncrypted };
}
