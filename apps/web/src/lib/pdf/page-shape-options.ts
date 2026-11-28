/**
 * The choices of the page-shape tools (spec F8) and their checks: pure, with no PDF library, so the
 * pages can use them at first load.
 */
import type { Area } from "./area";

export type FlipDirection = "horizontal" | "vertical";

export const NUP_COUNTS = [2, 4, 8, 16] as const;
export type NupCount = (typeof NUP_COUNTS)[number];
export type NupOptions = {
  perSheet: NupCount;
  /** "rows": across then down; "columns": down then across. */
  order: "rows" | "columns";
  /** Start at the right (documents read right to left). */
  rightToLeft: boolean;
  /** Keep the paper the size of the first page (pages shrink) instead of growing the sheet. */
  keepSize: boolean;
};
export const NUP_DEFAULTS: NupOptions = { perSheet: 2, order: "rows", rightToLeft: false, keepSize: false };

/** Paper sizes in points, upright. */
export const PAPERS = {
  a3: { label: "A3", width: 841.89, height: 1190.55 },
  a4: { label: "A4", width: 595.28, height: 841.89 },
  a5: { label: "A5", width: 419.53, height: 595.28 },
  letter: { label: "Letter", width: 612, height: 792 },
  legal: { label: "Legal", width: 612, height: 1008 },
  tabloid: { label: "Tabloid", width: 792, height: 1224 },
} as const;
export type Paper = keyof typeof PAPERS;
export const isPaper = (v: unknown): v is Paper => typeof v === "string" && v in PAPERS;

export type LengthUnit = "mm" | "in";
const POINTS = { mm: 72 / 25.4, in: 72 } as const;
/** The largest margin: 500 mm (about 20 in). */
export const MAX_MARGIN_PT = 500 * POINTS.mm;

/** A typed length in points: digits with an optional decimal point or comma; null when it is not a usable number. */
export function parseLength(text: string, unit: LengthUnit): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{0,3})?$|^\.\d{1,3}$/.test(t)) return null;
  const pt = Number(t) * POINTS[unit];
  return Number.isFinite(pt) && pt <= MAX_MARGIN_PT ? pt : null;
}

export type MarginText = { all: string; top: string; right: string; bottom: string; left: string };
export const SIDES = ["top", "right", "bottom", "left"] as const;

/** The four margins in points: a side left empty takes the "all sides" value. Null when any typed value is unusable, or all are zero. */
export function marginsFrom(text: MarginText, unit: LengthUnit): { top: number; right: number; bottom: number; left: number } | null {
  const all = parseLength(text.all, unit);
  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of SIDES) {
    const value = text[side].trim() ? parseLength(text[side], unit) : all;
    if (value === null) return null;
    out[side] = value;
  }
  return SIDES.some((s) => out[s] > 0) ? out : null;
}

/** How many sheets `pages` pages make. */
export const sheetCount = (pages: number, perSheet: number) => Math.ceil(pages / perSheet);

export type { Area };
