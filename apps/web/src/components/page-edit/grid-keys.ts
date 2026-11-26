import { useEffect, useState } from "react";
/** Roving-focus helpers shared by the Merge grids (F1 U-7 keys). */

export function gridColumns(list: HTMLElement | null): number {
  if (!list) return 1;
  return Math.max(1, getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length);
}

/** Focus target for an arrow / Home / End / Page key, or null when the key is not a navigation key. */
export function navTarget(key: string, cur: number, count: number, cols: number): number | null {
  let next: number;
  switch (key) {
    case "ArrowRight": next = cur + 1; break;
    case "ArrowLeft": next = cur - 1; break;
    case "ArrowDown": next = cur + cols; break;
    case "ArrowUp": next = cur - cols; break;
    case "Home": next = 0; break;
    case "End": next = count - 1; break;
    case "PageDown": next = cur + cols * 3; break;
    case "PageUp": next = cur - cols * 3; break;
    default: return null;
  }
  return Math.max(0, Math.min(count - 1, next));
}

/** Alt+Arrow / Alt+Home / Alt+End move steps (spec F3 M-8): by list position, not by row. */
export function moveStepFor(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): "earlier" | "later" | "first" | "last" | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowLeft":
    case "ArrowUp":
      return "earlier";
    case "ArrowRight":
    case "ArrowDown":
      return "later";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** Starts loading the drag module (idle after the first ready state, or on the first pointerdown). */
let dragModule: Promise<typeof import("./drag")> | null = null;
export function loadDrag() {
  dragModule ??= import("./drag");
  dragModule.catch(() => (dragModule = null));
  return dragModule;
}

/**
 * The drag module for a press that began with `down`, or null when that press already ended (or was
 * cancelled) before the module arrived: a quick click must never turn into a drag that the next
 * mouse move would lift and the next click would drop.
 */
export function loadDragFor(down: PointerEvent): Promise<typeof import("./drag") | null> {
  let released = false;
  const end = (e: PointerEvent) => {
    if (e.pointerId === down.pointerId) released = true;
  };
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  const stop = () => {
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
  };
  return loadDrag().then(
    (m) => {
      stop();
      return released ? null : m;
    },
    (err) => {
      stop();
      throw err;
    },
  );
}

/** Warms the drag module once a grid is on screen (on idle). */
export function useWarmDrag() {
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const t = idle ? idle(() => void loadDrag()) : setTimeout(() => void loadDrag(), 1000);
    return () => {
      if (!idle) clearTimeout(t as ReturnType<typeof setTimeout>);
    };
  }, []);
}

/** False for the grid's first 700 ms (while its tiles rise in, staggered), then true. */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 700);
    return () => clearTimeout(t);
  }, []);
  return settled;
}
