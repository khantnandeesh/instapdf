/**
 * Grayscale (spec F13 §1): a grey picture (one byte a pixel) packed for the PDF. A picture that was
 * a photo (JPEG, JPEG 2000) becomes a one-channel JPEG; anything else stays lossless (Flate, with
 * the PNG row filters that make flat areas and soft gradients pack well).
 */
import { zlibSync } from "fflate";
import { encodeJpeg } from "./jpeg";

/* ── Baseline JPEG, one component ────────────────────────────────────────────────────────────── */

export const JPEG_QUALITY = 88;

export function encodeGrayJpeg(px: Uint8Array, width: number, height: number, quality = JPEG_QUALITY): Uint8Array {
  return encodeJpeg(width, height, [{ plane: px, width, height, h: 1, v: 1, table: 0 }], quality);
}

/* ── Lossless ────────────────────────────────────────────────────────────────────────────────── */

/** Flate with a PNG filter chosen per row (none, left, up or Paeth: whichever leaves the smallest values). */
export function encodeGrayFlate(px: Uint8Array, width: number, height: number): Uint8Array {
  const rows = new Uint8Array((width + 1) * height);
  const tries = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  const kinds = [0, 1, 2, 4];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let best = 0;
    let bestSum = Infinity;
    for (let t = 0; t < 4; t++) {
      const out = tries[t];
      let sum = 0;
      for (let x = 0; x < width && sum < bestSum; x++) {
        const a = x ? px[row + x - 1] : 0;
        const b = y ? px[row - width + x] : 0;
        let pred = 0;
        if (t === 1) pred = a;
        else if (t === 2) pred = b;
        else if (t === 3) {
          const c = x && y ? px[row - width + x - 1] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (px[row + x] - pred) & 255;
        out[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = t;
      }
    }
    rows[y * (width + 1)] = kinds[best];
    rows.set(tries[best], y * (width + 1) + 1);
  }
  return zlibSync(rows, { level: 6 });
}
