/**
 * Stamps (spec F9): the text and pictures that Page numbers, Header and footer and Watermark put
 * on pages. This module only says where each one goes, as objects of the editor's model; the
 * editor's build draws them, so the fonts, the scripts it can write and the output are the same
 * as for text added in the editor. Pure, with no PDF library: the tools' option panels use it too.
 */
import type { EditorObject, ImageObj, PageEntry, TextObj } from "@/lib/editor/model";

/** The editor's line height (model.ts LINE_HEIGHT; a test keeps the two the same). Not imported: the option panels stay light. */
export const STAMP_LINE_HEIGHT = 1.25;
const LINE_HEIGHT = STAMP_LINE_HEIGHT;

export const PLACES = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
export type Place = (typeof PLACES)[number];

/** The open faces the stamping tools offer (the editor's stand-ins for Arial, Times and Courier). */
export const STAMP_FONTS = [
  { value: "arimo", label: "Sans" },
  { value: "tinos", label: "Serif" },
  { value: "cousine", label: "Mono" },
] as const;
export type StampFont = (typeof STAMP_FONTS)[number]["value"];

export type TextStyle = { font: StampFont; size: number; color: string; bold: boolean };

/** One line in the page margin: a page number, a header or a footer. `text` may hold tokens (see `fillTokens`). */
export type LineStamp = { kind: "line"; place: Place; text: string; style: TextStyle; /** Points from the page edge. */ margin: number };

export type WatermarkLayout = "center" | "top" | "bottom" | "tile";
type MarkBase = { /** 0–1. */ opacity: number; /** Degrees, counter-clockwise as read. */ angle: number; layout: WatermarkLayout };
export type TextMark = MarkBase & { kind: "text"; text: string; style: TextStyle };
export type ImageMark = MarkBase & { kind: "image"; asset: string; /** The picture's own size, for its shape. */ width: number; height: number; /** Its width as a share of the page's (0–1). */ scale: number };
export type Stamp = LineStamp | TextMark | ImageMark;

export const MARGIN_LIMITS = { min: 6, max: 144 };
export const SIZE_LIMITS = { min: 4, max: 300 };

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
/** 1 → I, 4 → IV. Numbers outside 1–3999 stay digits. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let out = "";
  for (const [value, letters] of ROMAN) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

export type TokenValues = { /** This page's number. */ n: number; /** The last number. */ total: number; /** The file's name without ".pdf". */ file: string; /** Today, as the reader writes dates. */ date: string };

/** What cannot be printed on a line: tabs and line breaks become spaces, other control characters and zero-width spaces go. */
const printable = (text: string) => text.replace(/[\t\n\r]+/g, " ").replace(/[\u0000-\u001f\u007f-\u009f\u200b\ufeff]/g, "");

/** Replaces {n}, {total}, {roman}, {ROMAN}, {file} and {date}; anything else in braces stays as typed. */
export function fillTokens(text: string, v: TokenValues): string {
  return printable(text).replace(/\{(n|total|roman|ROMAN|file|date)\}/g, (_, key: string) => {
    if (key === "n") return String(v.n);
    if (key === "total") return String(v.total);
    if (key === "ROMAN") return roman(v.n);
    if (key === "roman") return roman(v.n).toLowerCase();
    return printable(key === "file" ? v.file : v.date);
  });
}

/** Page number formats: what the reader picks and the line it stands for. */
export const NUMBER_FORMATS = [
  { value: "n", template: "{n}", sample: "1" },
  { value: "page-n", template: "Page {n}", sample: "Page 1" },
  { value: "n-of", template: "{n} of {total}", sample: "1 of 9" },
  { value: "page-n-of", template: "Page {n} of {total}", sample: "Page 1 of 9" },
  { value: "n-slash", template: "{n} / {total}", sample: "1 / 9" },
  { value: "dash-n", template: "- {n} -", sample: "- 1 -" },
  { value: "roman", template: "{ROMAN}", sample: "I, II, III" },
  { value: "roman-lower", template: "{roman}", sample: "i, ii, iii" },
] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number]["value"];
export const numberTemplate = (format: NumberFormat) => NUMBER_FORMATS.find((f) => f.value === format)?.template ?? "{n}";

export type PageShape = Pick<PageEntry, "id" | "view" | "baseRotate">;

/** The page as the reader sees it: its size with the page's own turn applied. */
export function shownSizeOf(page: PageShape): { w: number; h: number } {
  const w = page.view[2] - page.view[0];
  const h = page.view[3] - page.view[1];
  return page.baseRotate % 180 === 0 ? { w, h } : { w: h, h: w };
}

type ShownBox = { cx: number; cy: number; w: number; h: number; /** Degrees clockwise, as shown. */ rot: number };

/** A box placed on the page as shown, in the page's own unturned frame (the editor's coordinates). */
function toFrame(page: PageShape, b: ShownBox): { x: number; y: number; w: number; h: number; rot: number } {
  const fw = page.view[2] - page.view[0];
  const fh = page.view[3] - page.view[1];
  const turn = ((page.baseRotate % 360) + 360) % 360;
  const [cx, cy] = turn === 90 ? [b.cy, fh - b.cx] : turn === 180 ? [fw - b.cx, fh - b.cy] : turn === 270 ? [fw - b.cy, b.cx] : [b.cx, b.cy];
  return { x: cx - b.w / 2, y: cy - b.h / 2, w: b.w, h: b.h, rot: (((b.rot - turn) % 360) + 360) % 360 };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function textObject(page: PageShape, id: string, text: string, style: TextStyle, box: ShownBox, align: TextObj["align"], opacity?: number): TextObj {
  return {
    kind: "text",
    id,
    page: page.id,
    ...toFrame(page, box),
    wrap: null,
    lines: [text],
    text,
    font: style.font,
    size: style.size,
    bold: style.bold,
    italic: false,
    underline: false,
    color: style.color,
    align,
    // The build measures the line with its real font and draws it smaller when it is wider than the box.
    fit: true,
    ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
  };
}

/** A rough width for text we cannot measure here (the build has the last word: it fits the line to its box). */
export const roughWidth = (text: string, size: number) => [...text].length * size * 0.62;

/** The watermark's text size: as asked, but never so large that the text runs off the page. */
export function fittedSize(text: string, size: number, room: number): number {
  const chars = Math.max(1, [...text].length);
  return clamp(Math.min(size, room / (chars * 0.62)), SIZE_LIMITS.min, SIZE_LIMITS.max);
}

/** Centres of the copies of a mark `w` × `h` (as it lies, turned) on a page: one, or a grid that covers the page. */
function centres(layout: WatermarkLayout, page: { w: number; h: number }, w: number, h: number): [number, number][] {
  if (layout === "center") return [[page.w / 2, page.h / 2]];
  if (layout === "top") return [[page.w / 2, Math.min(page.h / 2, 36 + h / 2)]];
  if (layout === "bottom") return [[page.w / 2, Math.max(page.h / 2, page.h - 36 - h / 2)]];
  const stepX = w + Math.max(36, w * 0.35);
  const stepY = h + Math.max(48, h * 0.6);
  const cols = Math.max(1, Math.min(8, Math.round(page.w / stepX)));
  const rows = Math.max(1, Math.min(12, Math.round(page.h / stepY)));
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([((c + 0.5) * page.w) / cols, ((r + 0.5) * page.h) / rows]);
  return out;
}

/** The extent of a `w` × `h` box turned `angle` degrees. */
function turnedExtent(w: number, h: number, angle: number): { w: number; h: number } {
  const a = (angle * Math.PI) / 180;
  return { w: Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), h: Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)) };
}

/** The objects one page gets for `stamps`. Text is filled from `values` first; an empty line draws nothing. */
export function stampObjects(page: PageShape, stamps: readonly Stamp[], values: TokenValues): EditorObject[] {
  const shown = shownSizeOf(page);
  const out: EditorObject[] = [];
  // Lines that share an edge share its width: each keeps to its own part, so they never print over each other.
  const sides = (edge: string) => new Set(stamps.flatMap((s) => (s.kind === "line" && s.place.startsWith(edge) && fillTokens(s.text, values).trim() ? [s.place.split("-")[1]] : [])));
  const used = { top: sides("top"), bottom: sides("bottom") };
  stamps.forEach((stamp, k) => {
    const id = `stamp-${page.id}-${k}`;
    if (stamp.kind === "line") {
      const text = fillTokens(stamp.text, values).trim();
      if (!text) return;
      const size = clamp(stamp.style.size, SIZE_LIMITS.min, 72);
      const margin = clamp(stamp.margin, 0, Math.min(shown.w, shown.h) / 3);
      const h = size * LINE_HEIGHT;
      const [edge, side] = stamp.place.split("-") as ["top" | "bottom", TextObj["align"]];
      const full = Math.max(1, shown.w - 2 * margin);
      // Alone on its edge: the whole width. Left and right: half each. With a centre line: a third each.
      const parts = used[edge].size < 2 ? 1 : used[edge].has("center") ? 3 : 2;
      const w = parts === 1 ? full : Math.max(1, full / parts - size / 2);
      const cx = parts === 1 || side === "center" ? shown.w / 2 : side === "left" ? margin + w / 2 : shown.w - margin - w / 2;
      const box = { cx, cy: edge === "top" ? margin + h / 2 : shown.h - margin - h / 2, w, h, rot: 0 };
      out.push(textObject(page, id, text, { ...stamp.style, size }, box, side));
      return;
    }
    const opacity = clamp(stamp.opacity, 0.05, 1);
    const rot = -stamp.angle;
    if (stamp.kind === "text") {
      const text = fillTokens(stamp.text, values).trim();
      if (!text) return;
      // One copy may use the page's width (its diagonal when turned); tiled copies are a third of it at most.
      const a = (Math.abs(stamp.angle) * Math.PI) / 180;
      const span = Math.min(shown.w / Math.max(Math.abs(Math.cos(a)), 0.01), shown.h / Math.max(Math.abs(Math.sin(a)), 0.01));
      const room = stamp.layout === "tile" ? Math.min(shown.w, shown.h) * 0.4 : span * 0.9;
      const size = fittedSize(text, stamp.style.size, room);
      const h = size * LINE_HEIGHT;
      // Laid out by the rough width; the box is the room, and the build keeps the real line inside it.
      const extent = turnedExtent(Math.min(room, roughWidth(text, size)), h, stamp.angle);
      const w = room;
      centres(stamp.layout, shown, extent.w, extent.h).forEach(([cx, cy], i) =>
        out.push(textObject(page, `${id}-${i}`, text, { ...stamp.style, size }, { cx, cy, w, h, rot }, "center", opacity)),
      );
      return;
    }
    if (!(stamp.width > 0 && stamp.height > 0)) return;
    // Tiled copies are held to under half the page, so at least two fit side by side.
    const share = Math.min(clamp(stamp.scale, 0.02, 1), stamp.layout === "tile" ? 0.45 : 1);
    let w = shown.w * share;
    let h = (w * stamp.height) / stamp.width;
    // A tall picture is held to the page's height too.
    const fit = Math.min(1, (shown.h * 0.95) / turnedExtent(w, h, stamp.angle).h, (shown.w * 0.98) / turnedExtent(w, h, stamp.angle).w);
    w *= fit;
    h *= fit;
    const extent = turnedExtent(w, h, stamp.angle);
    centres(stamp.layout, shown, extent.w, extent.h).forEach(([cx, cy], i) => {
      const image: ImageObj = { kind: "image", id: `${id}-${i}`, page: page.id, ...toFrame(page, { cx, cy, w, h, rot }), asset: stamp.asset, opacity };
      out.push(image);
    });
  });
  return out;
}

/** The numbers the stamped pages get: `first` on the first of them, counting on in page order. */
export function numbering(pageCount: number, picked: readonly number[], first: number): { numbers: Map<number, number>; total: number } {
  const start = Number.isFinite(first) ? Math.round(first) : 1;
  const pages = [...new Set(picked)].filter((i) => i >= 0 && i < pageCount).sort((a, b) => a - b);
  return { numbers: new Map(pages.map((p, k) => [p, start + k])), total: start + pages.length - 1 };
}
