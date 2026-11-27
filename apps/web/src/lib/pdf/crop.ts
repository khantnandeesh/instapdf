/**
 * Crop (spec F8 §3): each page keeps only an area of itself. The page's box is made smaller; the
 * content is not rewritten, so what lies outside the box is hidden, not erased.
 */
import type { Area } from "./area";
import { areaToBox, setPageBox, shownBox } from "./page-geometry";
import { loadForEdit } from "./rotate";

export type CropInput = { bytes: Uint8Array; password?: string; /** The area to keep per 0-based page, in fractions of the page as shown; pages without one stay whole. */ areas: Readonly<Record<number, Area>> };

/** An area that keeps the whole page (or is too thin to be a page) changes nothing. */
export const isWholePage = (a: Area) => a.x <= 0.001 && a.y <= 0.001 && a.w >= 0.998 && a.h >= 0.998;

export async function cropPdf({ bytes, password, areas }: CropInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const all = doc.getPages();
  all.forEach((page, i) => {
    const area = areas[i];
    if (area && !isWholePage(area)) {
      const { box, rotate } = shownBox(page);
      const next = areaToBox(area, box, rotate);
      // A box thinner than a point is not a page any reader opens.
      if (next.width >= 1 && next.height >= 1) setPageBox(page, next);
    }
    onProgress?.((0.6 * (i + 1)) / all.length);
  });
  return { bytes: await doc.save(), pageCount: all.length, wasEncrypted };
}
