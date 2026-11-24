/**
 * "Replace with new text": the fallback when the engine refuses an edit of an existing line.
 * The line is covered with a whiteout and a text box with the typed text goes on top, in the
 * closest editor font, at the line's size, colour and baseline. Pure, unit tested.
 */
import type { FontInfo, Line } from "./berry-engine";
import { newId, type PageEntry, type TextObj, type WhiteoutObj } from "./model";
import { textOffsets } from "./line-offsets";
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
  /** Boxes of the page's other text (PDF space), which a grown whiteout must not cover. */
  others?: readonly { x0: number; y0: number; x1: number; y1: number }[];
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps2 = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * A whiteout over the line and a text box drawing `text` on the line's baseline, or null when
 * the line is not horizontal (a rotated line needs a rotated box: not offered yet).
 *
 * The box keeps to the line's own width, so it never runs into the text beside it (the reason
 * an edit is often refused): a longer text is set smaller, down to 80% of the line's size, and
 * what still doesn't fit wraps at that width, the whiteout growing to cover the wrapped lines.
 * When that larger whiteout would cover other text on the page (`others`), the text is set
 * smaller still, down to 60%, and then wraps; the whiteout then covers only what is free of other
 * text. The original text stays in the file under the whiteout (copy and search still find it);
 * removing it is for a later version.
 */
/** The whiteout and the text box; `overlaps` when the wrapped text still runs into other page text. */
export type LineReplacement = [WhiteoutObj, TextObj] & { overlaps: boolean };

export function lineReplacement({ line, fonts, entry, text, face, metrics, measure, fill = "#ffffff", others = [] }: LineReplacementInput): LineReplacement | null {
  if (Math.abs(line.angle) > 0.5) return null;
  const run = line.runs[0];
  const size = run?.size ?? line.size;
  const [vx0, , , vy1] = entry.view;
  // PDF user space (y up) to the page frame (top-left origin, y down).
  const pad = Math.max(0.5, size * 0.08);
  const box = { x: line.bbox.x0 - vx0 - pad, y: vy1 - line.bbox.y1 - pad, w: line.bbox.x1 - line.bbox.x0 + 2 * pad, h: line.bbox.y1 - line.bbox.y0 + 2 * pad };
  const rtl = line.direction === "rtl";
  const start = rtl ? line.bbox.x1 - vx0 : line.origin[0] - vx0;
  // Room: the line's own width (a little slack), and never past the page edge.
  const edge = (rtl ? start : entry.view[2] - vx0 - start) - size * 0.5;
  const room = Math.min(edge, line.bbox.x1 - line.bbox.x0 + size * 0.5);
  // `measure` is at the line's size: widths scale with the size.
  const natural = measure(text);
  const baseline = vy1 - line.origin[1];
  const taken = others.map((o) => ({ x: o.x0 - vx0, y: vy1 - o.y1, w: o.x1 - o.x0, h: o.y1 - o.y0 }));
  /** The text set no smaller than `floor` of the line's size, wrapped at the room if still too long. */
  const layout = (floor: number) => {
    // Set smaller (to a tenth of a point, rounded down) only when the text is longer than the room.
    const fitted = natural > room && room > 0 ? Math.floor(Math.max(floor, room / natural) * size * 10) / 10 : size;
    const k = fitted / size;
    const at = (s: string) => measure(s) * k;
    const wrap = at(text) > room + 0.01 && room > fitted * 4 ? room : null;
    const lines = layoutText(text, wrap, at);
    const dims = textBoxSize(lines, wrap, fitted, at);
    const y = baseline - baselineOffset(metrics, fitted);
    const x = rtl ? start - dims.w : start;
    // The whiteout grows over wrapped lines below the line.
    const cover = lines.length > 1 ? union(box, { x: x - pad, y: y - pad, w: dims.w + 2 * pad, h: dims.h + 2 * pad }) : box;
    return { fitted, wrap, lines, dims, x, y, cover, free: !taken.some((t) => overlaps2(cover, t)) };
  };
  let l = layout(0.8);
  if (!l.free) {
    const smaller = layout(0.6);
    l = smaller.free ? smaller : { ...smaller, cover: box };
  }
  const whiteout: WhiteoutObj = { kind: "whiteout", id: newId(), page: entry.id, ...l.cover, fill, border: null, borderWidth: 0 };
  const obj: TextObj = {
    kind: "text",
    id: newId(),
    page: entry.id,
    x: l.x,
    y: l.y,
    wrap: l.wrap,
    lines: l.lines,
    w: l.dims.w,
    h: l.dims.h,
    rot: 0,
    text,
    font: face.font,
    size: l.fitted,
    bold: face.bold || !!(run && fonts[run.font]?.bold),
    italic: face.italic || !!(run && fonts[run.font]?.italic),
    underline: false,
    color: run ? hex(run.color) : "#000000",
    align: rtl ? "right" : "left",
  };
  // At 60% and still wrapping into other text: the whiteout doesn't hide that text, so say so.
  // (A line that neither wrapped nor outgrew its room sits where the old one did: lines set
  // close together touch each other's boxes without any text running into text.)
  const overlaps = (l.lines.length > 1 || l.dims.w > room + 0.01) && taken.some((t) => overlaps2({ x: l.x, y: l.y, w: l.dims.w, h: l.dims.h }, t));
  return Object.assign([whiteout, obj] as [WhiteoutObj, TextObj], { overlaps });
}

/** One run of the line, as the editor will set it: its face, that face's metrics and a measure at the run's size. */
export type RunPart = { face: EditorFace; metrics: FaceMetrics; measure: Measure };

export type StyledReplacementInput = Omit<LineReplacementInput, "face" | "metrics" | "measure"> & {
  /** One entry per run of the line, in order. */
  parts: readonly RunPart[];
};

/** The whiteout over the old line and the new text, one box per stretch of one style. */
export type StyledReplacement = { whiteout: WhiteoutObj; texts: TextObj[]; overlaps: boolean };

/**
 * For each character of `text`, the run of `line` whose style it takes: what is unchanged at the
 * start and at the end keeps its own run (a bold word stays bold), and what was typed in between
 * takes the style of the text it replaces, or of the character before it when nothing was replaced.
 */
export function runOfEach(line: Line, text: string): number[] {
  const old = line.text;
  const at = textOffsets(old, line.runs) ?? line.runs;
  const runAt = (i: number) => {
    let found = 0;
    for (let k = 0; k < at.length; k++) if (at[k]!.start <= i) found = k;
    return found;
  };
  let head = 0;
  while (head < old.length && head < text.length && old[head] === text[head]) head++;
  let tail = 0;
  while (tail < old.length - head && tail < text.length - head && old[old.length - 1 - tail] === text[text.length - 1 - tail]) tail++;
  const typed = runAt(head + tail === old.length ? Math.max(0, head - 1) : head);
  return [...text].length === text.length
    ? Array.from(text, (_, j) => (j < head ? runAt(j) : j >= text.length - tail ? runAt(j - (text.length - old.length)) : typed))
    : // Characters outside the basic plane count twice above: such a line is set in one style.
      Array.from(text, () => typed);
}

/**
 * "Replace with new text" that keeps each part's style: a bold or italic word of the line stays
 * bold or italic, in its own size and colour, each stretch of one style in a text box of its
 * own, set end to end on the line's baseline. A text longer than the line's room is set smaller,
 * down to 60%; one that still doesn't fit, a right-to-left line and a line of one style go the
 * way of `lineReplacement` (one box, which wraps). Null when the line is not horizontal.
 */
export function styledLineReplacement({ parts, ...input }: StyledReplacementInput): StyledReplacement | null {
  const { line, fonts, entry, text } = input;
  if (Math.abs(line.angle) > 0.5 || !parts.length) return null;
  const single = (k: number): StyledReplacement | null => {
    const part = parts[Math.min(k, parts.length - 1)]!;
    const run = line.runs[Math.min(k, line.runs.length - 1)];
    const info = run && fonts[run.font];
    // The one box takes the style of run `k` (lineReplacement reads the first run's).
    const one = lineReplacement({ ...input, line: run ? { ...line, runs: [run] } : line, ...part, face: { ...part.face, bold: !!info?.bold, italic: !!info?.italic } });
    return one && { whiteout: one[0], texts: [one[1]], overlaps: one.overlaps };
  };
  const owner = runOfEach(line, text);
  const style = (k: number) => {
    const run = line.runs[k];
    const part = parts[k];
    return run && part ? `${part.face.font}|${part.face.bold}|${part.face.italic}|${run.size}|${run.color.join(",")}` : "";
  };
  const stretches: { run: number; text: string }[] = [];
  for (let j = 0; j < text.length; j++) {
    const last = stretches[stretches.length - 1];
    if (last && style(last.run) === style(owner[j]!)) last.text += text[j];
    else stretches.push({ run: owner[j]!, text: text[j]! });
  }
  // The style most of the text is in, for when it has to be one box.
  const main = () => stretches.reduce((a, b) => (b.text.length > a.text.length ? b : a), stretches[0]!).run;
  if (stretches.length < 2 || line.direction === "rtl" || stretches.some((s) => !parts[s.run] || !line.runs[s.run])) return single(stretches[0]?.run ?? 0);
  const size = line.runs[0]?.size ?? line.size;
  const [vx0, , , vy1] = entry.view;
  const start = line.origin[0] - vx0;
  const room = Math.min(entry.view[2] - vx0 - start - size * 0.5, line.bbox.x1 - line.bbox.x0 + size * 0.5);
  const natural = stretches.reduce((w, s) => w + parts[s.run]!.measure(s.text), 0);
  const k = natural > room && room > 0 ? Math.max(0.6, room / natural) : 1;
  if (natural * k > room + 0.01) return single(main());
  const covered = single(main());
  if (!covered) return null;
  const baseline = vy1 - line.origin[1];
  const texts: TextObj[] = [];
  let x = start;
  for (const s of stretches) {
    const part = parts[s.run]!;
    const run = line.runs[s.run]!;
    const fitted = k < 1 ? Math.floor(run.size * k * 10) / 10 : run.size;
    const at = (t: string) => (part.measure(t) * fitted) / run.size;
    const body = s.text.trim();
    const lead = s.text.slice(0, s.text.length - s.text.trimStart().length);
    if (body) {
      const dims = textBoxSize([body], null, fitted, at);
      texts.push({
        kind: "text",
        id: newId(),
        page: entry.id,
        x: x + at(lead),
        y: baseline - baselineOffset(part.metrics, fitted),
        wrap: null,
        lines: [body],
        w: dims.w,
        h: dims.h,
        rot: 0,
        text: body,
        font: part.face.font,
        size: fitted,
        bold: part.face.bold,
        italic: part.face.italic,
        underline: false,
        color: hex(run.color),
        align: "left",
      });
    }
    x += at(s.text);
  }
  // The whiteout is the line's own box: nothing wrapped, so nothing else is covered.
  const pad = Math.max(0.5, size * 0.08);
  const whiteout: WhiteoutObj = { ...covered.whiteout, x: line.bbox.x0 - vx0 - pad, y: vy1 - line.bbox.y1 - pad, w: line.bbox.x1 - line.bbox.x0 + 2 * pad, h: line.bbox.y1 - line.bbox.y0 + 2 * pad };
  return { whiteout, texts, overlaps: false };
}
