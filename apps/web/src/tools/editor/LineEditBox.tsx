"use client";
/**
 * The box a line of the PDF is edited in. It draws every part of the line in the font that part
 * has on the page (doc-face.ts), in its colour, on its baseline and over the page's own paper
 * colour, so opening and closing the box changes nothing on screen: no other font is ever shown
 * in place of the document's.
 *
 * A typed character the font lacks is underlined where it stands and named under the box, with
 * the closest fonts that have it; the one picked draws it at once, here and in the file. Typing
 * is never blocked.
 *
 * Hindi, Arabic and other joined scripts: a browser can't join their letters with a PDF's subset
 * (it has the glyphs, not the joining rules), so the engine lays the line out as the edit would
 * draw it (previewLine) and the box draws those outlines over its own text, which stays for the
 * caret and typing but is not seen. Opening the box changes nothing on screen, and what is shown
 * while typing is what Enter writes. Where the engine can't preview, a font that joins letters
 * stands in, as before.
 */
import { textOffsets } from "@/lib/editor/line-offsets";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { FontInfo, LinePreview, PageText } from "@/lib/editor/berry-engine";
import { cssFamily, faceOf, fileFor } from "@/lib/editor/fonts";
import { isComplex, needsShaping } from "@/lib/editor/shaping";
import { ensureFace, knownManifest, resolveFonts, widenFor } from "@/lib/editor/fonts-browser";
import { foldName } from "@/lib/font-library/client";
import { cx } from "@/components/ui/cx";
import { useCtl } from "./context";
import { docFace, type DocFace } from "./doc-face";
import { useStore } from "./store";
import { USER_FONT_ACCEPT } from "@/lib/font-library/user-fonts";
import { addUserFontFile, chosenStandIn, fontLabel, getFontState, standInCandidates } from "./font-service";

type Line = PageText["lines"][number];
export type EditBoxGeometry = { left: number; top: number; width: number; height: number; transform?: string };

const MARK = "ed-miss";
/** Fonts offered for the characters a document font lacks. */
const CHOICES = 3;
/** Room the hint is given on the page (its CSS max-width). */
const HINT_WIDTH = 300;
/** The gap between the box and its hint (the CSS offset of .ed-input__hint). */
const HINT_GAP = 5;

const generic = (font: FontInfo | undefined) => (font?.monospace ? "ui-monospace, Menlo, Consolas, monospace" : font?.serif ? "'Times New Roman', Times, serif" : "Arial, Helvetica, sans-serif");
/** The key a person's stand-in choice is kept under: the same name the controller asks the engine's request by. */
const familyKey = (font: FontInfo) => foldName(font.family || font.name);
const cleaned = (s: string | null) => (s ?? "").replace(/[\r\n]+/g, " ");

/** Accents a PDF may draw as a glyph of their own over a letter (TeX does). */
const ACCENT = /[\u00B4\u0060\u00A8\u02C6\u02DC\u00AF\u02D8\u02D9\u02DA\u00B8\u02C7]/;
/** A part of the box's text: a new one starts with each font and each word. */
type Piece = { span: HTMLElement; from: number };

type Scan = { at: number | null; ranges: Range[]; missing: { font: number; chars: string[] } | null; unasked: Map<number, string> };

/** Walks the box: which characters their font can't draw, and which were never asked about. */
function scan(el: HTMLElement, faces: Record<number, DocFace | null>, first: number): Scan {
  const out: Scan = { at: null, ranges: [], missing: null, unasked: new Map() };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const span = node.parentElement?.closest<HTMLElement>("[data-font]");
    const font = span && el.contains(span) ? Number(span.dataset.font) : first;
    const face = faces[font];
    if (!face?.covered) continue;
    const s = node.nodeValue ?? "";
    for (let i = 0; i < s.length; ) {
      const cp = s.codePointAt(i)!;
      const ch = String.fromCodePoint(cp);
      if (ch.trim()) {
        // A letter of a joined script (Hebrew, Arabic, Hindi, Thai) in a font that draws this
        // line letter by letter: the font is not asked about it (that would swap the whole
        // line to a stand-in), it is marked as missing unless the font is known to have it.
        const complex = isComplex(cp);
        if (!complex && !face.asked.has(cp)) out.unasked.set(font, (out.unasked.get(font) ?? "") + ch);
        else if (!face.covered.has(cp)) {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + ch.length);
          out.ranges.push(r);
          out.at ??= r.getBoundingClientRect().left - el.getBoundingClientRect().left;
          out.missing ??= { font, chars: [] };
          if (out.missing.font === font && !out.missing.chars.includes(ch)) out.missing.chars.push(ch);
        }
      }
      i += ch.length;
    }
  }
  return out;
}

function mark(ranges: Range[]): void {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
  if (ranges.length) CSS.highlights.set(MARK, new Highlight(...ranges));
  else CSS.highlights.delete(MARK);
}

function caretAt(el: HTMLElement, x: number, y: number): Range | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | undefined;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) [node, offset] = [pos.offsetNode, pos.offset];
  else {
    const r = document.caretRangeFromPoint?.(x, y);
    if (r) [node, offset] = [r.startContainer, r.startOffset];
  }
  if (!node || !el.contains(node)) return null;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
}

export function LineEditBox({
  text,
  line,
  value,
  scale,
  box,
  start,
  length,
  maxWidth,
  paperInset,
  around,
  pageOrigin,
  point,
  paper,
  onChange,
  onCommit,
  onCancel,
}: {
  text: PageText;
  line: Line;
  /** The text the box opens with (the line's own, unless an edit is being made again). */
  value: string;
  scale: number;
  box: EditBoxGeometry;
  /** Where the line's baseline starts on the page, in the layer's pixels; null when the text is simply centred (turned or right-to-left lines). */
  start: { x: number; y: number } | null;
  /** Length of the line on the page, in pixels. */
  length: number;
  maxWidth: number;
  /** How far the paper under the text stays clear of the box's top and bottom, so it never covers a neighbouring line. */
  paperInset: { top: number; bottom: number };
  /** Where the text of the lines around this one is drawn (layer pixels): the hint keeps off it where it can. */
  around: { left: number; right: number; top: number; bottom: number }[];
  /** Where the page's user-space origin is, in the layer's pixels, on an upright page (null when turned): engine glyphs are drawn from it. */
  pageOrigin: { x: number; y: number } | null;
  /** Where the line was clicked (viewport pixels): the caret goes there. */
  point: { x: number; y: number } | null;
  /** The page's colour under the line. */
  paper: () => string;
  onChange: (text: string) => void;
  onCommit: (asked: boolean) => void;
  onCancel: () => void;
}) {
  const ctl = useCtl();
  // On a phone the page's text is smaller than the hint: it is docked above the tools instead of floating over the page.
  const wide = useStore(ctl.store, (s) => s.wide);
  const [slot, setSlot] = useState<Element | null>(null);
  const hintFocused = useRef(false);
  /** A stand-in font this edit took on its own, and what was remembered before it. */
  const taken = useRef<{ key: string; before: string | undefined } | null>(null);
  const cancel = () => {
    const t = taken.current;
    taken.current = null;
    if (t) void ctl.pickStandIn(t.key, t.before);
    onCancel();
  };
  useLayoutEffect(() => {
    if (wide) return setSlot(null);
    const area = document.querySelector<HTMLElement>(".ed-toasts");
    // A message, while one shows, takes the hint's fonts in: the two are never stacked.
    const find = () => {
      const next = area?.querySelector('[data-line-hint-slot="toast"]') ?? area?.querySelector('[data-line-hint-slot="dock"]') ?? null;
      setSlot((was) => {
        // A font button that had the focus went with the old place: the box takes it back.
        // (It is gone from the page by now, so the focus it had is remembered, not looked up.)
        if (was !== next && hintFocused.current) {
          hintFocused.current = false;
          queueMicrotask(() => el.current?.focus({ preventScroll: true }));
        }
        return next;
      });
    };
    find();
    if (!area) return;
    const seen = new MutationObserver(find);
    seen.observe(area, { childList: true, subtree: true });
    // An on-screen keyboard covers the bottom of the page without resizing it: the row stays above it.
    const vv = window.visualViewport;
    const lift = () => area.style.setProperty("--ed-keyboard", `${!vv || vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    lift();
    vv?.addEventListener("resize", lift);
    vv?.addEventListener("scroll", lift);
    return () => {
      seen.disconnect();
      vv?.removeEventListener("resize", lift);
      vv?.removeEventListener("scroll", lift);
      area.style.removeProperty("--ed-keyboard");
    };
  }, [wide]);
  const el = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const composing = useRef(false);
  const placed = useRef(false);
  const first = line.runs[0]?.font ?? -1;
  const fontIds = [...new Set(line.runs.map((r) => r.font))];
  const [faces, setFaces] = useState<Record<number, DocFace | null>>({});
  const [waited, setWaited] = useState(false);
  const [paperColor, setPaperColor] = useState<string | null>(null);
  const [missing, setMissing] = useState<Scan["missing"]>(null);
  const [standIn, setStandIn] = useState<{ font: number; chars: string; ids: string[]; picked: string } | null>(null);
  /** Spacing that fits the text to the line's length, per unit of zoom (so it holds when the page is zoomed). */
  const [fit, setFit] = useState<{ word?: number; letter?: number } | null>(null);
  /** Where the first missing character stands in the box: the hint starts there. */
  const [missAt, setMissAt] = useState(0);
  const [hintSize, setHintSize] = useState({ w: 220, h: 26 });
  /** How wide the box is drawn now (it grows with the text). */
  const [inputWidth, setInputWidth] = useState(0);
  /** What the browser's own rounding puts between the baseline asked for and the one drawn, at this size. */
  const [nudge, setNudge] = useState<{ key: string; px: number } | null>(null);
  const turned = !!box.transform;
  const boxTop = box.top;
  /** The line as the engine draws it (joined scripts), and whether it is the text in the box now. */
  const [drawn, setDrawn] = useState<{ preview: LinePreview; current: boolean } | null>(null);
  const settled = fontIds.every((i) => i in faces);
  /** Each word is set where the page has it (tab gaps, dot leaders, tracking, accents), on lines the browser sets left to right. */
  const byWord = !!pageOrigin && !turned && Math.abs(line.angle) < 0.01 && line.direction !== "rtl" && !needsShaping(line.text);
  const pieces = useRef<Piece[]>([]);
  /** The line's runs and words by their place in its text (the engine's own numbers drift after a ligature). */
  const runAt = textOffsets(line.text, line.runs) ?? line.runs;
  const wordAt = textOffsets(line.text, line.words);
  const words = byWord && wordAt ? line.words.map((w, i) => ({ ...w, ...wordAt[i]! })) : [];
  // Shown in the document's fonts only; a font that never arrives gives way after a long wait.
  const ready = settled || waited || !!drawn;
  /** Joined-script lines on an upright page are drawn from the engine's glyphs. */
  const engineDrawn = !!pageOrigin && !turned && (needsShaping(line.text) || needsShaping(value));
  const glyphsRef = useRef<SVGGElement>(null);
  /** Where the drawn glyphs' ink starts and ends, from the box's left edge (CSS px). */
  const [ink, setInk] = useState<{ left: number; right: number } | null>(null);
  const previewWanted = useRef<string | null>(null);
  const previewBusy = useRef(false);
  /** Counts requests (and cancels): a result is used only if nothing was asked since. */
  const previewSeq = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /** Asks the engine for the line with `t`; one request at a time, always for the latest text. */
  const requestPreview = (t: string) => {
    previewSeq.current++;
    previewWanted.current = t;
    setDrawn((d) => (d && d.current ? { ...d, current: false } : d));
    if (previewBusy.current) return;
    previewBusy.current = true;
    void (async () => {
      while (alive.current && previewWanted.current !== null) {
        const asked = previewWanted.current;
        const seq = previewSeq.current;
        previewWanted.current = null;
        let got: LinePreview | null = null;
        try {
          got = await ctl.previewLine(text.page, line.id, asked, () => alive.current && previewSeq.current === seq);
        } catch {
          // Refused or not drawable: the stand-in text shows what is typed.
        }
        if (!alive.current || previewSeq.current !== seq) continue;
        if (got) setDrawn({ preview: got, current: true });
        else {
          // The stand-in font shows the text, at its own spacing, and the caret goes where the click landed.
          setDrawn(null);
          setFit(null);
          if (caretTodo.current) {
            caretTodo.current = false;
            placeCaret();
          }
        }
      }
      previewBusy.current = false;
    })();
  };
  /** The text no longer needs the engine's glyphs (the joined letters were deleted): the box's own text shows. */
  const stopPreview = () => {
    previewSeq.current++;
    previewWanted.current = null;
    setDrawn(null);
  };
  const standInRef = useRef(standIn);
  standInRef.current = standIn;
  const facesRef = useRef(faces);
  facesRef.current = faces;

  /** The file chooser for "Use your own font" is open: the box losing focus to it is not the end of the edit. */
  const choosing = useRef(false);
  const ownFile = useRef<HTMLInputElement>(null);
  /** Enter ended the edit (not a click elsewhere). */
  const entered = useRef(false);
  const [ownError, setOwnError] = useState("");
  /** Counts fonts the person added while this box is open: the choices are looked up again. */
  const [added, setAdded] = useState(0);
  // Closing the chooser without a file hands the caret back too.
  useEffect(() => {
    const input = ownFile.current;
    const back = () => {
      choosing.current = false;
      el.current?.focus({ preventScroll: true });
    };
    input?.addEventListener("cancel", back);
    return () => input?.removeEventListener("cancel", back);
  }, []);
  const caretTodo = useRef(false);
  /** Where the caret was put on opening: placed again at the click only while it is still there. */
  const opened = useRef<{ node: Node | null; offset: number } | null>(null);
  const placeCaret = () => {
    const caret = point && !touched.current && el.current ? caretAt(el.current, point.x, point.y) : null;
    if (!caret) return;
    const sel = getSelection();
    // The person already moved the caret or selected text (a key, a click, select-all): theirs stands.
    const at = opened.current;
    if (sel && at && (!sel.isCollapsed || sel.anchorNode !== at.node || sel.anchorOffset !== at.offset)) return;
    sel?.removeAllRanges();
    sel?.addRange(caret);
  };

  /**
   * Sets each word where the page has it: a gap the text has no characters for (a tab, dot
   * leaders, justified text) goes before its word, tracking and a wider or narrower setting go
   * between its letters, and an accent drawn as a glyph of its own goes over its letter. Kept
   * per unit of zoom on each part. False when the line has no words to go by.
   */
  const fitWords = (): false | "now" | "later" => {
    const ps = pieces.current;
    if (!words.length || !ps.length) return false;
    const node = (offset: number, end: boolean): [Node, number] | null => {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]!;
        if (end ? p.from < offset : p.from <= offset) {
          const n = p.span.firstChild;
          return n ? [n, Math.min(offset - p.from, n.nodeValue?.length ?? 0)] : null;
        }
      }
      return null;
    };
    const rect = (a: number, b: number): DOMRect | null => {
      const from = node(a, false);
      const to = node(b, true);
      if (!from || !to) return null;
      const r = document.createRange();
      r.setStart(from[0], from[1]);
      r.setEnd(to[0], to[1]);
      return r.getBoundingClientRect();
    };
    const set = (span: HTMLElement, key: "ml" | "mr" | "ls", px: number) => {
      span.dataset[key] = String(px / scale);
      span.style[key === "ml" ? "marginLeft" : key === "mr" ? "marginRight" : "letterSpacing"] = `${px}px`;
    };
    const wordOf = (offset: number) => words.find((w) => w.start <= offset && offset < w.end);
    // An accent that the page draws over a letter, where the text has it beside the letter.
    const letter = (i: number) => /\p{L}/u.test(value[i] ?? "");
    for (const p of ps) {
      const t = p.span.textContent ?? "";
      const word = t.length === 1 && ACCENT.test(t) ? wordOf(p.from) : undefined;
      if (!word) continue;
      const all = rect(word.start, word.end);
      const own = rect(p.from, p.from + 1);
      if (!all || !own) continue;
      // Only where the word is shorter on the page than its letters set side by side: an acute
      // typed for an apostrophe ("d´une") stands beside its letters on the page too.
      if (all.width - (word.bbox.x1 - word.bbox.x0) * scale < own.width * 0.35) continue;
      const before = p.from > word.start && letter(p.from - 1) ? (rect(p.from - 1, p.from)?.width ?? 0) : 0;
      const after = p.from + 1 < word.end && letter(p.from + 1) ? (rect(p.from + 1, p.from + 2)?.width ?? 0) : 0;
      // Glyphs read left to right, so an accent no wider than the letter before it sits on that
      // one; a dotless i or j is there for the accent before it.
      const onNext = after && (/[\u0131\u0237]/.test(value[p.from + 1]!) || !before || own.width > before + 0.5);
      const left = onNext ? (after - own.width) / 2 : before ? -(before + own.width) / 2 : null;
      if (left === null) continue;
      set(p.span, "ml", left);
      set(p.span, "mr", -(left + own.width));
      if (!onNext) p.span.dataset.over = "before";
    }
    // Each word as long as on the page.
    for (const w of words) {
      const r = rect(w.start, w.end);
      const want = (w.bbox.x1 - w.bbox.x0) * scale;
      const inside = ps.filter((p) => p.from >= w.start && p.from < w.end && !p.span.dataset.mr);
      const letters = inside.reduce((n, p, i) => n + [...(p.span.textContent ?? "").slice(0, (inside[i + 1]?.from ?? w.end) - p.from)].length, 0);
      if (!r || !r.width || !letters) continue;
      const diff = want - r.width;
      if (Math.abs(diff) <= 0.5 || Math.abs(diff) >= want * 0.25) continue;
      // A word with an accent over one of its letters: what it is longer by on the page stands
      // before that letter (TeX sets the accented letter after a small gap), not between all of them.
      const accent = ps.find((p) => p.from > w.start && p.from < w.end && p.span.dataset.over === "before");
      const base = accent && diff > 0 ? ps.find((p) => p.from === accent.from - 1 && p.from > w.start) : undefined;
      if (base) set(base.span, "ml", diff);
      else for (const p of inside) set(p.span, "ls", diff / letters);
    }
    // Each word where the page has it, counted from the first. What most single spaces are short
    // by is the line's word spacing (justified text), so a space typed later is as wide as those.
    const lefts = words.map((w) => rect(w.start, w.start + 1)?.left);
    const moves: { span: HTMLElement; px: number; spaces: number; space: boolean }[] = [];
    let shift = 0;
    for (let i = 1; i < words.length; i++) {
      const p = ps.find((q) => q.from === words[i]!.start);
      if (!p || lefts[i] === undefined || lefts[0] === undefined) continue;
      const px = (words[i]!.bbox.x0 - words[0]!.bbox.x0) * scale - (lefts[i]! - lefts[0] + shift);
      const gap = value.slice(words[i - 1]!.end, words[i]!.start);
      moves.push({ span: p.span, px, spaces: gap.split(" ").length - 1, space: gap === " " });
      shift += px;
    }
    const single = moves.filter((m) => m.space).map((m) => m.px).sort((a, b) => a - b);
    const common = single.length > 1 ? single[single.length >> 1]! : 0;
    const spacing = Math.abs(common) > 0.5 && single.filter((v) => Math.abs(v - common) <= 0.5).length >= single.length * 0.8 ? common : 0;
    if (spacing) setFit({ word: spacing / scale });
    // What is too small to set at one word is carried to the next, so it never adds up along the line.
    let carry = 0;
    for (const m of moves) {
      const px = m.px - spacing * m.spaces + carry;
      carry = Math.abs(px) > 0.5 ? 0 : px;
      if (!carry) set(m.span, "ml", px + Number(m.span.dataset.ml ?? 0) * scale);
    }
    return spacing ? "later" : "now";
  };

  const rescan = () => {
    const box = el.current;
    if (!box) return;
    // An accent's part that was typed into is ordinary text again: it no longer sits over a letter.
    for (const span of box.querySelectorAll<HTMLElement>("[data-mr]"))
      if ((span.textContent ?? "").length !== 1) {
        delete span.dataset.ml;
        delete span.dataset.mr;
        delete span.dataset.over;
        span.style.marginLeft = span.style.marginRight = "";
      }
    const found = scan(box, facesRef.current, first);
    setInputWidth(box.offsetWidth);
    mark(found.ranges);
    if (found.at !== null) setMissAt(Math.round(found.at));
    setMissing((m) => (m?.font === found.missing?.font && m?.chars.join("") === found.missing?.chars.join("") ? m : found.missing));
    // A character nobody asked the font about yet: ask, and draw with what comes back.
    for (const [font, chars] of found.unasked) {
      const info = text.fonts[font];
      const known = facesRef.current[font];
      if (info) void docFace(info, [...(known?.asked ?? [])].map((cp) => String.fromCodePoint(cp)).join("") + chars).then((f) => f && el.current && setFaces((all) => ({ ...all, [font]: f })), () => undefined);
    }
  };

  // The line's text, one part per font, written once: from here on the browser edits it.
  useLayoutEffect(() => {
    const box = el.current!;
    if (!box.isContentEditable) box.contentEditable = "true";
    box.textContent = "";
    // An edit opened again (it couldn't be saved, or its font is being changed) keeps each part
    // in its own font as far as the text is still the line's; what differs from there on is in
    // the font of the part where it starts to differ.
    let same = 0;
    while (same < value.length && same < line.text.length && value[same] === line.text[same]) same++;
    const whole = value === line.text;
    const runsAt = line.runs.map((run, k) => ({ ...run, start: runAt[k]!.start }));
    const runs = whole ? runsAt : runsAt.filter((run, k) => k === 0 || run.start < same);
    const cuts = new Set<number>();
    if (whole && words.length) {
      for (const w of words) cuts.add(w.start);
      // An accent is a part of its own, and so is the letter before it (the page may set that
      // letter apart from the rest of its word: "caf é").
      for (let i = 0; i < value.length; i++) if (ACCENT.test(value[i]!)) cuts.add(i).add(i + 1).add(Math.max(0, i - 1));
    }
    pieces.current = [];
    runs.forEach((run, k) => {
      const from = k === 0 ? 0 : run.start;
      const to = k === runs.length - 1 ? value.length : runs[k + 1]!.start;
      const at = [from, ...[...cuts].filter((c) => c > from && c < to).sort((a, b) => a - b), to];
      for (let j = 0; j + 1 < at.length; j++) {
        const span = document.createElement("span");
        span.dataset.font = String(run.font);
        span.dataset.size = String(run.size);
        span.dataset.color = run.color.join(" ");
        span.textContent = value.slice(at[j], at[j + 1]);
        box.append(span);
        pieces.current.push({ span, from: at[j]! });
      }
    });
    if (!runs.length) box.textContent = value;
    // No line breaks or rich formatting: the box holds one line of plain text.
    const guard = (e: InputEvent) => {
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak" || e.inputType.startsWith("format")) e.preventDefault();
    };
    box.addEventListener("beforeinput", guard);
    setPaperColor(paper());
    box.focus({ preventScroll: true });
    // The caret at the end, inside the last piece of text (a position after it isn't kept by every browser).
    const end = document.createRange();
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n;
    if (last) end.setStart(last, last.nodeValue?.length ?? 0);
    else end.selectNodeContents(box);
    end.collapse(true);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(end);
    opened.current = { node: end.startContainer, offset: end.startOffset };
    return () => {
      box.removeEventListener("beforeinput", guard);
      mark([]);
    };
    // Written once per opened line (the box is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineDrawn) requestPreview(value);
    let alive = true;
    for (const i of fontIds) {
      const info = text.fonts[i];
      const shown = line.runs.filter((r) => r.font === i).map((r) => r.text).join("");
      void (info ? docFace(info, shown) : Promise.resolve(null)).then(
        (f) => alive && setFaces((all) => ({ ...all, [i]: f })),
        () => alive && setFaces((all) => ({ ...all, [i]: null })),
      );
    }
    // Until the fonts are ready the page's own drawing of the line shows through the box.
    const t = setTimeout(() => setWaited(true), 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each part in its own font, size and colour. A font's missing characters fall to the stand-in.
  useLayoutEffect(() => {
    const box = el.current;
    if (!box) return;
    for (const span of box.querySelectorAll<HTMLElement>("[data-font]")) {
      const i = Number(span.dataset.font);
      const info = text.fonts[i];
      const face = faces[i];
      const stand = standIn && standIn.font === i && standIn.picked ? `"${cssFamily(standIn.picked)}", ` : "";
      span.style.fontFamily = `${face ? `"${face.family}", ` : ""}${stand}${generic(info)}`;
      // The embedded font already is the bold or italic face: asking again would fake one on top.
      span.style.fontWeight = (face ? face.kind === "close" && face.bold : !!info?.bold) ? "700" : "400";
      span.style.fontStyle = (face ? face.kind === "close" && face.italic : !!info?.italic) ? "italic" : "normal";
      span.style.fontSize = `${Number(span.dataset.size) * scale}px`;
      span.style.color = ready ? `rgb(${span.dataset.color})` : "";
      span.style.lineHeight = "0";
      // Where the page sets this part (fitWords), at this zoom.
      span.style.marginLeft = span.dataset.ml ? `${Number(span.dataset.ml) * scale}px` : "";
      span.style.marginRight = span.dataset.mr ? `${Number(span.dataset.mr) * scale}px` : "";
      span.style.letterSpacing = span.dataset.ls ? `${Number(span.dataset.ls) * scale}px` : "";
    }
    if (!ready) return;
    // The baseline as the browser really drew it, read off a mark of no size, against the page's.
    const nudgeKey = `${scale}|${facesRef.current[first]?.family}`;
    if (start && facesRef.current[first] && nudge?.key !== nudgeKey && !composing.current) {
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      box.prepend(probe);
      const off = start.y - (probe.getBoundingClientRect().top - box.parentElement!.getBoundingClientRect().top + boxTop);
      probe.remove();
      setNudge({ key: nudgeKey, px: Math.abs(off) < 4 ? off : 0 });
    }
    rescan();
    if (!placed.current && settled) {
      placed.current = true;
      let fitted = false;
      // Fitted to the line's length on the page (justified text, tracking), measured once.
      // (Lines drawn from the engine's glyphs are fitted to those glyphs instead, below.)
      const byWords = value === line.text && length > 0 && !engineDrawn && fitWords();
      // (With word spacing still to come, the caret is placed once that is drawn.)
      if (byWords) {
        fitted = byWords === "later";
        setInputWidth(box.offsetWidth);
      }
      else if (!turned && value === line.text && length > 0 && !engineDrawn) {
        const all = document.createRange();
        all.selectNodeContents(box);
        const diff = length - all.getBoundingClientRect().width;
        const spaces = (line.text.trim().match(/ /g) ?? []).length;
        const letters = [...line.text].length;
        fitted = Math.abs(diff) > 0.5 && Math.abs(diff) < length * 0.2 && (spaces > 0 || letters > 1);
        if (fitted) setFit(spaces ? { word: diff / spaces / scale } : { letter: diff / letters / scale });
      }
      // The caret goes where the click landed, once the text is at its final length.
      if (fitted || engineDrawn) caretTodo.current = true;
      else placeCaret();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, standIn, scale, ready, settled]);

  // The box covers the drawn glyphs, and its unseen text is spread to their length so the caret
  // stands where they end.
  useLayoutEffect(() => {
    const g = glyphsRef.current;
    const input = el.current;
    // Only glyphs of the text in the box now: a stale drawing would fit the text to the old length.
    if (!drawn?.current || !g || !input?.parentElement) return;
    const frame = input.parentElement.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    if (!r.width) return;
    const left = r.left - frame.left;
    const right = r.right - frame.left;
    setInk((s) => (s && Math.abs(s.left - left) < 0.5 && Math.abs(s.right - right) < 0.5 ? s : { left, right }));
    const all = document.createRange();
    all.selectNodeContents(input);
    const diff = r.width - all.getBoundingClientRect().width;
    const t = input.textContent ?? "";
    const spaces = (t.trim().match(/ /g) ?? []).length;
    if (Math.abs(diff) > 0.5 && Math.abs(diff) < r.width * 0.5)
      setFit((f) => (spaces ? { word: (f?.word ?? 0) + diff / spaces / scale } : { letter: (f?.letter ?? 0) + diff / Math.max(1, [...t].length) / scale }));
    else if (caretTodo.current) {
      // The caret goes where the click landed once the text lies under the glyphs.
      caretTodo.current = false;
      placeCaret();
    }
    // Again when a font arrives or the page is zoomed: the unseen text's length changes with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, faces, scale]);

  useLayoutEffect(() => {
    if (!fit || !caretTodo.current) return;
    caretTodo.current = false;
    placeCaret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // The closest fonts that have the missing characters.
  const lacking = missing ? `${missing.font}:${missing.chars.join("")}` : "";
  useEffect(() => {
    if (!missing) return;
    const info = text.fonts[missing.font];
    if (!info) return;
    let alive = true;
    const chars = missing.chars.join("");
    void (async () => {
      const ids = await standInCandidates(info, { families: [info.family || info.name], bold: info.bold, italic: info.italic }, chars);
      await resolveFonts([...ids, ...getFontState().user.map((u) => u.id)]).catch(() => undefined);
      // A built-in family may have these characters in the library's copy of it.
      await widenFor(ids, chars).catch(() => undefined);
      const m = knownManifest();
      // Those that have the most of the missing characters first; closeness decides between equals.
      const has = (id: string) => {
        const face = m?.faces[id] && faceOf(m, id, info.bold, info.italic);
        return face ? missing.chars.filter((c) => fileFor(face, c.codePointAt(0)!)).length : 0;
      };
      const able = [...getFontState().user.map((u) => u.id).filter((id) => !ids.includes(id)), ...ids]
        .filter((id) => has(id) > 0)
        .sort((a, b) => has(b) - has(a))
        .slice(0, CHOICES);
      await Promise.allSettled(able.map((id) => ensureFace(id, info.bold, info.italic, chars + fontLabel(id))));
      if (!alive) return;
      const kept = standInRef.current;
      // The same fonts stay in the same places: a pick never reshuffles the row.
      if (kept && kept.font === missing.font && kept.ids.length === able.length && able.every((id) => kept.ids.includes(id))) able.splice(0, able.length, ...kept.ids);
      const picked = kept && kept.font === missing.font && able.includes(kept.picked) ? kept.picked : (able[0] ?? "");
      // What the box shows is what the file gets: the font in use is recorded as the choice.
      if (picked && chosenStandIn(familyKey(info)) !== picked) {
        // Taken without being asked: an edit given up with Escape leaves no trace of it.
        taken.current ??= { key: familyKey(info), before: chosenStandIn(familyKey(info)) };
        await ctl.pickStandIn(familyKey(info), picked);
      }
      if (alive) setStandIn({ font: missing.font, chars, ids: able, picked });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lacking, added]);

  const firstFace = faces[first];
  const fontSize = line.size * scale;
  let padTop = 0;
  let padBottom = 0;
  let padLeft = 2;
  if (start && firstFace) {
    const shift = start.y - box.top - (box.height / 2 + ((firstFace.ascent - firstFace.descent) / 2) * fontSize) + (nudge?.key === `${scale}|${firstFace.family}` ? nudge.px : 0);
    if (Math.abs(shift) * 2 < box.height) {
      padTop = Math.max(0, 2 * shift);
      padBottom = Math.max(0, -2 * shift);
      padLeft = Math.max(0, start.x - box.left);
    }
  }
  const [r, g, b] = line.runs[0]?.color ?? [17, 17, 17];
  const info = text.fonts[first];
  // The ring and the paper are painted inside the box, over the line's own band only: where a
  // neighbouring line's text reaches into the box they stop short of it. The ring is always a
  // closed rectangle around that band (all four edges show, however tight the lines are set).
  // The ring is thinner on small text.
  const w = fontSize < 11 ? 1 : 2;
  const band = Math.max(0, box.height - paperInset.top - paperInset.bottom);
  const brand = "linear-gradient(var(--color-brand), var(--color-brand))";
  const paperFill = `linear-gradient(${paperColor ?? "#ffffff"}, ${paperColor ?? "#ffffff"})`;
  const layers: [image: string, position: string, size: string][] = [
    [brand, `0 ${paperInset.top}px`, `${w}px ${band}px`],
    [brand, `100% ${paperInset.top}px`, `${w}px ${band}px`],
    [brand, `0 ${paperInset.top}px`, `100% ${w}px`],
    [brand, `0 ${paperInset.top + Math.max(0, band - w)}px`, `100% ${w}px`],
    [paperFill, `0 ${paperInset.top}px`, `100% ${band}px`],
  ];
  const type: CSSProperties = {
    minWidth: box.transform ? "100%" : box.width,
    maxWidth: box.transform ? "100%" : Math.max(box.width, maxWidth),
    height: box.height,
    paddingLeft: padLeft,
    paddingRight: 2,
    paddingTop: padTop,
    paddingBottom: padBottom,
    lineHeight: `${box.height - padTop - padBottom}px`,
    fontSize,
    fontFamily: `${firstFace ? `"${firstFace.family}", ` : ""}${standIn && standIn.font === first && standIn.picked ? `"${cssFamily(standIn.picked)}", ` : ""}${generic(info)}`,
    fontWeight: (firstFace ? firstFace.kind === "close" && firstFace.bold : !!info?.bold) ? 700 : 400,
    fontStyle: (firstFace ? firstFace.kind === "close" && firstFace.italic : !!info?.italic) ? "italic" : "normal",
    ...(ready
      ? {
          color: `rgb(${r} ${g} ${b})`,
          caretColor: `rgb(${r} ${g} ${b})`,
          backgroundImage: layers.map((l) => l[0]).join(", "),
          backgroundRepeat: "no-repeat",
          backgroundPosition: layers.map((l) => l[1]).join(", "),
          backgroundSize: layers.map((l) => l[2]).join(", "),
        }
      : null),
    ...(fit?.word !== undefined ? { wordSpacing: fit.word * scale } : null),
    ...(fit?.letter !== undefined ? { letterSpacing: fit.letter * scale } : null),
  };
  const settling = !ready || paperColor === null;
  // A right-to-left line keeps its right end as it grows, as the engine draws it, and the box
  // reaches past the drawn glyphs' ends.
  if ((drawn || engineDrawn) && line.direction === "rtl") Object.assign(type, { left: "auto", right: 0 });
  if (drawn && ink && !box.transform) {
    const need = line.direction === "rtl" ? box.width - ink.left + 4 : ink.right + 4;
    type.minWidth = Math.max(box.width, need);
  }
  const hintId = `ed-miss-${line.id}`;
  // The hint goes where it hides no text: under the box, starting at the missing character,
  // when nothing is drawn there; else beside the box on the line's own row (a short line has
  // room after it); else over the box (inside a paragraph something is always covered: then it
  // is the line already read, not the one that comes next).
  const free = (left: number, top: number) =>
    !around.some((o) => o.right > box.left + left && o.left < box.left + left + hintSize.w && o.bottom > top && o.top < top + hintSize.h);
  const underLeft = Math.max(4 - box.left, Math.min(missAt - 10, maxWidth - HINT_WIDTH));
  const besideLeft = inputWidth + 8;
  // Beside the box it is centred on the text's own middle (between baseline and cap height), which is where the rows around leave most room.
  const besideTop = (start ? start.y - fontSize * 0.25 : box.top + box.height / 2) - hintSize.h / 2;
  const side: "under" | "beside" | "over" =
    turned || free(underLeft, box.top + box.height + HINT_GAP)
      ? "under"
      : inputWidth > 0 && besideLeft + hintSize.w <= maxWidth && free(besideLeft, besideTop)
        ? "beside"
        : "over";
  const hintLeft = side === "beside" ? besideLeft : underLeft;
  const shown = standIn && missing && standIn.font === missing.font ? standIn : null;

  const docked = !!slot;
  const inMessage = slot?.getAttribute("data-line-hint-slot") === "toast";
  const hint = missing ? (
        <div
          id={hintId}
          className={inMessage ? "ed-toast__picks" : docked ? "ed-input__hint ed-input__hint--docked ed-glass" : cx("ed-input__hint", side !== "under" && `ed-input__hint--${side}`)}
          ref={(node) => {
            // Its real size (it depends on the fonts offered) decides which side is clear.
            if (node && !docked && (Math.abs(node.offsetWidth - hintSize.w) > 1 || Math.abs(node.offsetHeight - hintSize.h) > 1)) setHintSize({ w: node.offsetWidth, h: node.offsetHeight });
          }}
          style={docked ? undefined : side === "beside" ? { left: hintLeft, top: besideTop - box.top } : { left: hintLeft }}
          data-testid="line-missing"
          onFocus={() => (hintFocused.current = true)}
          onBlur={() => (hintFocused.current = false)}
          data-side={inMessage ? "message" : docked ? "docked" : side}
        >
          <span className={inMessage ? "sr-only" : undefined}>
            {docked ? "Missing: " : "Not in this font: "}
            <span className="ed-input__chars">{missing.chars.slice(0, 8).join(" ")}</span>
          </span>
          {shown && shown.ids.length > 0 && (
            <span role="group" aria-label="Font for these characters" className="ed-input__picks">
              {shown.ids.slice(0, docked ? 2 : CHOICES).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={shown.picked === id}
                  data-testid="line-missing-font"
                  data-font-id={id}
                  className={cx("ed-input__pick", shown.picked === id && "ed-input__pick--on")}
                  style={{ fontFamily: `"${cssFamily(id)}", inherit` }}
                  // The box keeps the caret: picking a font never ends the edit.
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const font = text.fonts[shown.font];
                    if (!font || shown.picked === id) return el.current?.focus({ preventScroll: true });
                    // Another font may be able to save what the last one couldn't.
                    ctl.retryable();
                    taken.current = null;
                    void ctl.pickStandIn(familyKey(font), id);
                    setStandIn({ ...shown, picked: id });
                    el.current?.focus({ preventScroll: true });
                  }}
                >
                  {fontLabel(id)}
                </button>
              ))}
            </span>
          )}
          {shown && shown.ids.length === 0 && (
            <span className="ed-input__picks">
              {(!docked || ownError) && <span data-testid="line-missing-none">{ownError || "No font here has it."}</span>}
              <button
                type="button"
                data-testid="line-missing-own"
                className="ed-input__pick"
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  choosing.current = true;
                  // Back from the chooser, with or without a file: leaving the box ends the edit again.
                  window.addEventListener("focus", () => setTimeout(() => (choosing.current = false), 500), { once: true });
                  ownFile.current?.click();
                }}
              >
                Use your own font
              </button>
            </span>
          )}
        </div>
  ) : null;

  return (
    <div
      className="absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, transform: box.transform }}
      // Leaving the box and its hint ends the edit; moving between them (Tab to a font) does not.
      onBlur={(e) => {
        if (choosing.current) return;
        const to = e.relatedTarget as Element | null;
        if (e.currentTarget.contains(to) || to?.closest?.("[data-line-hint-slot]")) return;
        const asked = entered.current;
        entered.current = false;
        onCommit(asked);
      }}
      onKeyDown={(e) => {
        if (e.target === el.current) return;
        // Keys on the hint's buttons are theirs alone (no editor shortcuts); Escape still cancels.
        e.stopPropagation();
        // From the ends of the docked hint, Tab comes back to the box.
        if (e.key === "Tab" && slot) {
          // Back from its first button, Shift+Tab returns to the box; Tab past its last one leaves (and ends the edit).
          if (e.shiftKey && e.target === slot.querySelector("button")) {
            e.preventDefault();
            el.current?.focus({ preventScroll: true });
          }
          return;
        }
        if (e.key !== "Escape") return;
        cancel();
        (e.target as HTMLElement).blur();
      }}
    >
      {/* Always here, so a screen reader hears the change when a character turns out to be missing. */}
      <span role="status" className="sr-only" data-testid="line-missing-status">
        {missing ? `Not in this font: ${missing.chars.join(" ")}.${shown?.picked ? ` ${fontLabel(shown.picked)} draws ${missing.chars.length > 1 ? "them" : "it"}.` : shown ? " No font here has it. Use your own font, or remove it." : ""}` : ""}
      </span>
      <div
        ref={el}
        role="textbox"
        aria-multiline="false"
        aria-label={`Edit line: ${line.text}`}
        aria-describedby={missing ? hintId : undefined}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="done"
        dir={line.direction}
        data-testid="line-input"
        data-face={firstFace ? firstFace.kind : first in faces ? "none" : "pending"}
        data-faces={fontIds.map((i) => faces[i]?.kind ?? (i in faces ? "none" : "pending")).join(" ")}
        data-missing={missing?.chars.join("") ?? ""}
        data-inset={[paperInset.top > 0 && "top", paperInset.bottom > 0 && "bottom"].filter(Boolean).join(" ")}
        data-drawn={drawn ? (drawn.current ? "engine" : "engine-pending") : engineDrawn ? "stand-in" : undefined}
        className={cx("ed-input absolute left-0 top-0 rounded-[4px]", settling && "ed-input--settling", drawn && "ed-input--drawn")}
        style={type}
        // Back in the box (a file chooser closed without telling): leaving it ends the edit again.
        onFocus={() => (choosing.current = false)}
        onInput={(e) => {
          choosing.current = false;
          touched.current = true;
          const now = cleaned(e.currentTarget.textContent);
          onChange(now);
          if (pageOrigin && !turned && (needsShaping(line.text) || needsShaping(now))) requestPreview(now);
          else stopPreview();
          rescan();
        }}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, cleaned(e.clipboardData.getData("text/plain")));
        }}
        onDrop={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.stopPropagation();
          touched.current = true;
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          // A key before the caret was placed at the click (End, an arrow): the person's caret stands.
          touched.current = true;
          // Enter that finishes a composition (an input method) is not the end of the edit.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          // The docked hint is elsewhere in the page: Tab goes to its fonts all the same.
          const pick = e.key === "Tab" && !e.shiftKey ? slot?.querySelector<HTMLElement>("button") : null;
          if (pick) {
            e.preventDefault();
            pick.focus();
          } else if (e.key === "Enter") {
            e.preventDefault();
            entered.current = true;
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            e.currentTarget.blur();
          }
        }}
      />
      {drawn && pageOrigin && (
        // The line's glyphs as the engine draws them, over the box's own (unseen) text.
        <svg className="ed-input__glyphs" aria-hidden="true" data-testid="line-glyphs" width="1" height="1">
          <g ref={glyphsRef} transform={`translate(${pageOrigin.x - box.left} ${pageOrigin.y - box.top}) scale(${scale} ${-scale})`}>
            {drawn.preview.glyphs.map((g, i) => (
              <path
                key={i}
                d={drawn.preview.paths[g.path]}
                fill={`rgb(${g.color.join(" ")})`}
                transform={`translate(${g.x} ${g.y}) rotate(${g.angle}) scale(${g.width / 1000} ${g.size / 1000})`}
              />
            ))}
          </g>
        </svg>
      )}
      {missing && (docked ? createPortal(hint, slot!) : hint)}
      <input
        ref={ownFile}
        type="file"
        accept={USER_FONT_ACCEPT}
        hidden
        data-testid="line-missing-own-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          choosing.current = false;
          el.current?.focus({ preventScroll: true });
          if (!f) return;
          void addUserFontFile(f).then(
            (out) => {
              if ("error" in out) return setOwnError(out.error);
              setOwnError("");
              ctl.retryable();
              setAdded((n) => n + 1);
            },
            () => setOwnError("That font couldn’t be read."),
          );
        }}
      />
    </div>
  );
}
