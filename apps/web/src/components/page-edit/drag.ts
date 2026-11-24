/**
 * Pointer drag for the Merge grids (spec F3 M-7). In-house, Pointer Events
 * only, loaded lazily. Mouse/pen: lift after 4 px of movement. Touch: press
 * and hold 350 ms without moving more than 8 px, otherwise it is a scroll.
 * While lifted, a ghost follows the pointer (transform only), the grid does
 * not reflow, and a slot bar marks the target gap. Escape, pointercancel,
 * window blur or a drop outside the grid cancel.
 */

export type DragOptions = {
  event: PointerEvent;
  /** The dragged box (copied for the ghost). */
  source: HTMLElement;
  /** The grid; drops outside it cancel. */
  container: HTMLElement;
  /** Boxes of every item in list order (the gap is computed against them). */
  boxes: () => HTMLElement[];
  /** How many items move (badge on the ghost when > 1). */
  count: number;
  onLift: () => void;
  onDrop: (gap: number) => void;
  onCancel: () => void;
};

const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
const HOLD_MS = 350;
const EDGE = 64;
const MAX_SPEED = 16;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function makeGhost(source: HTMLElement, count: number): HTMLElement {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  // Canvases clone blank: copy their pixels.
  const from = source.querySelectorAll("canvas");
  ghost.querySelectorAll("canvas").forEach((c, i) => {
    const src = from[i];
    if (!src) return;
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")?.drawImage(src, 0, 0);
  });
  ghost.querySelectorAll("button, [tabindex]").forEach((el) => el.setAttribute("tabindex", "-1"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("rounded-lg", "shadow-lg", "bg-surface-raised");
  ghost.removeAttribute("data-testid");
  ghost.querySelectorAll("[data-testid]").forEach((el) => el.removeAttribute("data-testid"));
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: cssVar("--ip-z-drag") || "35",
    pointerEvents: "none",
    cursor: "grabbing",
    transformOrigin: "center",
    transition: "transform var(--dur-fast) ease-out",
  } satisfies Partial<CSSStyleDeclaration>);
  if (count > 1) {
    const badge = document.createElement("span");
    badge.textContent = String(count);
    badge.className = "absolute -top-2 -right-2 h-6 min-w-6 rounded-full bg-primary px-1.5 text-center text-xs leading-6 font-semibold text-on-primary";
    ghost.appendChild(badge);
  }
  document.body.appendChild(ghost);
  return ghost;
}

function makeSlotBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.setAttribute("aria-hidden", "true");
  bar.dataset.testid = "slot-bar";
  // forced-colors:bg-[Highlight]: a background alone vanishes in High Contrast.
  bar.className = "rounded-full bg-primary forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none";
  Object.assign(bar.style, {
    position: "fixed",
    width: cssVar("--ip-slot-bar") || "3px",
    zIndex: cssVar("--ip-z-drag") || "35",
    pointerEvents: "none",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(bar);
  return bar;
}

/** Gap (0..n) nearest the pointer: the hovered box's left half = before it, right half = after it. */
export function gapAt(boxes: DOMRect[], x: number, y: number): number {
  if (!boxes.length) return 0;
  let best = 0;
  let bestD = Infinity;
  boxes.forEach((r, i) => {
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dy * 4 + dx; // rows first
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const r = boxes[best];
  return x < r.left + r.width / 2 ? best : best + 1;
}

/** Begins watching a pointerdown; resolves nothing (callbacks report the outcome). */
export function beginDrag(o: DragOptions): void {
  const { event } = o;
  const touch = event.pointerType === "touch";
  const startX = event.clientX;
  const startY = event.clientY;
  let lifted = false;
  let ghost: HTMLElement | null = null;
  let bar: HTMLElement | null = null;
  let gap = -1;
  let px = startX;
  let py = startY;
  let raf = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const pointerId = event.pointerId;

  const preventTouch = (e: TouchEvent) => {
    if (lifted) e.preventDefault();
  };

  const cleanup = () => {
    if (holdTimer) clearTimeout(holdTimer);
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancelEvent, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("touchmove", preventTouch);
    bar?.remove();
    try {
      o.source.releasePointerCapture?.(pointerId);
    } catch {}
  };

  const finishGhost = (animateBack: boolean) => {
    const g = ghost;
    if (!g) return;
    if (animateBack) {
      g.style.transform = "translate(0px, 0px) scale(1)";
      setTimeout(() => g.remove(), 140);
    } else g.remove();
  };

  const swallowClick = () => {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, true), 0);
  };

  const updateSlot = () => {
    if (!bar) return;
    const rects = o.boxes().map((b) => b.getBoundingClientRect());
    const c = o.container.getBoundingClientRect();
    const inside = px >= c.left - 24 && px <= c.right + 24 && py >= c.top - 24 && py <= c.bottom + 24;
    gap = inside ? gapAt(rects, px, py) : -1;
    if (gap < 0 || !rects.length) {
      bar.style.display = "none";
      return;
    }
    const ref = rects[Math.min(gap, rects.length - 1)];
    const x = gap >= rects.length ? ref.right + 6 : ref.left - 8;
    Object.assign(bar.style, { display: "block", left: `${x}px`, top: `${ref.top}px`, height: `${ref.height}px` });
  };

  const autoScroll = () => {
    if (!lifted) return;
    const top = EDGE + (parseFloat(cssVar("--ip-header-h")) || 56) + 52;
    const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ip-dock-actual")) || 0;
    const bottom = window.innerHeight - dock - EDGE;
    let dy = 0;
    if (py < top) dy = -Math.min(MAX_SPEED, ((top - py) / EDGE) * MAX_SPEED);
    else if (py > bottom) dy = Math.min(MAX_SPEED, ((py - bottom) / EDGE) * MAX_SPEED);
    if (dy) {
      window.scrollBy(0, dy);
      updateSlot();
    }
    raf = requestAnimationFrame(autoScroll);
  };

  const lift = () => {
    lifted = true;
    if (touch) navigator.vibrate?.(10);
    ghost = makeGhost(o.source, o.count);
    bar = makeSlotBar();
    try {
      o.source.setPointerCapture?.(pointerId);
    } catch {}
    o.onLift();
    move();
    raf = requestAnimationFrame(autoScroll);
  };

  const move = () => {
    if (!ghost) return;
    const s = cssVar("--ip-lift-scale") || "1.03";
    ghost.style.transform = `translate(${px - startX}px, ${py - startY}px) scale(${s})`;
    updateSlot();
  };

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    px = e.clientX;
    py = e.clientY;
    const dist = Math.hypot(px - startX, py - startY);
    if (!lifted) {
      if (touch) {
        if (dist > TOUCH_SLOP) {
          cleanup(); // it is a scroll
        }
        return;
      }
      if (dist >= MOUSE_SLOP) lift();
      return;
    }
    e.preventDefault();
    move();
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const wasLifted = lifted;
    updateSlot();
    cleanup();
    if (!wasLifted) return;
    swallowClick();
    if (gap < 0) {
      finishGhost(true);
      o.onCancel();
      return;
    }
    finishGhost(false);
    o.onDrop(gap);
  }

  const cancel = () => {
    const wasLifted = lifted;
    cleanup();
    if (wasLifted) {
      finishGhost(true);
      o.onCancel();
    }
  };
  function onCancelEvent(e: PointerEvent) {
    if (e.pointerId === pointerId) cancel();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && lifted) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }
  function onBlur() {
    cancel();
  }

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancelEvent, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", onBlur);
  if (touch) {
    document.addEventListener("touchmove", preventTouch, { passive: false });
    holdTimer = setTimeout(lift, HOLD_MS);
  }
}
