/**
 * Split pages in half (spec F7 §4): a scan with two pages side by side (or one above the other)
 * becomes two pages. Nothing is redrawn: each half is the same page with a smaller box, so text
 * stays text and images are stored once.
 */
import { PDFDocument, PDFName, PDFPage } from "@cantoo/pdf-lib";
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

export async function splitHalfPdf({ bytes, password, cut, options }: SplitHalfInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc: source, wasEncrypted } = await loadForEdit(bytes, password);
  const out = await PDFDocument.create({ updateMetadata: false });
  const count = source.getPageCount();
  const copied = await out.copyPages(source, Array.from({ length: count }, (_, i) => i));
  const cutSet = new Set(cut);
  // Slots in scan order; a half remembers its place among the halves for the booklet order.
  const slots: { page: PDFPage; half: boolean }[] = [];
  copied.forEach((page, i) => {
    if (!cutSet.has(i)) return void slots.push({ page, half: false });
    const box = page.getCropBox();
    const rotate = page.getRotation().angle;
    const direction = resolveDirection(options.direction, box, rotate);
    let [first, second] = halfBoxes(box, rotate, direction);
    if (direction === "sideBySide" && options.rightToLeft) [first, second] = [second, first];
    // The second half is the same page object again: same content and images, its own box.
    const leaf = page.node.clone(out.context);
    leaf.delete(PDFName.of("Annots"));
    const twin = PDFPage.of(leaf, out.context.register(leaf), out);
    for (const [p, b] of [[page, first], [twin, second]] as const) {
      for (const key of ["TrimBox", "BleedBox", "ArtBox"]) p.node.delete(PDFName.of(key));
      p.setMediaBox(b.x, b.y, b.width, b.height);
      p.setCropBox(b.x, b.y, b.width, b.height);
      slots.push({ page: p, half: true });
    }
    onProgress?.((0.5 * (i + 1)) / count);
  });
  const halves = slots.filter((s) => s.half).map((s) => s.page);
  const ordered = options.booklet && halves.length % 2 === 0 ? bookletOrder(halves.length).map((i) => halves[i]) : halves;
  let next = 0;
  for (const slot of slots) out.addPage(slot.half ? ordered[next++] : slot.page);
  const title = source.getTitle();
  if (title) out.setTitle(title);
  const saved = await out.save();
  onProgress?.(1);
  return { bytes: saved, pageCount: out.getPageCount(), wasEncrypted };
}
