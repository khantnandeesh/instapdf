"use client";
import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { clampArea, type Area } from "@/lib/pdf/area";
import { cx } from "../ui/cx";
import "./area-select.css";

type Drag = {
  mode: "draw" | "move" | "size";
  x: number;
  y: number;
  from: Area;
};

/** Arrow keys move the box by this share of the page; with Shift they resize it. */
const STEP = 0.01;

/**
 * One rectangle on a page, in fractions of the page. Drag on the page to draw it, drag the box to
 * move it, drag its corner dot to resize it. With the keyboard: arrow keys move the box, Shift with
 * arrow keys resizes it. `children` is the page picture; the box is drawn over it.
 */
export function AreaSelect({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: Area;
  onChange: (area: Area) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const at = (e: PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  };
  const start = (mode: Drag["mode"]) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    host.current!.setPointerCapture(e.pointerId);
    drag.current = { mode, ...at(e), from: value };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (d.mode === "move")
      onChange(clampArea({ ...d.from, x: d.from.x + dx, y: d.from.y + dy }));
    else if (d.mode === "size")
      onChange(
        clampArea({
          ...d.from,
          w: Math.min(1 - d.from.x, d.from.w + dx),
          h: Math.min(1 - d.from.y, d.from.h + dy),
        }),
      );
    else {
      // A new box from the press point to the pointer, whichever way it is dragged; a bare click draws none.
      const x0 = Math.min(1, Math.max(0, Math.min(d.x, p.x)));
      const y0 = Math.min(1, Math.max(0, Math.min(d.y, p.y)));
      const x1 = Math.min(1, Math.max(0, Math.max(d.x, p.x)));
      const y1 = Math.min(1, Math.max(0, Math.max(d.y, p.y)));
      if (x1 - x0 > 0.01 && y1 - y0 > 0.01)
        onChange(clampArea({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
    }
  };
  const end = () => {
    drag.current = null;
  };
  const key = (e: KeyboardEvent) => {
    const dir = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (!dir) return;
    e.preventDefault();
    const [dx, dy] = dir.map((n) => n * STEP);
    onChange(
      clampArea(
        e.shiftKey
          ? {
              ...value,
              w: Math.min(1 - value.x, value.w + dx),
              h: Math.min(1 - value.y, value.h + dy),
            }
          : { ...value, x: value.x + dx, y: value.y + dy },
      ),
    );
  };
  const pct = (n: number) => `${n * 100}%`;

  return (
    <div
      ref={host}
      className={cx("ip-area", className)}
      onPointerDown={start("draw")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      data-testid="area-select"
    >
      {children}
      <div
        role="group"
        tabIndex={0}
        aria-label={label}
        className="ip-area__box"
        style={{
          left: pct(value.x),
          top: pct(value.y),
          width: pct(value.w),
          height: pct(value.h),
        }}
        onPointerDown={start("move")}
        onKeyDown={key}
        data-testid="area-box"
      >
        <span
          aria-hidden="true"
          className="ip-area__grip"
          onPointerDown={start("size")}
        />
      </div>
    </div>
  );
}
