/**
 * Text markup selection (AC-27, AC-71, AC-78). Pure, unit tested.
 *
 * Words come from the edit engine's own reading of the page (exact glyph boxes, also after an
 * existing-text edit), so a highlight covers the glyphs, not a guess. A drag from A to B selects
 * every word between the word nearest A and the word nearest B, in reading order; each line's
 * part becomes one box.
 */
import type { Box, Pt } from "./model";

export type FrameWord = { line: number; text: string; box: Box };

const dist = (b: Box, [x, y]: Pt) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));

/** Index of the word under (or nearest to) a point, or -1 if none within `max` points. */
export function nearestWord(words: FrameWord[], p: Pt, max = Infinity): number {
  let best = -1;
  let bestD = max;
  words.forEach((w, i) => {
    const d = dist(w.box, p);
    if (d < bestD || (d === 0 && best < 0)) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Word `i` for a point on it; for a point in a gap beside it, its neighbour on that side when `later` says the word lies past the point. */
function gapSnap(words: FrameWord[], i: number, p: Pt, later: boolean): number {
  const w = words[i];
  if (dist(w.box, p) === 0) return i;
  const cx = w.box.x + w.box.w / 2;
  const k = later ? (cx < p[0] ? i + 1 : i) : cx > p[0] ? i - 1 : i;
  return words[k]?.line === w.line ? k : i;
}

export type MarkupSelection = { rects: Box[]; text: string; words: [number, number] };

/** Words between two points (inclusive), one box per line, and their text. Null when no word is near. */
export function selectWords(words: FrameWord[], a: Pt, b: Pt, max = 24): MarkupSelection | null {
  let i = nearestWord(words, a, max);
  let j = nearestWord(words, b, max);
  if (i < 0 || j < 0) return null;
  // An end that falls in the gap between words takes only the words the drag actually crossed:
  // the start snaps to the next word in the drag's direction, the end to the previous one.
  const forward = i !== j ? i < j : b[0] >= a[0];
  i = gapSnap(words, i, a, forward);
  j = gapSnap(words, j, b, !forward);
  if (forward ? i > j : j > i) return null;
  const [from, to] = i <= j ? [i, j] : [j, i];
  const rects: Box[] = [];
  const parts: string[] = [];
  let line = -1;
  for (let k = from; k <= to; k++) {
    const w = words[k];
    if (w.line !== line) {
      rects.push({ ...w.box });
      parts.push(w.text);
      line = w.line;
      continue;
    }
    const r = rects[rects.length - 1];
    const x0 = Math.min(r.x, w.box.x);
    const y0 = Math.min(r.y, w.box.y);
    const x1 = Math.max(r.x + r.w, w.box.x + w.box.w);
    const y1 = Math.max(r.y + r.h, w.box.y + w.box.h);
    rects[rects.length - 1] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    parts[parts.length - 1] += ` ${w.text}`;
  }
  return { rects, text: parts.join(" "), words: [from, to] };
}

/** Average colour of RGBA pixels as #rrggbb (whiteout's page colour, AC-97). */
export function averageHex(rgba: Uint8ClampedArray | Uint8Array): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    // Transparent pixels are the white page.
    r += rgba[i] * a + 255 * (1 - a);
    g += rgba[i + 1] * a + 255 * (1 - a);
    b += rgba[i + 2] * a + 255 * (1 - a);
    n++;
  }
  if (!n) return "#ffffff";
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Most common colour among RGBA pixels (bucketed), so text inside the box doesn't darken the
 * sampled page colour.
 */
export function dominantHex(rgba: Uint8ClampedArray | Uint8Array): string {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    const r = rgba[i] * a + 255 * (1 - a);
    const g = rgba[i + 1] * a + 255 * (1 - a);
    const b = rgba[i + 2] * a + 255 * (1 - a);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    counts.set(key, c);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  if (!best) return "#ffffff";
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/**
 * Remove background (sign upload, AC-31): pixels close to the paper colour become transparent,
 * with a soft edge. Works in place on RGBA.
 */
export function removeBackground(rgba: Uint8ClampedArray | Uint8Array, threshold = 200, soft = 40): void {
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (lum >= threshold) rgba[i + 3] = 0;
    else if (lum > threshold - soft) rgba[i + 3] = Math.round((rgba[i + 3] * (threshold - lum)) / soft);
  }
}
