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
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { FontInfo, PageText } from "@/lib/editor/berry-engine";
import { cssFamily, faceOf, fileFor } from "@/lib/editor/fonts";
import { ensureFace, knownManifest, resolveFonts } from "@/lib/editor/fonts-browser";
import { foldName } from "@/lib/font-library/client";
import { cx } from "@/components/ui/cx";
import { useCtl } from "./context";
import { docFace, type DocFace } from "./doc-face";
import { chosenStandIn, fontLabel, standInCandidates } from "./font-service";

type Line = PageText["lines"][number];
export type EditBoxGeometry = { left: number; top: number; width: number; height: number; transform?: string };

const MARK = "ed-miss";
/** Fonts offered for the characters a document font lacks. */
const CHOICES = 3;
/** Room the hint is given on the page (its CSS max-width). */
const HINT_WIDTH = 300;

const generic = (font: FontInfo | undefined) => (font?.monospace ? "ui-monospace, Menlo, Consolas, monospace" : font?.serif ? "'Times New Roman', Times, serif" : "Arial, Helvetica, sans-serif");
/** The key a person's stand-in choice is kept under: the same name the controller asks the engine's request by. */
const familyKey = (font: FontInfo) => foldName(font.family || font.name);
const cleaned = (s: string | null) => (s ?? "").replace(/[\r\n]+/g, " ");

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
        if (!face.asked.has(cp)) out.unasked.set(font, (out.unasked.get(font) ?? "") + ch);
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
  hintBelow,
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
  /** The hint goes under the box (false: over it, because text is right under). */
  hintBelow: boolean;
  /** Where the line was clicked (viewport pixels): the caret goes there. */
  point: { x: number; y: number } | null;
  /** The page's colour under the line. */
  paper: () => string;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ctl = useCtl();
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
  const [fit, setFit] = useState<CSSProperties | null>(null);
  /** Where the first missing character stands in the box: the hint starts there. */
  const [missAt, setMissAt] = useState(0);
  /** What the browser's own rounding puts between the baseline asked for and the one drawn, at this size. */
  const [nudge, setNudge] = useState<{ key: string; px: number } | null>(null);
  const turned = !!box.transform;
  const boxTop = box.top;
  const settled = fontIds.every((i) => i in faces);
  // Shown in the document's fonts only; a font that never arrives gives way after a long wait.
  const ready = settled || waited;
  const standInRef = useRef(standIn);
  standInRef.current = standIn;
  const facesRef = useRef(faces);
  facesRef.current = faces;

  const caretTodo = useRef(false);
  const placeCaret = () => {
    const caret = point && !touched.current && el.current ? caretAt(el.current, point.x, point.y) : null;
    if (!caret) return;
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
  };

  const rescan = () => {
    const box = el.current;
    if (!box) return;
    const found = scan(box, facesRef.current, first);
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
    const whole = value === line.text;
    const runs = whole ? line.runs : line.runs.slice(0, 1);
    runs.forEach((run, k) => {
      const span = document.createElement("span");
      span.dataset.font = String(run.font);
      span.dataset.size = String(run.size);
      span.dataset.color = run.color.join(" ");
      span.textContent = whole ? line.text.slice(k === 0 ? 0 : run.start, k === runs.length - 1 ? line.text.length : runs[k + 1]!.start) : value;
      box.append(span);
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
    return () => {
      box.removeEventListener("beforeinput", guard);
      mark([]);
    };
    // Written once per opened line (the box is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
      if (!turned && value === line.text && length > 0) {
        const all = document.createRange();
        all.selectNodeContents(box);
        const diff = length - all.getBoundingClientRect().width;
        const spaces = (line.text.trim().match(/ /g) ?? []).length;
        const letters = [...line.text].length;
        fitted = Math.abs(diff) > 0.5 && Math.abs(diff) < length * 0.2 && (spaces > 0 || letters > 1);
        if (fitted) setFit(spaces ? { wordSpacing: diff / spaces } : letters > 1 ? { letterSpacing: diff / letters } : null);
      }
      // The caret goes where the click landed, once the text is at its final length.
      if (fitted) caretTodo.current = true;
      else placeCaret();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, standIn, scale, ready, settled]);

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
      await resolveFonts(ids).catch(() => undefined);
      const m = knownManifest();
      // Those that have the most of the missing characters first; closeness decides between equals.
      const has = (id: string) => {
        const face = m?.faces[id] && faceOf(m, id, info.bold, info.italic);
        return face ? missing.chars.filter((c) => fileFor(face, c.codePointAt(0)!)).length : 0;
      };
      const able = ids
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
      if (picked && chosenStandIn(familyKey(info)) !== picked) await ctl.pickStandIn(familyKey(info), picked);
      if (alive) setStandIn({ font: missing.font, chars, ids: able, picked });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lacking]);

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
          // The paper covers the line's own band only: never a neighbouring line's text.
          backgroundImage: `linear-gradient(${paperColor ?? "#ffffff"}, ${paperColor ?? "#ffffff"})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `0 ${paperInset.top}px`,
          backgroundSize: `100% ${Math.max(0, box.height - paperInset.top - paperInset.bottom)}px`,
        }
      : null),
    ...fit,
  };
  const settling = !ready || paperColor === null;
  const hintId = `ed-miss-${line.id}`;
  const shown = standIn && missing && standIn.font === missing.font ? standIn : null;

  return (
    <div
      className="absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, transform: box.transform }}
      // Leaving the box and its hint ends the edit; moving between them (Tab to a font) does not.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit();
      }}
      onKeyDown={(e) => {
        if (e.target === el.current) return;
        // Keys on the hint's buttons are theirs alone (no editor shortcuts); Escape still cancels.
        e.stopPropagation();
        if (e.key !== "Escape") return;
        onCancel();
        (e.target as HTMLElement).blur();
      }}
    >
      {/* Always here, so a screen reader hears the change when a character turns out to be missing. */}
      <span role="status" className="sr-only" data-testid="line-missing-status">
        {missing ? `Not in this font: ${missing.chars.join(" ")}.${shown?.picked ? ` ${fontLabel(shown.picked)} draws ${missing.chars.length > 1 ? "them" : "it"}.` : ""}` : ""}
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
        className={cx("ed-input absolute left-0 top-0 rounded-[4px] outline-2 outline-brand", settling && "ed-input--settling")}
        style={type}
        onInput={(e) => {
          touched.current = true;
          onChange(cleaned(e.currentTarget.textContent));
          rescan();
        }}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, cleaned(e.clipboardData.getData("text/plain")));
        }}
        onDrop={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          // Enter that finishes a composition (an input method) is not the end of the edit.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            e.currentTarget.blur();
          }
        }}
      />
      {missing && (
        <div
          id={hintId}
          className={cx("ed-input__hint", !hintBelow && "ed-input__hint--over")}
          // Starts at the missing character, and stays inside the page.
          style={{ left: Math.max(4 - box.left, Math.min(missAt - 10, maxWidth - HINT_WIDTH)) }}
          data-testid="line-missing"
          data-side={hintBelow ? "under" : "over"}
        >
          <span>
            Not in this font: <span className="ed-input__chars">{missing.chars.slice(0, 8).join(" ")}</span>
          </span>
          {shown && shown.ids.length > 0 && (
            <span role="group" aria-label="Font for these characters" className="ed-input__picks">
              {shown.ids.map((id) => (
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
        </div>
      )}
    </div>
  );
}
