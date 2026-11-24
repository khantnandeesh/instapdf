/**
 * The ghost image for a drawn signature, as an SVG data URL. Pure, unit tested.
 *
 * The colour can come from the device store (a saved signature), so it is checked as #rrggbb
 * before it goes into the SVG: anything else falls back to black and can't inject markup.
 */
import { svgPolyline } from "./draw-math";
import type { Pt } from "./model";

const HEX = /^#[0-9a-f]{6}$/i;

/** `color` when it is #rrggbb, otherwise `fallback`. */
export const safeHex = (color: unknown, fallback = "#000000"): string => (typeof color === "string" && HEX.test(color) ? color : fallback);

export function drawnPreview(strokes: Pt[][], aspect: number, color: string): string {
  const W = 300;
  const H = W / (Number.isFinite(aspect) && aspect > 0 ? aspect : 3.2);
  const paths = strokes
    .map((s) => `<path d="${svgPolyline((s.length === 1 ? [s[0], [s[0][0] + 0.002, s[0][1]]] : s).map(([u, v]) => [u * W, v * H] as Pt))}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(1)}" viewBox="0 0 ${W} ${H.toFixed(1)}"><g fill="none" stroke="${safeHex(color)}" stroke-width="${Math.max(2, Math.min(W, H) * 0.035).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
