/**
 * Auto trim (spec F8 §3): where the ink is on a drawn page. Works on the pixels of a small picture
 * of the page, so it sees what a reader sees (text, pictures, scans alike).
 */
import { clampArea, type Area } from "./area";

/** A pixel lighter than this on every channel counts as paper. */
const PAPER = 244;
/** Breathing room kept around the ink, as a share of the page. */
const PAD = 0.012;

/** The area that holds everything that is not paper white, with a little room; the whole page when it is blank. */
export function contentArea(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Area {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      // Transparent pixels are paper too.
      if (rgba[i + 3] < 16 || (rgba[i] > PAPER && rgba[i + 1] > PAPER && rgba[i + 2] > PAPER)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  const left = Math.max(0, x0 / width - PAD);
  const top = Math.max(0, y0 / height - PAD);
  const right = Math.min(1, (x1 + 1) / width + PAD);
  const bottom = Math.min(1, (y1 + 1) / height + PAD);
  return clampArea({ x: left, y: top, w: right - left, h: bottom - top });
}

/** The smallest area that holds all of `areas`: one crop that loses no page's content. */
export function unionArea(areas: readonly Area[]): Area {
  if (!areas.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...areas.map((a) => a.x));
  const y = Math.min(...areas.map((a) => a.y));
  return { x, y, w: Math.max(...areas.map((a) => a.x + a.w)) - x, h: Math.max(...areas.map((a) => a.y + a.h)) - y };
}
