"use client";
/**
 * Existing text, line by line (the reserved E2 slot, shipped early from the beta): pointer, click a
 * line; keyboard, the page's line list is one tab stop (a listbox), arrows pick a line, Enter
 * edits it. The engine rewrites only that line (berry-engine). Lines are laid out in displayed
 * (rotated) page coordinates.
 *
 * The edit box draws the line in the PDF's own font (doc-face.ts), so opening and closing it
 * changes nothing on screen. A typed character that font lacks is underlined in place and named
 * under the box; the closest font draws it, and the notice after Enter offers another.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PageText } from "@/lib/editor/berry-engine";
import { displaySize, lineBox, quarterTurns, toScreen, type PageBox } from "@/lib/editor/geometry";
import { cx } from "@/components/ui/cx";
import { docFace } from "./doc-face";
import { LineEditBox } from "./LineEditBox";
import { dominantHex } from "@/lib/editor/markup";


/** How far above and below the box the hint can reach (CSS pixels). */
const HINT_ROOM = 36;

export function LineLayer({
  pageNumber,
  view,
  rotation,
  scale,
  text,
  editing,
  disabled,
  active: interactive,
  onEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  pageNumber: number;
  view: PageBox;
  rotation: number;
  scale: number;
  text: PageText;
  editing: { line: number; text: string } | null;
  disabled: boolean;
  /** Lines take clicks (Select and Edit text tools). */
  active: boolean;
  onEdit: (line: number, text: string) => void;
  onChange: (text: string) => void;
  /** `asked`: Enter was pressed (the box was not just left). */
  onCommit: (asked: boolean) => void;
  onCancel: () => void;
}) {
  const cancelled = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const [active, setActive] = useState(-1);
  // Lines that need the shaping build (Hindi, Arabic…) are listed too: picking one loads it.
  const editable = text.lines.map((l, i) => ((l.editable || l.read_only_reason === "needs-shaping") && l.text.trim() ? i : -1)).filter((i) => i >= 0);
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    if (active >= 0 && !editable.includes(active)) setActive(editable[0] ?? -1);
  }

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      list.current?.focus();
    }
  }, [editing]);

  const geometryOf = (i: number) => {
    const line = text.lines[i];
    const b = lineBox(line.bbox, line.angle, view, rotation, scale);
    const pad = Math.max(2, b.thickness * 0.15);
    return {
      left: b.cx - b.length / 2 - pad,
      top: b.cy - b.thickness / 2 - pad,
      width: b.length + pad * 2,
      height: b.thickness + pad * 2,
      transform: b.angle ? `rotate(${b.angle}deg)` : undefined,
    };
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !editable.length) return;
    const pos = editable.indexOf(active);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") setActive(editable[Math.min(editable.length - 1, pos + 1)]);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") setActive(editable[Math.max(0, pos - 1)]);
    else if (e.key === "Home") setActive(editable[0]);
    else if (e.key === "End") setActive(editable[editable.length - 1]);
    else if ((e.key === "Enter" || e.key === "F2") && active >= 0) {
      refocus.current = true;
      point.current = null;
      onEdit(active, text.lines[active].text);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const editLine = editing ? text.lines[editing.line] : undefined;
  /** Where the line being opened was clicked: the caret goes there. */
  const point = useRef<{ x: number; y: number } | null>(null);
  /** Makes a line's fonts ahead of the click (hover or touch), so the box opens in them at once. */
  const warm = (i: number) => {
    for (const f of new Set(text.lines[i]?.runs.map((r) => r.font))) {
      const info = text.fonts[f];
      if (info) void docFace(info, text.lines[i]!.runs.filter((r) => r.font === f).map((r) => r.text).join("")).catch(() => null);
    }
  };
  /** The paper under a line, read off the drawn page: the edit box takes its colour. */
  const paperOf = (i: number): string => {
    try {
      const canvas = list.current?.parentElement?.parentElement?.querySelector<HTMLCanvasElement>("canvas.ed-raster");
      const box = geometryOf(i);
      if (!canvas || !canvas.clientWidth) return "#ffffff";
      const k = canvas.width / canvas.clientWidth;
      const x = Math.max(0, Math.floor(box.left * k));
      const y = Math.max(0, Math.floor(box.top * k));
      const w = Math.min(canvas.width - x, Math.ceil(box.width * k));
      const h = Math.min(canvas.height - y, Math.ceil(box.height * k));
      if (w <= 0 || h <= 0) return "#ffffff";
      return dominantHex(canvas.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, w, h).data);
    } catch {
      return "#ffffff";
    }
  };
  const editBox = () => {
    const line = editLine!;
    const box = geometryOf(editing!.line);
    const b = lineBox(line.bbox, line.angle, view, rotation, scale);
    // On the line's own baseline and start, so the box opens exactly over the text on the page
    // (left-to-right lines on an upright page; others keep the centred text).
    let start: { x: number; y: number } | null = null;
    if (!box.transform && line.direction !== "rtl" && quarterTurns(rotation) === 0) {
      const [x, y] = toScreen(line.origin[0], line.origin[1], view, rotation, scale);
      start = { x, y };
    }
    // The paper drawn under the box stops at the neighbouring lines' own text, and the hint goes
    // where it hides none of it: under the box when that is clear, else over it.
    let paperTop = 0;
    let paperBottom = 0;
    /** Where the other lines' text is drawn (its ink, not its taller line box): the hint keeps off it. */
    const around: { left: number; right: number; top: number; bottom: number }[] = [];
    if (!box.transform) {
      const mid = box.top + box.height / 2;
      text.lines.forEach((other, k) => {
        if (k === editing!.line || !other.text.trim()) return;
        const o = lineBox(other.bbox, other.angle, view, rotation, scale);
        if (o.angle || o.cx + o.length / 2 < box.left || o.cx - o.length / 2 > box.left + box.width) return;
        const top = o.cy - o.thickness / 2;
        const bottom = o.cy + o.thickness / 2;
        // Text whose own middle is inside this row is part of it (a raised footnote mark, a
        // subscript): the ring goes around the row, never through its letters to spare the mark.
        if (o.cy > box.top + box.height * 0.2 && o.cy < box.top + box.height * 0.8) return;
        if (o.cy > mid) paperBottom = Math.max(paperBottom, Math.min(box.top + box.height - top, box.height / 2 - 1));
        else if (o.cy < mid) paperTop = Math.max(paperTop, Math.min(bottom - box.top, box.height / 2 - 1));
      });
      text.lines.forEach((other, k) => {
        if (k === editing!.line || !other.text.trim()) return;
        const o = lineBox(other.bbox, other.angle, view, rotation, scale);
        if (o.angle || Math.abs(o.cy - (box.top + box.height / 2)) > box.height / 2 + HINT_ROOM + o.thickness) return;
        // From the top of a capital to a little under the baseline (the line's own baseline: its
        // box can be much taller than its text when one glyph comes from a taller font).
        const em = other.size * scale;
        const base = quarterTurns(rotation) === 0 ? toScreen(other.origin[0], other.origin[1], view, rotation, scale)[1] : o.cy + em * 0.25;
        around.push({ left: o.cx - o.length / 2, right: o.cx + o.length / 2, top: base - em * 0.75, bottom: base + em * 0.25 });
      });
    }
    // The page's user-space origin on an upright page: the edit box draws engine glyphs from it.
    let pageOrigin: { x: number; y: number } | null = null;
    if (quarterTurns(rotation) === 0) {
      const [x, y] = toScreen(0, 0, view, rotation, scale);
      pageOrigin = { x, y };
    }
    return { box, start, pageOrigin, length: b.length, maxWidth: displaySize(view, rotation, scale).width - box.left - 2, paperInset: { top: Math.max(0, paperTop), bottom: Math.max(0, paperBottom) }, around };
  };

  return (
    <div className={cx("absolute inset-0", !interactive && "pointer-events-none")}>
      <div
        ref={list}
        role="listbox"
        tabIndex={interactive ? 0 : -1}
        aria-label={`Text on page ${pageNumber}`}
        // The line being edited is out of the list while its box is open: it can't be pointed at.
        aria-activedescendant={active >= 0 && editing?.line !== active ? `ed-p${pageNumber - 1}-l${active}` : undefined}
        aria-disabled={disabled || undefined}
        className="ed-lines absolute inset-0 rounded-[2px]"
        onKeyDown={onListKey}
        onFocus={() => active < 0 && editable.length && setActive(editable[0])}
      >
        {editable.map((i) => {
          const line = text.lines[i];
          if (editing?.line === i) return null;
          return (
            <div
              key={i}
              id={`ed-p${pageNumber - 1}-l${i}`}
              role="option"
              aria-selected={active === i}
              data-testid="line"
              data-text={line.text}
              data-needs-shaping={line.read_only_reason === "needs-shaping" || undefined}
              className={cx("ed-line absolute cursor-text rounded-[3px]", active === i && "ed-line--active", disabled && "ed-line--busy")}
              style={geometryOf(i)}
              onPointerEnter={() => interactive && !disabled && warm(i)}
              onPointerDown={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                if (!disabled) warm(i);
              }}
              onClick={(e) => {
                if (disabled || !interactive) return;
                // A real click puts the caret where it landed; the keyboard opens at the end.
                point.current = e.detail > 0 ? { x: e.clientX, y: e.clientY } : null;
                setActive(i);
                onEdit(i, line.text);
              }}
            >
              <span className="sr-only">{line.text}</span>
            </div>
          );
        })}
      </div>
      {editing && editLine && (
        <LineEditBox
          key={`${editing.line}`}
          text={text}
          line={editLine}
          value={editing.text}
          scale={scale}
          {...editBox()}
          point={point.current}
          paper={() => paperOf(editing.line)}
          onChange={onChange}
          onCommit={(asked) => {
            // An edit opened again by the editor (it couldn't be saved) has no click to go to.
            point.current = null;
            if (cancelled.current) {
              cancelled.current = false;
              onCancel();
            } else onCommit(asked);
          }}
          onCancel={() => {
            cancelled.current = true;
          }}
        />
      )}
    </div>
  );
}
