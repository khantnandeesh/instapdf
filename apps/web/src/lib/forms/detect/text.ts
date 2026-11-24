/** pdf.js text content → text items in view points (see analyze.ts). */
import type { TextItem } from "./analyze";

type PdfjsItem = { str?: string; transform?: number[]; width?: number; height?: number };

/** Multiplies two PDF matrices (a then b). */
const mul = (a: number[], b: number[]) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

/**
 * `viewportTransform` is pdf.js `viewport.transform` at the scale the text should come out in,
 * divided by `scale` (so the result is in points). Only text that runs left to right in the view
 * is kept: labels on a turned page are found once the page is turned for reading.
 */
export function textItems(items: PdfjsItem[], viewportTransform: number[], scale: number): TextItem[] {
  const out: TextItem[] = [];
  for (const it of items) {
    if (!it.str || !it.transform) continue;
    const m = mul(it.transform, viewportTransform);
    const size = Math.hypot(m[2], m[3]) / scale;
    const along = Math.hypot(m[0], m[1]);
    if (!size || !along || Math.abs(m[1]) > 0.05 * along || m[0] < 0) continue;
    const x = m[4] / scale;
    const base = m[5] / scale;
    // Width: pdf.js gives it in text space units scaled by the text's own x scale.
    const w = ((it.width ?? 0) * along) / Math.hypot(it.transform[0], it.transform[1]) / scale;
    out.push({ str: it.str, x, y: base - size * 0.85, w, h: size * 1.1, base });
  }
  return out;
}
