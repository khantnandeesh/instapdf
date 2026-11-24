/**
 * "Replace with new text": the fallback when the engine refuses an edit of an existing line.
 * The line is covered with a whiteout and a text box with the typed text goes on top, in the
 * closest editor font, at the line's size, colour and baseline. Pure, unit tested.
 */
import type { FontInfo, Line } from "./berry-engine";
import { newId, type PageEntry, type TextObj, type WhiteoutObj } from "./model";
import { baselineOffset, layoutText, textBoxSize, type FaceMetrics, type Measure } from "./text-layout";

export type EditorFace = { font: string; bold: boolean; italic: boolean };

/** The editor font that best stands in for a font in the file (fonts.json families). */
export function editorFontFor(info: FontInfo | undefined): EditorFace {
  if (!info) return { font: "arimo", bold: false, italic: false };
  const names = [info.name, info.family, ...info.stand_ins].join(" ").toLowerCase();
  let font = "arimo";
  if (info.monospace || /courier|mono|cousine/.test(names)) font = "cousine";
  else if (/calibri|carlito/.test(names)) font = "carlito";
  else if (/cambria|caladea/.test(names)) font = "caladea";
  else if (info.serif || /times|serif|roman|tinos|georgia|garamond|charter|cmr|lmroman/.test(names)) font = "tinos";
  return { font, bold: info.bold, italic: info.italic };
}

const hex = (c: [number, number, number]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

export type LineReplacementInput = {
  line: Line;
  fonts: FontInfo[];
  /** The page entry the line is on (its `view` maps PDF space to the page frame). */
  entry: PageEntry;
  text: string;
  face: EditorFace;
  metrics: FaceMetrics;
  measure: Measure;
  /** Whiteout fill: the page colour behind the line. */
  fill?: string;
};

/**
 * A whiteout over the line and a text box drawing `text` on the line's baseline, or null when
 * the line is not horizontal (a rotated line needs a rotated box: not offered yet).
 *
 * The box keeps to the line's own width, so it never runs into the text beside it (the reason
 * an edit is often refused): a longer text is set smaller, down to 80% of the line's size, and
 * what still doesn't fit wraps at that width. The original text stays in the file under the
 * whiteout (copy and search still find it); removing it is for a later version.
 */
export function lineReplacement({ line, fonts, entry, text, face, metrics, measure, fill = "#ffffff" }: LineReplacementInput): [WhiteoutObj, TextObj] | null {
  if (Math.abs(line.angle) > 0.5) return null;
  const run = line.runs[0];
  const size = run?.size ?? line.size;
  const [vx0, , , vy1] = entry.view;
  // PDF user space (y up) to the page frame (top-left origin, y down).
  const pad = Math.max(0.5, size * 0.08);
  const box = { x: line.bbox.x0 - vx0 - pad, y: vy1 - line.bbox.y1 - pad, w: line.bbox.x1 - line.bbox.x0 + 2 * pad, h: line.bbox.y1 - line.bbox.y0 + 2 * pad };
  const whiteout: WhiteoutObj = { kind: "whiteout", id: newId(), page: entry.id, ...box, fill, border: null, borderWidth: 0 };
  const rtl = line.direction === "rtl";
  const start = rtl ? line.bbox.x1 - vx0 : line.origin[0] - vx0;
  // Room: the line's own width (a little slack), and never past the page edge.
  const edge = (rtl ? start : entry.view[2] - vx0 - start) - size * 0.5;
  const room = Math.min(edge, line.bbox.x1 - line.bbox.x0 + size * 0.5);
  // `measure` is at the line's size: widths scale with the size.
  const natural = measure(text);
  // Set smaller (to a tenth of a point, rounded down) only when the text is longer than the room.
  const fitted = natural > room && room > 0 ? Math.floor(Math.max(0.8, room / natural) * size * 10) / 10 : size;
  const k = fitted / size;
  const at = (s: string) => measure(s) * k;
  const wrap = at(text) > room + 0.01 && room > fitted * 4 ? room : null;
  const lines = layoutText(text, wrap, at);
  const size2 = textBoxSize(lines, wrap, fitted, at);
  const baseline = vy1 - line.origin[1];
  const x = rtl ? start - size2.w : start;
  const obj: TextObj = {
    kind: "text",
    id: newId(),
    page: entry.id,
    x,
    y: baseline - baselineOffset(metrics, fitted),
    wrap,
    lines,
    w: size2.w,
    h: size2.h,
    rot: 0,
    text,
    font: face.font,
    size: fitted,
    bold: face.bold || !!(run && fonts[run.font]?.bold),
    italic: face.italic || !!(run && fonts[run.font]?.italic),
    underline: false,
    color: run ? hex(run.color) : "#000000",
    align: rtl ? "right" : "left",
  };
  return [whiteout, obj];
}
