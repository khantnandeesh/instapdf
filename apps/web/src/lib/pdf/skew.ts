/**
 * How far a scanned page is tilted, from a small picture of it (spec F15 §1). Pure, no DOM.
 *
 * The lines of a straight page make sharp stripes when its dark pixels are counted row by row (and
 * its rules and table edges when counted column by column); on a tilted page the stripes blur. The
 * tilt is the turn at which the stripes are sharpest.
 */

export type Skew = {
  /** Degrees the content is turned clockwise on screen. 0 when the page shows no clear direction. */
  angle: number;
  /** How far the best turn stands out from a typical one (1 = not at all). */
  clarity: number;
};

/** Tilts beyond this are not looked for: a page turned that far is a rotation, not a skew. */
export const MAX_SKEW = 15;
const COARSE = 0.5;
const FINE = 0.05;
/** Dark pixels looked at: plenty for a page of text, and a fixed cost for any page. */
const POINTS = 24000;
/** Below this the best turn is no better than chance (photos, blank pages, drawings without lines). */
const CLEAR = 1.6;

/** How much sharper than the page as it stands a turn must make the stripes. */
const OVER_STRAIGHT = 1.15;

const NONE: Skew = { angle: 0, clarity: 1 };

export function estimateSkew(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Skew {
  const count = width * height;
  if (count < 400) return NONE;
  const lum = new Uint8Array(count);
  let sum = 0;
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    // Transparent counts as paper.
    const a = rgba[p + 3] / 255;
    const v = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * a + 255 * (1 - a);
    lum[i] = v;
    sum += v;
  }
  const dark = (sum / count) * 0.7;
  let ink = 0;
  for (let i = 0; i < count; i++) if (lum[i] < dark) ink++;
  // Nearly nothing on the page, or more dark than light (a photo, a dark scan bed): no lines to go by.
  if (ink < 60 || ink > count * 0.5) return NONE;
  const stride = Math.max(1, Math.ceil(ink / POINTS));
  const xs = new Float32Array(ink);
  const ys = new Float32Array(ink);
  let n = 0;
  // Thinned at random (the same way every time), never every so-many-th pixel: a regular pick makes stripes of its own.
  let dice = 0x2545f491;
  const keep = () => {
    dice ^= dice << 13;
    dice ^= dice >>> 17;
    dice ^= dice << 5;
    return (dice >>> 0) % stride === 0;
  };
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      if (lum[i] < dark && (stride === 1 || keep())) {
        xs[n] = x;
        ys[n++] = y;
      }
    }
  }
  const bins = width + height + 3;
  const rows = new Float32Array(bins);
  const cols = new Float32Array(bins);
  const sharpness = (degrees: number) => {
    const t = (degrees * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    rows.fill(0);
    cols.fill(0);
    // A line turned clockwise by t keeps y·cos − x·sin along its length; an upright rule keeps x·cos + y·sin.
    const rowShift = sin > 0 ? width * sin : 0;
    const colShift = sin < 0 ? -height * sin : 0;
    for (let k = 0; k < n; k++) {
      // Each pixel is shared between the two stripes it falls between: counting it whole in the nearer
      // one would make stripes of the rounding itself, and a straight page would look tilted.
      const r = ys[k] * cos - xs[k] * sin + rowShift;
      const r0 = Math.floor(r);
      rows[r0] += 1 - (r - r0);
      rows[r0 + 1] += r - r0;
      const c = xs[k] * cos + ys[k] * sin + colShift;
      const c0 = Math.floor(c);
      cols[c0] += 1 - (c - c0);
      cols[c0 + 1] += c - c0;
    }
    let s = 0;
    for (let b = 1; b < bins; b++) {
      const dr = rows[b] - rows[b - 1];
      const dc = cols[b] - cols[b - 1];
      s += dr * dr + dc * dc;
    }
    return s;
  };
  const coarse: number[] = [];
  let best = 0;
  let bestScore = -1;
  for (let a = -MAX_SKEW; a <= MAX_SKEW + 1e-9; a += COARSE) {
    const s = sharpness(a);
    coarse.push(s);
    if (s > bestScore) [best, bestScore] = [a, s];
  }
  const typical = [...coarse].sort((p, q) => p - q)[coarse.length >> 1] || 1;
  const clarity = bestScore / typical;
  if (clarity < CLEAR) return { angle: 0, clarity };
  const from = best - COARSE;
  for (let k = 0; k <= Math.round((2 * COARSE) / FINE); k++) {
    const a = from + k * FINE;
    const s = sharpness(a);
    if (s > bestScore) [best, bestScore] = [a, s];
  }
  // A straight page stays straight: a turn must be clearly sharper than none to count.
  if (bestScore < sharpness(0) * OVER_STRAIGHT) return { angle: 0, clarity };
  // A best turn at the very edge of the search is a page tilted further than this looks for.
  if (Math.abs(best) > MAX_SKEW - FINE / 2) return { angle: 0, clarity };
  return { angle: Math.round(best / FINE) / Math.round(1 / FINE) || 0, clarity };
}
