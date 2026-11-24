"use client";
/**
 * Existing text, line by line (the reserved E2 slot, shipped early from the beta): pointer, click a
 * line; keyboard, the page's line list is one tab stop (a listbox), arrows pick a line, Enter
 * edits it. The engine rewrites only that line (berry-engine). Lines are laid out in displayed
 * (rotated) page coordinates.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PageText } from "@/lib/editor/berry-engine";
import { displaySize, lineBox, type PageBox } from "@/lib/editor/geometry";
import { cx } from "@/components/ui/cx";

type Line = PageText["lines"][number];

function fontFamilyOf(text: PageText, line: Line): string {
  const font = text.fonts[line.runs[0]?.font ?? -1];
  if (font?.monospace) return "ui-monospace, Menlo, Consolas, monospace";
  if (font?.serif) return "'Times New Roman', Times, serif";
  return "Arial, Helvetica, sans-serif";
}

let measureCtx: CanvasRenderingContext2D | null = null;

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
  onCommit: () => void;
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
      onEdit(active, text.lines[active].text);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const editLine = editing ? text.lines[editing.line] : undefined;

  const inputStyle = () => {
    const line = editLine!;
    const box = geometryOf(editing!.line);
    const fontSize = line.size * scale;
    const fontFamily = fontFamilyOf(text, line);
    const font = text.fonts[line.runs[0]?.font ?? -1];
    measureCtx ??= document.createElement("canvas").getContext("2d");
    let width = box.width;
    if (measureCtx && !box.transform) {
      measureCtx.font = `${font?.italic ? "italic " : ""}${font?.bold ? "700 " : ""}${fontSize}px ${fontFamily}`;
      width = Math.max(width, measureCtx.measureText(editing!.text).width + 12, 120);
      width = Math.max(box.width, Math.min(width, displaySize(view, rotation, scale).width - box.left - 2));
    }
    return { ...box, width, fontSize, fontFamily, fontWeight: font?.bold ? 700 : 400, fontStyle: font?.italic ? "italic" : "normal", lineHeight: 1 };
  };

  return (
    <div className={cx("absolute inset-0", !interactive && "pointer-events-none")}>
      <div
        ref={list}
        role="listbox"
        tabIndex={interactive ? 0 : -1}
        aria-label={`Text on page ${pageNumber}`}
        aria-activedescendant={active >= 0 ? `ed-p${pageNumber - 1}-l${active}` : undefined}
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
              onPointerDown={(e) => interactive && e.stopPropagation()}
              onClick={() => {
                if (disabled || !interactive) return;
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
        <input
          key={`${editing.line}`}
          autoFocus
          aria-label={`Edit line: ${editLine.text}`}
          data-testid="line-input"
          className="ed-input absolute rounded-[4px] border-0 bg-white px-[2px] text-ink-black outline-2 outline-brand"
          style={inputStyle()}
          value={editing.text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (cancelled.current) {
              cancelled.current = false;
              onCancel();
            } else onCommit();
          }}
        />
      )}
    </div>
  );
}
