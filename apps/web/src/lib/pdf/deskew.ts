/**
 * Deskew (spec F15 §1): turns the content of tilted pages by a small angle about the middle of the
 * page. The content is drawn through a matrix, not redrawn: text stays text, pictures keep every
 * pixel, and the page keeps its size. Worker-only: this module pulls in the PDF library.
 */
import { hidesContent, shownBox, transformAnnotations, transformContent, type Box, type Matrix } from "./page-geometry";
import { loadForEdit } from "./rotate";

export type DeskewInput = { bytes: Uint8Array; password?: string; /** 0-based page → degrees to turn it clockwise, as the reader sees it. */ turns: Readonly<Record<number, number>> };

/** A clockwise turn (as seen on screen) about the middle of the box. A page's own quarter turns do not change the sense. */
export function turnMatrix(box: Box, degreesClockwise: number): Matrix {
  const t = (-degreesClockwise * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

export async function deskewPdf({ bytes, password, turns }: DeskewInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const all = doc.getPages();
  all.forEach((page, i) => {
    const turn = turns[i];
    if (turn && Number.isFinite(turn)) {
      const { box } = shownBox(page);
      const m = turnMatrix(box, turn);
      // What the page box hid stays hidden: a turn must not swing it into a corner.
      transformContent(doc, page, m, hidesContent(page, box) ? box : undefined);
      transformAnnotations(doc, page, m, true);
    }
    onProgress?.((0.6 * (i + 1)) / all.length);
  });
  return { bytes: await doc.save(), pageCount: all.length, wasEncrypted };
}
