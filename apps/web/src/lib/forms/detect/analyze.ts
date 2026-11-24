/**
 * Detect fields, the analysis (AC-240 to AC-245). Pure: a page bitmap in the reader's orientation,
 * the page's text items and the boxes of widgets already on it go in; proposed fields come out.
 * Runs in a Web Worker; no network, no DOM.
 *
 * Geometry comes from pixels, so drawn lines, underscores, dotted leaders, boxes and circles are
 * found the same way whether the page is vector or scanned. Text is used for labels (names,
 * tooltips, signature and date fields) and to rule out underlined words, filled table cells and
 * letters with holes.
 *
 * All boxes here are in "view" space: points, origin top-left of the page as the reader sees it.
 */
import { slugify, uniqueName } from "../names";

export type Gray = { width: number; height: number; /** 0 = black, 255 = white */ data: Uint8Array; /** pixels per point */ scale: number };

/** A run of text on one line, in view points. `y` is the top of the line box, `base` the baseline. */
export type TextItem = { str: string; x: number; y: number; w: number; h: number; base: number };

export type Rect = { x: number; y: number; w: number; h: number };

export type FoundKind = "text" | "multiline" | "comb" | "checkbox" | "radio" | "signature";

export type Found = {
  kind: FoundKind;
  /** What the name is made from (the label, or the kind when there is none). */
  base?: string;
  box: Rect;
  name: string;
  /** Label text, as on the page. */
  label: string | null;
  tooltip: string;
  source: "line" | "underscores" | "dots" | "box" | "comb" | "square" | "circle" | "glyph";
  confidence: number;
  /** comb: number of boxes */
  maxLen?: number;
  /** radio: group id (same for every button of a group) and this button's export value */
  group?: string;
  value?: string;
};

export type AnalyzeInput = {
  gray: Gray;
  text: TextItem[];
  /** Widgets already on the page (view points): proposals that overlap them are dropped (AC-244). */
  existing: Rect[];
  /** Names already used in the form, so new names do not clash. */
  taken: string[];
  /** For the date hint, e.g. "en-US" gives MM/DD/YYYY. */
  locale?: string;
  /** True when the page has no text layer (a scan): stricter shape rules, names by kind. */
  scanned?: boolean;
};

const INK = 150;

// ---------------------------------------------------------------------------------------------
// Connected components (8-connected) of dark pixels, with union-find on run-length rows.

type Comp = { x0: number; y0: number; x1: number; y1: number; n: number; id: number };

function components(g: Gray): { comps: Comp[]; label: Int32Array } {
  const { width: W, height: H, data } = g;
  const label = new Int32Array(W * H).fill(-1);
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (data[row + x] >= INK) continue;
      let l = -1;
      if (x > 0 && label[row + x - 1] >= 0) l = label[row + x - 1];
      if (y > 0) {
        const up = row - W + x;
        for (const k of [up - 1, up, up + 1]) {
          if (k < row - W || k >= row || (k === up - 1 && x === 0) || (k === up + 1 && x === W - 1)) continue;
          const lk = label[k];
          if (lk < 0) continue;
          if (l < 0) l = lk;
          else if (lk !== l) union(l, lk);
        }
      }
      if (l < 0) {
        l = parent.length;
        parent.push(l);
      }
      label[row + x] = l;
    }
  }
  const map = new Map<number, Comp>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = label[y * W + x];
      if (l < 0) continue;
      const r = find(l);
      label[y * W + x] = r;
      let c = map.get(r);
      if (!c) map.set(r, (c = { x0: x, y0: y, x1: x, y1: y, n: 0, id: r }));
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      c.n++;
    }
  return { comps: [...map.values()], label };
}

/** Holes of one component: background regions inside its bounding box not reachable from its edge. */
function holes(g: Gray, label: Int32Array, c: Comp): Rect[] {
  const W = c.x1 - c.x0 + 1;
  const H = c.y1 - c.y0 + 1;
  // 1 = this component's ink, 0 = anything else (other ink counts as background, so text inside a cell does not split it).
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (label[(c.y0 + y) * g.width + c.x0 + x] === c.id) ink[y * W + x] = 1;
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!ink[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    push(y * W);
    push(y * W + W - 1);
  }
  const flood = () => {
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W);
      if (y < H - 1) push(i + W);
    }
  };
  flood();
  const out: Rect[] = [];
  for (let i = 0; i < W * H; i++) {
    if (ink[i] || seen[i]) continue;
    // A new hole: flood it and take its box.
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % W;
      const y = (k / W) | 0;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (x > 0) push(k - 1);
      if (x < W - 1) push(k + 1);
      if (y > 0) push(k - W);
      if (y < H - 1) push(k + W);
    }
    // Ignore specks (antialiasing gaps inside a stroke).
    if (n >= 9 && x1 - x0 >= 2 && y1 - y0 >= 2) out.push({ x: c.x0 + x0, y: c.y0 + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

/** Share of dark pixels in a pixel box. */
function inkShare(g: Gray, r: Rect): number {
  let dark = 0;
  let n = 0;
  const x0 = Math.max(0, Math.round(r.x));
  const y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(g.width, Math.round(r.x + r.w));
  const y1 = Math.min(g.height, Math.round(r.y + r.h));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      n++;
      if (g.data[y * g.width + x] < INK) dark++;
    }
  return n ? dark / n : 0;
}

// ---------------------------------------------------------------------------------------------
// Text helpers

const BLANK_RUN = /[_.…‥·]{3,}|_{2,}/u;
const isBlankText = (s: string) => /^[\s_.…‥·:]*$/u.test(s) && /[_.…]/u.test(s);
/** Box and circle characters drawn as text (☐ ☑ ☒ □ ▢ ❏ ❐ ❑ ❒ ○ ◯ ⭘ ⚪ ❍). */
const SHAPE_GLYPHS = /[☐-☒□▢❏-❒○◯⭘⚪❍]/u;

/** The label part of a text item: what comes before its blank run ("Address: ____" → "Address"). */
function labelPart(s: string): string {
  const m = BLANK_RUN.exec(s);
  const head = m ? s.slice(0, m.index) : s;
  return head.replace(/[\s:：*]+$/u, "").replace(SHAPE_GLYPHS, "").trim();
}

const SIGNATURE = /\b(signature|sign here|signed|signatory|autograph|unterschrift|firma|assinatura|подпись)\b|हस्ताक्षर|दस्तख़त|توقيع|签名|簽名|署名|서명|חתימה/iu;
const DATE = /\b(date|dated|d\.?o\.?b\.?|datum|fecha|data|дата)\b|तारीख|दिनांक|تاريخ|日期|日付|날짜/iu;

function dateHint(locale?: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale ?? "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(2001, 10, 22));
    return parts.map((p) => (p.type === "day" ? "DD" : p.type === "month" ? "MM" : p.type === "year" ? "YYYY" : p.value)).join("");
  } catch {
    return "DD/MM/YYYY";
  }
}

/** Right edge (pixels) of the label part of a text run: "Address: ____" ends after "Address:". */
const labelRightEdge = (t: { str: string; r: Rect }) => {
  const m = BLANK_RUN.exec(t.str);
  if (!m) return t.r.x + t.r.w;
  // Width of the blank run and what follows, in ems of a typical font (underscore ½ em, dot and space ¼).
  const ems = [...t.str.slice(m.index)].reduce((n, ch) => n + (ch === "." || ch === " " || ch === "·" ? 0.278 : ch === "…" ? 1 : 0.556), 0);
  const size = t.r.h / 1.1;
  return Math.max(t.r.x, t.r.x + t.r.w - ems * size);
};
const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const areaOverlap = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const ofSmaller = (a: Rect, b: Rect) => {
  const i = areaOverlap(a, b);
  return i ? i / Math.min(a.w * a.h, b.w * b.h) : 0;
};

// ---------------------------------------------------------------------------------------------

type Line = { x0: number; x1: number; y: number; t: number; source: "line" | "underscores" | "dots" };
type Cell = Rect & { comp: number };

/** Finds fields on one page. */
export function analyzePage(input: AnalyzeInput): Found[] {
  const { gray: g, text, scanned } = input;
  const s = g.scale;
  const pt = (px: number) => px / s;
  const toPt = (r: Rect): Rect => ({ x: r.x / s, y: r.y / s, w: r.w / s, h: r.h / s });
  const { comps, label } = components(g);
  const pageW = g.width / s;
  const pageH = g.height / s;

  // Text items in pixels, for hit tests.
  const textPx = text.map((t) => ({ ...t, r: { x: t.x * s, y: t.y * s, w: t.w * s, h: t.h * s } }));
  const realText = textPx.filter((t) => t.str.trim() && !isBlankText(t.str));
  const textOver = (r: Rect, minShare = 0.25) =>
    realText.filter((t) => {
      const i = areaOverlap(r, t.r);
      return i > 0 && i / Math.min(r.w * r.h, t.r.w * t.r.h) >= minShare;
    });

  // Text column: where body text runs; a line spanning most of it with no label is a separator.
  const lefts = realText.map((t) => t.x).sort((a, b) => a - b);
  const rights = realText.map((t) => t.x + t.w).sort((a, b) => a - b);
  const colX0 = lefts.length ? lefts[Math.floor(lefts.length * 0.05)] : pageW * 0.1;
  const colX1 = rights.length ? rights[Math.floor(rights.length * 0.95)] : pageW * 0.9;

  const lines: Line[] = [];
  const cells: Cell[] = [];
  const shapes: { r: Rect; kind: "square" | "circle" | "glyph" }[] = [];
  const dots: Comp[] = [];

  for (const c of comps) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    const wPt = pt(w);
    const hPt = pt(h);
    const r: Rect = { x: c.x0, y: c.y0, w, h };

    // Dots of a leader (".......").
    if (wPt <= 2.2 && hPt <= 2.2 && c.n >= 2) {
      dots.push(c);
      continue;
    }
    // A thin horizontal line: a blank to write on (drawn line or underscores).
    if (hPt <= 3 && wPt >= 24 && w / h >= 10) {
      const onText = textPx.find((t) => /_{2,}/.test(t.str) && overlaps(r, t.r, s));
      lines.push({ x0: c.x0, x1: c.x1, y: c.y0, t: h, source: onText && /_/.test(onText.str) ? "underscores" : "line" });
      continue;
    }
    // Enclosed shapes: boxes, cells, circles.
    if (wPt < 5 || hPt < 5) continue;
    const thin = c.n / (w * h) < 0.35;
    if (!thin) continue;
    const hs = holes(g, label, c);
    if (!hs.length) continue;
    const small = wPt <= 30 && hPt <= 30 && wPt / hPt > 0.7 && wPt / hPt < 1.4;
    if (small && hs.length === 1 && hs[0].w * hs[0].h >= 0.3 * w * h) {
      // A check square, a radio circle, or a letter with a hole.
      const t = textPx.filter((tt) => overlaps(r, tt.r) && tt.str.trim());
      const glyph = t.some((tt) => SHAPE_GLYPHS.test(tt.str));
      if (t.length && !glyph) continue; // a letter such as O, D or 0
      if (scanned && (wPt < 8 || hasNeighbour(comps, c, s))) continue;
      shapes.push({ r, kind: glyph ? "glyph" : isRound(g, label, c) ? "circle" : "square" });
      continue;
    }
    for (const hole of hs) cells.push({ ...hole, comp: c.id });
  }

  // Dotted leaders: runs of dots on one baseline.
  dots.sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const used = new Set<number>();
  for (let i = 0; i < dots.length; i++) {
    if (used.has(i)) continue;
    const chain = [dots[i]];
    for (let j = i + 1; j < dots.length; j++) {
      const last = chain[chain.length - 1];
      const d = dots[j];
      if (Math.abs(d.y1 - last.y1) > s * 1) continue;
      if (d.x0 <= last.x1) continue;
      if (d.x0 - last.x1 > s * 6) continue;
      chain.push(d);
      used.add(j);
    }
    if (chain.length >= 8 && pt(chain[chain.length - 1].x1 - chain[0].x0) >= 24) {
      used.add(i);
      lines.push({ x0: chain[0].x0, x1: chain[chain.length - 1].x1, y: Math.min(...chain.map((d) => d.y0)), t: Math.max(...chain.map((d) => d.y1 - d.y0 + 1)), source: "dots" });
    }
  }

  const found: Found[] = [];
  const taken = [...input.taken];
  /** Names are given at the end, in reading order; this records what to make them from. */
  const name = (base: string | null, kind: string) => slugify(base ?? "") || kind;
  const hint = dateHint(input.locale);
  const tooltipFor = (lbl: string | null) => (lbl ? (DATE.test(lbl) ? `${lbl} (${hint})` : lbl) : "");

  // ---- lines ----
  for (const ln of lines) {
    const r: Rect = { x: ln.x0, y: ln.y, w: ln.x1 - ln.x0 + 1, h: ln.t };
    // Underlined words: text sitting right on top of the line (not the underscores themselves).
    const above = realText.filter((t) => t.r.x < ln.x1 && t.r.x + t.r.w > ln.x0 && ln.y - t.base * s >= -s && ln.y - t.base * s <= 4 * s);
    const covered = above.reduce((n, t) => {
      // "Address: ______" is one run: only its label part can sit on the line.
      return n + Math.max(0, Math.min(ln.x1, labelRightEdge(t)) - Math.max(ln.x0, t.r.x));
    }, 0);
    if (covered > 0.3 * r.w) {
      // Unless the text is only the label at the start ("Name ____" drawn as one underlined run is rare): skip.
      continue;
    }
    // Label: on the same row to the left, then under the line, then above it.
    const left = textPx
      .filter((t) => t.str.trim() && !isBlankText(t.str) && labelRightEdge(t) <= ln.x0 + 4 * s && Math.abs(t.base * s - ln.y) <= 8 * s && ln.x0 - labelRightEdge(t) <= 140 * s)
      .sort((a, b) => labelRightEdge(b) - labelRightEdge(a))[0];
    let lbl = left ? labelPart(left.str) : "";
    let where: "left" | "below" | "above" | null = lbl ? "left" : null;
    if (!lbl) {
      const below = realText.filter((t) => t.r.y >= ln.y + ln.t - s && t.r.y <= ln.y + 16 * s && t.r.x < ln.x1 && t.r.x + t.r.w > ln.x0).sort((a, b) => a.r.x - b.r.x)[0];
      if (below) {
        lbl = labelPart(below.str);
        where = "below";
      }
    }
    if (!lbl) {
      const up = realText
        .filter((t) => t.r.y + t.r.h <= ln.y && ln.y - (t.r.y + t.r.h) <= 22 * s && t.r.x < ln.x1 && t.r.x + t.r.w > ln.x0 && Math.abs(t.r.x - ln.x0) <= 30 * s)
        .sort((a, b) => b.r.y - a.r.y)[0];
      if (up) {
        lbl = labelPart(up.str);
        where = "above";
      }
    }
    // Separators: span the text column with nothing naming them, or rule off a heading above.
    if ((!lbl || where === "above") && !scanned && pt(r.w) >= 0.7 * pt(colX1 - colX0)) continue;
    if (!lbl && !scanned && !lines.some((o) => o !== ln && Math.abs(o.x0 - ln.x0) < 4 * s && Math.abs(o.y - ln.y) < 60 * s)) {
      // A lone unnamed line in running text is more likely decoration; keep only clear blanks.
      if (pt(r.w) < 60) continue;
    }
    const isSig = !!lbl && SIGNATURE.test(lbl);
    // Height: the label's size (or 14 pt), up to free space above the line.
    const refH = left ? left.h : 12;
    let hPt = isSig ? 36 : Math.min(24, Math.max(14, refH * 1.35));
    const ceiling = freeAbove(g, ln, hPt * s, where === "above" ? null : left?.r ?? null, textPx);
    hPt = Math.max(isSig ? 18 : 10, Math.min(hPt, pt(ceiling)));
    const box = { x: pt(ln.x0), y: pt(ln.y) - hPt, w: pt(r.w), h: hPt };
    found.push({
      kind: isSig ? "signature" : "text",
      box,
      label: lbl || null,
      name: name(lbl || null, isSig ? "signature" : "text"),
      tooltip: tooltipFor(lbl || null),
      source: ln.source,
      confidence: lbl ? 0.9 : 0.6,
    });
  }

  // ---- cells: boxes, comb rows ----
  const pageArea = g.width * g.height;
  const empty = cells.filter((c) => {
    if (c.w * c.h > 0.4 * pageArea) return false; // page border
    if (pt(c.w) < 6 || pt(c.h) < 6) return false;
    if (textOver(c, 0.05).length) return false; // a table cell with text
    const inner = { x: c.x + 2, y: c.y + 2, w: c.w - 4, h: c.h - 4 };
    return inkShare(g, inner) < 0.01;
  });
  const combUsed = new Set<Cell>();
  // Rows of equal small cells side by side → one comb field.
  const sorted = [...empty].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of sorted) {
    if (combUsed.has(c) || pt(c.w) > 36) continue;
    const row = [c];
    for (;;) {
      const last = row[row.length - 1];
      const next = sorted.find((d) => !combUsed.has(d) && d !== last && !row.includes(d) && Math.abs(d.y - last.y) <= 2 * s && Math.abs(d.h - last.h) <= 2 * s && Math.abs(d.w - c.w) <= Math.max(2 * s, 0.2 * c.w) && d.x > last.x && d.x - (last.x + last.w) <= 4 * s);
      if (!next) break;
      row.push(next);
    }
    if (row.length >= 3) {
      row.forEach((x) => combUsed.add(x));
      const box = { x: row[0].x, y: Math.min(...row.map((x) => x.y)), w: row[row.length - 1].x + row[row.length - 1].w - row[0].x, h: Math.max(...row.map((x) => x.h)) };
      const lbl = labelLeft(textPx, box, s) ?? labelAbove(textPx, box, s);
      found.push({ kind: "comb", box: toPt(box), label: lbl, name: name(lbl, "text"), tooltip: tooltipFor(lbl), source: "comb", confidence: 0.85, maxLen: row.length });
    }
  }
  for (const c of empty) {
    if (combUsed.has(c)) continue;
    const wPt = pt(c.w);
    const hPt = pt(c.h);
    const square = wPt <= 24 && hPt <= 24 && wPt / hPt > 0.7 && wPt / hPt < 1.4;
    if (square) {
      shapes.push({ r: c, kind: "square" });
      continue;
    }
    if (hPt < 10) continue;
    const lbl = labelLeft(textPx, c, s) ?? labelAbove(textPx, c, s);
    const isSig = !!lbl && SIGNATURE.test(lbl);
    found.push({
      kind: isSig ? "signature" : hPt >= 36 ? "multiline" : "text",
      box: toPt(c),
      label: lbl,
      name: name(lbl, isSig ? "signature" : "text"),
      tooltip: tooltipFor(lbl),
      source: "box",
      confidence: lbl ? 0.85 : 0.6,
    });
  }

  // ---- squares and circles ----
  const circles = shapes.filter((x) => x.kind === "circle" || (x.kind === "glyph" && glyphIsRound(textPx, x.r)));
  const squares = shapes.filter((x) => !circles.includes(x));
  for (const sq of squares) {
    const lbl = labelRight(textPx, sq.r, s) ?? labelLeft(textPx, sq.r, s);
    found.push({ kind: "checkbox", box: toPt(sq.r), label: lbl, name: name(lbl, "checkbox"), tooltip: lbl ?? "", source: sq.kind === "glyph" ? "glyph" : "square", confidence: lbl ? 0.9 : 0.7 });
  }
  // Radio groups: circles on one row (or one column) close together.
  const groups: Rect[][] = [];
  for (const c of [...circles].sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x)) {
    const g0 = groups.find((gr) => {
      const last = gr[gr.length - 1];
      const sameRow = Math.abs(last.y - c.r.y) <= 4 * s && c.r.x - last.x <= 220 * s;
      const sameCol = Math.abs(last.x - c.r.x) <= 4 * s && c.r.y - last.y <= 30 * s;
      return sameRow || sameCol;
    });
    if (g0) g0.push(c.r);
    else groups.push([c.r]);
  }
  groups.forEach((gr, gi) => {
    const bounds = { x: Math.min(...gr.map((r) => r.x)), y: Math.min(...gr.map((r) => r.y)), w: 0, h: 0 };
    bounds.w = Math.max(...gr.map((r) => r.x + r.w)) - bounds.x;
    bounds.h = Math.max(...gr.map((r) => r.y + r.h)) - bounds.y;
    const question = labelLeft(textPx, bounds, s, 200, gr.map((r) => r)) ?? labelAbove(textPx, bounds, s, 34);
    const groupName = name(question, "choice");
    const values = new Set<string>();
    gr.forEach((r, i) => {
      let v = labelRight(textPx, r, s) ?? `Choice${i + 1}`;
      while (values.has(v)) v = `${v}_${i + 1}`;
      values.add(v);
      found.push({ kind: "radio", box: toPt(r), label: question, name: groupName, tooltip: question ?? "", source: "circle", confidence: question ? 0.85 : 0.65, group: `g${gi}`, value: v });
    });
  });

  // Drop what overlaps fields already on the page (AC-244), and duplicates among the proposals.
  const kept: Found[] = [];
  for (const f of found.sort((a, b) => b.confidence - a.confidence)) {
    if (input.existing.some((e) => ofSmaller(f.box, e) >= 0.3)) continue;
    if (kept.some((k) => k.group == null && f.group == null && ofSmaller(k.box, f.box) >= 0.5)) continue;
    if (f.box.x < 0 || f.box.y < 0 || f.box.x + f.box.w > pageW + 1 || f.box.y + f.box.h > pageH + 1) continue;
    kept.push(f);
  }
  // Reading order: top to bottom, left to right; then names, unique across the form.
  kept.sort((a, b) => (Math.abs(a.box.y + a.box.h - (b.box.y + b.box.h)) < 6 ? a.box.x - b.box.x : a.box.y + a.box.h - (b.box.y + b.box.h)));
  const groupNames = new Map<string, string>();
  for (const f of kept) {
    const base = f.name;
    if (f.group && groupNames.has(f.group)) {
      f.name = groupNames.get(f.group)!;
      continue;
    }
    f.name = uniqueName(base, taken);
    taken.push(f.name);
    if (f.group) groupNames.set(f.group, f.name);
  }
  return kept;
}

/** Pixels of free space above a line, up to `want`, stopping at other ink (labels to the left aside). */
function freeAbove(g: Gray, ln: Line, want: number, labelBox: Rect | null, text: { r: Rect }[]): number {
  const x0 = ln.x0 + 1;
  const x1 = ln.x1 - 1;
  for (let d = 2; d <= want; d++) {
    const y = ln.y - d;
    if (y < 0) return d - 1;
    let dark = 0;
    for (let x = x0; x <= x1; x++) if (g.data[y * g.width + x] < INK) dark++;
    if (dark > 0.02 * (x1 - x0 + 1)) {
      // Ink of the label itself (when it overhangs the line start) does not count.
      if (labelBox && y >= labelBox.y && y <= labelBox.y + labelBox.h) continue;
      if (text.some((t) => t.r.x + t.r.w < x0 && y >= t.r.y && y <= t.r.y + t.r.h)) continue;
      return d - 1;
    }
  }
  return want;
}

/** True when a closed shape is round: its bounding-box corners are empty. */
function isRound(g: Gray, label: Int32Array, c: Comp): boolean {
  const w = c.x1 - c.x0 + 1;
  const h = c.y1 - c.y0 + 1;
  const k = Math.max(1, Math.round(Math.min(w, h) * 0.12));
  let corner = 0;
  for (const [cx, cy] of [
    [c.x0, c.y0],
    [c.x1 - k + 1, c.y0],
    [c.x0, c.y1 - k + 1],
    [c.x1 - k + 1, c.y1 - k + 1],
  ])
    for (let y = cy; y < cy + k; y++) for (let x = cx; x < cx + k; x++) if (label[y * g.width + x] === c.id) corner++;
  return corner <= k * k * 0.5;
}

const glyphIsRound = (text: { str: string; r: Rect }[], r: Rect) => text.some((t) => overlaps(r, t.r) && /[○◯⭘⚪❍]/u.test(t.str));

/** A shape with another component right next to it on the same row is part of a word. */
function hasNeighbour(comps: Comp[], c: Comp, s: number): boolean {
  return comps.some((o) => o !== c && o.y1 >= c.y0 && o.y0 <= c.y1 && ((o.x0 > c.x1 && o.x0 - c.x1 <= s * 1.2) || (o.x1 < c.x0 && c.x0 - o.x1 <= s * 1.2)));
}

type TextPx = TextItem & { r: Rect };

/** The text just left of a box on its row (up to `maxGap` points away). */
function labelLeft(text: TextPx[], box: Rect, s: number, maxGap = 140, skip: Rect[] = []): string | null {
  const midY = box.y + box.h / 2;
  const cand = text
    .filter((t) => t.str.trim() && t.r.x + t.r.w <= box.x + 2 * s && box.x - (t.r.x + t.r.w) <= maxGap * s && midY >= t.r.y - 4 * s && midY <= t.r.y + t.r.h + 4 * s)
    .filter((t) => !skip.some((k) => overlaps(k, t.r)))
    .sort((a, b) => b.r.x + b.r.w - (a.r.x + a.r.w))[0];
  const l = cand ? labelPart(cand.str) : "";
  return l || null;
}

/** The text right of a small box on its row: a checkbox's or radio button's own label. */
function labelRight(text: TextPx[], box: Rect, s: number): string | null {
  const midY = box.y + box.h / 2;
  const cand = text
    .filter((t) => t.str.trim() && !SHAPE_GLYPHS.test(t.str.trim()[0] ?? "") && t.r.x >= box.x + box.w - 2 * s && t.r.x - (box.x + box.w) <= 16 * s && midY >= t.r.y - 3 * s && midY <= t.r.y + t.r.h + 3 * s)
    .sort((a, b) => a.r.x - b.r.x)[0];
  if (cand) {
    const l = labelPart(cand.str);
    return l || null;
  }
  // A glyph box drawn in the same text run as its label ("☐ I agree").
  const same = text.find((t) => overlaps(box, t.r) && SHAPE_GLYPHS.test(t.str));
  if (same) {
    const after = same.str.split(SHAPE_GLYPHS).filter((p) => p.trim())[0];
    if (after) return labelPart(after) || null;
  }
  return null;
}

/** The nearest text line above a box (a question over a group, a heading over a box). */
function labelAbove(text: TextPx[], box: Rect, s: number, maxGap = 24): string | null {
  const cand = text
    .filter((t) => t.str.trim() && t.r.y + t.r.h <= box.y + 2 * s && box.y - (t.r.y + t.r.h) <= maxGap * s && t.r.x < box.x + box.w && t.r.x + t.r.w > box.x - 4 * s && Math.abs(t.r.x - box.x) <= 40 * s)
    .sort((a, b) => b.r.y - a.r.y)[0];
  const l = cand ? labelPart(cand.str) : "";
  return l || null;
}
