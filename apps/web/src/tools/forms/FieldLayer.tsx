"use client";
/**
 * Form fields on one page of the editor canvas (U-F1, U-F3, U-F5, U-F6). Presentational: the shell
 * passes the page's fields and proposals and gets callbacks. Laid out in the page's unrotated
 * frame (points × scale) inside the editor overlay, which turns as a whole with the page; each
 * field's content is turned back by `turn` so it reads upright, as `MK /R` does in the output.
 *
 * Nothing drawn here is saved: shading, outlines, name tags and badges are editor-only (AC-252).
 */
import { memo, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { FormField, Proposal, Widget } from "@/lib/forms/types";
import "./forms.css";

export type FieldLayerProps = {
  pageId: string;
  /** Pixels per point. */
  scale: number;
  /** The page's total clockwise turn (0, 90, 180, 270). */
  turn: number;
  fields: FormField[];
  /** "fill": fields take input; "edit": the Form tool is active (outlines, names, select on click). */
  mode: "fill" | "edit";
  selected?: string | null;
  proposals?: Proposal[];
  /** Tab order panel open: widget id → number shown on the field. */
  badges?: Map<string, number> | null;
  onValue?: (fieldId: string, value: string | string[]) => void;
  onSelect?: (widgetId: string) => void;
  onSign?: (fieldId: string, widgetId: string) => void;
  onAccept?: (proposal: Proposal) => void;
  onReject?: (proposal: Proposal) => void;
  onBadgeClick?: (widgetId: string) => void;
  /** Edit mode: a widget was dragged (moved or resized) to this frame box. */
  onBox?: (widgetId: string, box: { x: number; y: number; w: number; h: number }) => void;
  /** The page size in points (moves and resizes stay on the page). */
  page?: { w: number; h: number };
};

const box = (w: Widget, scale: number): CSSProperties => ({ left: w.x * scale, top: w.y * scale, width: w.w * scale, height: w.h * scale });

/** Turns a field's content back upright inside its frame box. */
function inner(w: Widget, scale: number, turn: number): CSSProperties {
  const W = w.w * scale;
  const H = w.h * scale;
  const side = turn === 90 || turn === 270;
  return {
    width: side ? H : W,
    height: side ? W : H,
    transform: turn ? `translate(-50%, -50%) rotate(${-turn}deg)` : undefined,
    left: turn ? "50%" : 0,
    top: turn ? "50%" : 0,
  };
}

/** Font size in CSS px: the field's own, or auto (fits the box height, 12 pt at most). */
function fontPx(f: FormField, w: Widget, scale: number, turn: number) {
  const h = turn === 90 || turn === 270 ? w.w : w.h;
  const pt = f.style.fontSize || (f.multiline ? 10 : Math.max(6, Math.min(12, h * 0.62)));
  return pt * scale;
}

export const FieldLayer = memo(function FieldLayer(p: FieldLayerProps) {
  const { scale, turn, mode } = p;
  const mine = p.fields.flatMap((f) => f.widgets.filter((w) => w.page === p.pageId && !w.hidden).map((w) => ({ f, w })));
  const props = (p.proposals ?? []).flatMap((pr) => pr.field.widgets.filter((w) => w.page === p.pageId).map((w) => ({ pr, w })));

  return (
    <div className="bf-layer" data-mode={mode}>
      {mine.map(({ f, w }) => (
        <div
          key={w.id}
          className="bf-field"
          data-kind={f.kind}
          data-selected={p.selected === w.id || undefined}
          data-required={f.required || undefined}
          data-w={w.id}
          style={box(w, scale)}
          onPointerDown={mode === "edit" ? (e) => dragWidget(e, w, p) : undefined}
        >
          {/* Edit mode shows the value too, inert: the field itself takes the clicks and drags. */}
          <div className="bf-inner" style={inner(w, scale, turn)} inert={mode === "edit" || undefined}>
            <Control f={f} w={w} fontPx={fontPx(f, w, scale, turn)} widthPx={(turn === 90 || turn === 270 ? w.h : w.w) * scale} {...p} />
            {mode === "edit" && <span className="bf-tag">{f.name}</span>}
          </div>
          {f.required && <span className="bf-req" title="Required" aria-hidden />}
          {mode === "edit" && p.selected === w.id && <span className="bf-resize" data-resize aria-hidden />}
          {p.badges?.has(w.id) && (
            <button type="button" className="bf-badge" onClick={() => p.onBadgeClick?.(w.id)} aria-label={`${f.name}: tab position ${p.badges.get(w.id)}`}>
              {p.badges.get(w.id)}
            </button>
          )}
        </div>
      ))}
      {props.map(({ pr, w }, i) => (
        <div
          key={w.id}
          className="bf-proposal"
          data-w={w.id}
          style={{ ...box(w, scale), animationDelay: `${Math.min(i, 12) * 20}ms` }}
          tabIndex={0}
          role="group"
          aria-label={`Proposed ${pr.field.kind} field ${pr.field.name}`}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") p.onAccept?.(pr);
            else if (e.key === "Delete" || e.key === "Backspace") p.onReject?.(pr);
          }}
        >
          <span className="bf-pchips">
            <button type="button" className="bf-pchip bf-pchip--yes" onClick={() => p.onAccept?.(pr)} aria-label={`Add ${pr.field.name}`}>
              <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" /></svg>
            </button>
            <button type="button" className="bf-pchip" onClick={() => p.onReject?.(pr)} aria-label={`Skip ${pr.field.name}`}>
              <svg viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );
});

const MIN_SIDE = 6;

/**
 * Edit mode: drag a field to move it, or its corner to resize it. The element follows the pointer
 * directly (no re-render per move); one change is committed on release. A click only selects.
 */
function dragWidget(e: ReactPointerEvent<HTMLDivElement>, w: Widget, p: FieldLayerProps) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  e.stopPropagation();
  p.onSelect?.(w.id);
  const el = e.currentTarget;
  const resize = !!(e.target as HTMLElement).closest("[data-resize]");
  const { scale } = p;
  const page = p.page ?? { w: Infinity, h: Infinity };
  // The overlay turns with the page: pointer deltas are read in its own (unturned) frame.
  const t = ((p.turn % 360) + 360) % 360;
  const toFrame = (dx: number, dy: number): [number, number] => (t === 90 ? [dy, -dx] : t === 180 ? [-dx, -dy] : t === 270 ? [-dy, dx] : [dx, dy]);
  const x0 = e.clientX;
  const y0 = e.clientY;
  let next = { x: w.x, y: w.y, w: w.w, h: w.h };
  let moved = false;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const [dx, dy] = toFrame((ev.clientX - x0) / scale, (ev.clientY - y0) / scale);
    if (!moved && Math.hypot(dx, dy) * scale < 3) return;
    moved = true;
    if (resize) next = { x: w.x, y: w.y, w: Math.max(MIN_SIDE, Math.min(page.w - w.x, w.w + dx)), h: Math.max(MIN_SIDE, Math.min(page.h - w.y, w.h + dy)) };
    else next = { ...next, x: Math.max(0, Math.min(page.w - w.w, w.x + dx)), y: Math.max(0, Math.min(page.h - w.h, w.y + dy)) };
    Object.assign(el.style, { left: `${next.x * scale}px`, top: `${next.y * scale}px`, width: `${next.w * scale}px`, height: `${next.h * scale}px` });
  };
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    if (moved) p.onBox?.(w.id, next);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

/** The fill control for one widget (U-F1). */
function Control({ f, w, fontPx, widthPx, onValue, onSign, mode }: { f: FormField; w: Widget; fontPx: number; widthPx: number } & FieldLayerProps) {
  const style: CSSProperties = { fontSize: fontPx, textAlign: f.style.align, color: f.style.color };
  const label = f.tooltip || f.name;
  // With the Form tool, an empty field shows its name inside it, clear of the page's own text (U-F2).
  const named = mode === "edit" ? f.name : undefined;
  switch (f.kind) {
    case "text":
      return f.multiline ? (
        <textarea className="bf-input" style={style} value={String(f.value)} placeholder={named} readOnly={f.readOnly} maxLength={f.maxLen ?? undefined} aria-label={label} aria-required={f.required} onChange={(e) => onValue?.(f.id, e.target.value)} />
      ) : (
        <input
          className="bf-input"
          data-comb={f.comb && f.maxLen ? f.maxLen : undefined}
          style={f.comb && f.maxLen ? combStyle(style, widthPx / f.maxLen, fontPx) : style}
          value={String(f.value)}
          placeholder={f.comb ? undefined : named}
          readOnly={f.readOnly}
          maxLength={f.maxLen ?? undefined}
          aria-label={label}
          aria-required={f.required}
          onChange={(e) => onValue?.(f.id, e.target.value)}
        />
      );
    case "checkbox":
      // The label fills the box (and reaches past it on touch screens), so small boxes are easy to hit.
      return (
        <label className="bf-hit">
          <input type="checkbox" className="bf-check" checked={!!f.value} disabled={f.readOnly} aria-label={label} onChange={(e) => onValue?.(f.id, e.target.checked ? (w.on ?? "Yes") : "")} />
        </label>
      );
    case "radio":
      return (
        <label className="bf-hit">
          <input type="radio" className="bf-check" name={`bf-${f.id}`} checked={f.value === w.on} disabled={f.readOnly} aria-label={`${label}: ${w.on}`} onChange={() => onValue?.(f.id, w.on ?? "")} />
        </label>
      );
    case "dropdown":
      // An editable dropdown (Edit flag) takes typed text as well as its options (G-23).
      if (f.editable)
        return (
          <>
            <input className="bf-input" style={style} list={`bf-opts-${w.id}`} value={String(f.value)} placeholder={named} readOnly={f.readOnly} aria-label={label} aria-required={f.required} onChange={(e) => onValue?.(f.id, e.target.value)} />
            <datalist id={`bf-opts-${w.id}`}>
              {f.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>
        );
      return (
        <select className="bf-input" style={style} value={String(f.value)} disabled={f.readOnly} aria-label={label} onChange={(e) => onValue?.(f.id, e.target.value)}>
          <option value="">{named}</option>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "list":
      return (
        <select className="bf-input bf-list" style={style} multiple={f.multiSelect} size={Math.max(2, f.options.length)} value={f.multiSelect ? (f.value as string[]) : (f.value as string[])[0] ?? ""} disabled={f.readOnly} aria-label={label} onChange={(e) => onValue?.(f.id, [...e.target.selectedOptions].map((o) => o.value))}>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "signature":
      return (
        // A field from the file with its own look ("Sign here") already shows on the page image.
        <button type="button" className="bf-sign" data-drawn={w.drawn || undefined} onClick={() => onSign?.(f.id, w.id)} aria-label={`Sign: ${label}`}>
          {!w.drawn && "Sign"}
        </button>
      );
    default:
      return null;
  }
}

/** Comb: one character per box. Cousine advances 0.6 em, so the gap tops each box up to its width. */
function combStyle(style: CSSProperties, cell: number, fontPx: number): CSSProperties {
  const gap = Math.max(0, cell - fontPx * 0.6);
  return { ...style, textAlign: "left", letterSpacing: gap, paddingLeft: gap / 2, paddingRight: 0, backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${cell - 1}px, color-mix(in srgb, var(--blueberry) 30%, transparent) ${cell - 1}px ${cell}px)` };
}
