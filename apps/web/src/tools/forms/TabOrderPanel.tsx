"use client";
/** Tab order panel (U-F6, AC-239, AC-251): sort buttons and a draggable list per page. */
import { memo, useState, type KeyboardEvent } from "react";
import type { FormPage, FormState } from "@/lib/forms/types";
import { pageOrder } from "@/lib/forms/taborder";
import "./forms.css";

export type TabOrderPanelProps = {
  form: FormState;
  pages: FormPage[];
  onRows: () => void;
  onColumns: () => void;
  onOriginal: () => void;
  /** Moves a widget to position `to` on its page. */
  onMove: (widgetId: string, to: number) => void;
  onFocusWidget?: (widgetId: string) => void;
};

export const TabOrderPanel = memo(function TabOrderPanel({ form, pages, onRows, onColumns, onOriginal, onMove, onFocusWidget }: TabOrderPanelProps) {
  const [held, setHeld] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const nameOf = new Map(form.fields.flatMap((f) => f.widgets.map((w) => [w.id, { name: f.name, kind: f.kind, on: w.on }] as const)));
  let n = 0;
  return (
    <div className="bf-taborder">
      <div className="bf-sortbar" role="group" aria-label="Sort fields">
        <button type="button" aria-pressed={form.orderMode === "rows"} onClick={onRows}>Rows</button>
        <button type="button" aria-pressed={form.orderMode === "columns"} onClick={onColumns}>Columns</button>
        <button type="button" aria-pressed={form.orderMode === "original"} onClick={onOriginal}>Original</button>
      </div>
      {pages.map((p, pi) => {
        const ids = pageOrder(form, p.id);
        if (!ids.length) return null;
        return (
          <section key={p.id} className="bf-tabpage" aria-label={`Page ${pi + 1}`}>
            <h3>Page {pi + 1}</h3>
            <ol>
              {ids.map((id, i) => {
                const info = nameOf.get(id)!;
                n++;
                const onKey = (e: KeyboardEvent) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    setHeld(held === id ? null : id);
                  } else if (held === id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                    e.preventDefault();
                    onMove(id, Math.max(0, i + (e.key === "ArrowUp" ? -1 : 1)));
                  } else if (e.key === "Escape") setHeld(null);
                };
                return (
                  <li
                    key={id}
                    className="bf-chip"
                    data-held={held === id || undefined}
                    data-dragging={drag === id || undefined}
                    tabIndex={0}
                    draggable
                    aria-label={`${n}. ${info.name}${info.on ? ` (${info.on})` : ""}, ${info.kind}${held === id ? ", picked up: use arrow keys, Space to drop" : ""}`}
                    onKeyDown={onKey}
                    onFocus={() => onFocusWidget?.(id)}
                    onDragStart={(e) => {
                      setDrag(id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => drag && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag && drag !== id) onMove(drag, i);
                      setDrag(null);
                    }}
                  >
                    <span className="bf-chip-n">{n}</span>
                    <span className="bf-chip-name">{info.name}{info.on ? ` · ${info.on}` : ""}</span>
                    <span className="bf-chip-kind">{info.kind}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
});
