import type { PageSize } from "@/lib/pdf/pdfjs";

/** Width / height of a page tile's box (--ip-tile-aspect): A-series portrait. */
export const TILE_ASPECT = 1 / Math.SQRT2;

const pct = (n: number) => `${+(n * 100).toFixed(3)}%`;

/** The page's fitted size as fractions of the box's width and height (unrotated). */
function fit(size: PageSize, boxAspect: number): [number, number] {
  const a = size.width / size.height;
  return a <= boxAspect ? [a / boxAspect, 1] : [1, boxAspect / a];
}

/**
 * The page inside a tile's page-shaped box (`.ip-tile__box`), contained at its aspect ratio. Pages at
 * least as wide as A4 fill the box's width. `boxAspect` 1 gives the old square box.
 */
export function pageBoxStyle(size: PageSize, boxAspect = TILE_ASPECT): { width: string; height: string } {
  const [w, h] = fit(size, boxAspect);
  return { width: pct(w), height: pct(h) };
}

/**
 * The scale that fits a page turned by `rotation` (a multiple of 90) in the same box: 1 unless the turn
 * is a quarter. Thumbnails draw for it too (PageThumb `scale`), so a turned page that grows stays sharp.
 */
export function pageTurnScale(size: PageSize, rotation: number, boxAspect = TILE_ASPECT): number {
  const odd = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  if (!odd) return 1;
  const [w, h] = fit(size, boxAspect); // in box widths (w) and box heights (h)
  // Turned, the element is h*H wide and w*W tall; scale so it fits W x H (H = W / boxAspect).
  return Math.min(boxAspect / h, 1 / (w * boxAspect));
}

/**
 * The CSS transform for a page shown turned by `rotation` (a multiple of 90): the rotation plus the
 * scale that fits the turned page in the same box. Transform only, so the turn animates on the
 * compositor (motion.md section 4) and the box never changes size.
 */
export function pageTransform(size: PageSize, rotation: number, boxAspect = TILE_ASPECT): string {
  const k = pageTurnScale(size, rotation, boxAspect);
  return k === 1 && Math.abs(Math.round(rotation / 90)) % 2 === 0 ? `rotate(${rotation}deg)` : `rotate(${rotation}deg) scale(${+k.toFixed(4)})`;
}
