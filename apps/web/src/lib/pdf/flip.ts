/**
 * Flip (spec F8 §1): mirrors pages left to right or top to bottom, as the reader sees them. The
 * content is drawn through a mirror matrix, so text stays text (it reads backwards, which is the point).
 */
import { shownBox, transformAnnotations, transformContent, type Matrix } from "./page-geometry";
import { loadForEdit } from "./rotate";

import type { FlipDirection } from "./page-shape-options";

export type { FlipDirection };
export type FlipInput = { bytes: Uint8Array; password?: string; /** 0-based pages to flip. */ pages: readonly number[]; direction: FlipDirection };

/** The mirror for a page: across the middle of what the reader sees, along the reader's own left-right or up-down. */
export function flipMatrix(box: { x: number; y: number; width: number; height: number }, rotate: number, direction: FlipDirection): Matrix {
  // On a page turned a quarter, the reader's left-right is the page's up-down.
  const alongX = (direction === "horizontal") === (rotate % 180 === 0);
  return alongX ? [-1, 0, 0, 1, 2 * box.x + box.width, 0] : [1, 0, 0, -1, 0, 2 * box.y + box.height];
}

export async function flipPdf({ bytes, password, pages, direction }: FlipInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const all = doc.getPages();
  const picked = new Set(pages);
  all.forEach((page, i) => {
    if (picked.has(i)) {
      const { box, rotate } = shownBox(page);
      const m = flipMatrix(box, rotate, direction);
      transformContent(doc, page, m);
      transformAnnotations(doc, page, m);
    }
    onProgress?.((0.6 * (i + 1)) / all.length);
  });
  return { bytes: await doc.save(), pageCount: all.length, wasEncrypted };
}
