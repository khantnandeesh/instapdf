"use client";
import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { ThumbContext } from "./thumb-context";
import { rendererScale, thumbRenderSize } from "./thumb-size";
import { cx } from "../ui/cx";

/** Redraws after a resize, zoom or pixel-ratio change wait this long for it to settle. */
const SETTLE_MS = 150;

/** One ResizeObserver for every thumbnail: the layout size of each box (transforms do not count). */
const sized = new Map<Element, (w: number, h: number) => void>();
let boxes: ResizeObserver | null = null;
function watchSize(el: Element, cb: (w: number, h: number) => void): () => void {
  boxes ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.contentBoxSize?.[0];
      sized.get(e.target)?.(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
    }
  });
  sized.set(el, cb);
  boxes.observe(el);
  return () => {
    sized.delete(el);
    boxes?.unobserve(el);
  };
}

/**
 * The pixel ratio, with a callback when it changes: a resolution query for a window moved to another
 * screen, and a resize check for browser zoom (which also resizes the viewport).
 */
const ratioListeners = new Set<() => void>();
let ratioQuery: MediaQueryList | null = null;
let ratioSeen = 0;
function armRatio() {
  ratioQuery?.removeEventListener("change", onRatio);
  ratioSeen = window.devicePixelRatio || 1;
  ratioQuery = window.matchMedia(`(resolution: ${ratioSeen}dppx)`);
  ratioQuery.addEventListener("change", onRatio);
}
function onRatio() {
  if ((window.devicePixelRatio || 1) === ratioSeen) return;
  armRatio();
  for (const cb of ratioListeners) cb();
}
function watchRatio(cb: () => void): () => void {
  if (!ratioQuery) {
    armRatio();
    window.addEventListener("resize", onRatio);
  }
  ratioListeners.add(cb);
  return () => void ratioListeners.delete(cb);
}

/**
 * The page image area of a tile or card: a placeholder (pulsing sunken box)
 * until the canvas arrives, then the canvas, which fades in. Box size never
 * changes, so nothing shifts.
 *
 * The canvas is drawn for the box as it is shown (eval G-1): its longest side times the screen's
 * pixel ratio (up to 2.5), measured by one shared ResizeObserver, never read from layout. A box that
 * grows (zoom slider, a wider window) or a new pixel ratio redraws once things settle; the old canvas
 * stays until the new one is ready, so nothing flashes. `scale` is any CSS scale on top of the box
 * (a turned page fitted in its tile).
 */
export function PageThumb({ fileId, index, className, style, scale = 1 }: { fileId: string; index: number; className?: string; style?: CSSProperties; scale?: number }) {
  const { renderer, watch } = useContext(ThumbContext);
  const host = useRef<HTMLSpanElement>(null);
  const [rendered, setRendered] = useState(false);
  // Read through a ref: a turn changes the scale, and a canvas that is still sharp enough stays (no redraw).
  const scaleRef = useRef(scale);
  const rescale = useRef<() => void>(() => {});
  useEffect(() => {
    scaleRef.current = scale;
    rescale.current();
  }, [scale]);

  useEffect(() => {
    const el = host.current;
    if (!el || !renderer || !watch) return;
    let cancel: (() => void) | null = null;
    /** Device pixels along the current canvas's longest side (0: none), and the size to ask for next (0: none). */
    let have = 0;
    let want = 0;
    let near = false;
    let top = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let longest = 0;
    const need = () => (longest > 0 ? thumbRenderSize(longest * scaleRef.current, window.devicePixelRatio) : 0);
    const draw = () => {
      if (!near || !want) return;
      cancel?.();
      const size = want;
      const device = size * rendererScale(window.devicePixelRatio);
      cancel = renderer.request(fileId, index, size, top, (canvas) => {
        cancel = null;
        have = device;
        if (want === size) want = 0;
        canvas.dataset.size = String(size);
        // Out of flow: a canvas's own pixel ratio (whole pixels, rounded) must never size its box (CLS).
        canvas.className = el.firstChild ? "absolute inset-0 block size-full" : "mp-thumb-in absolute inset-0 block size-full";
        el.replaceChildren(canvas);
        setRendered(true);
      });
    };
    /** A new box size or pixel ratio: at once for the first canvas, after things settle for a redraw. */
    const update = () => {
      const next = need();
      if (!next) return;
      const device = next * rendererScale(window.devicePixelRatio);
      // A smaller need keeps the sharper canvas unless it is far bigger than needed (memory).
      if (have && device <= have && device * 1.5 > have) {
        want = 0;
        clearTimeout(settle);
        return;
      }
      if (next === want) return;
      want = next;
      clearTimeout(settle);
      if (!have && !cancel) draw();
      else settle = setTimeout(draw, SETTLE_MS);
    };
    const stopSize = watchSize(el, (w, h) => {
      longest = Math.max(w, h);
      update();
    });
    const stopRatio = watchRatio(update);
    rescale.current = update;
    const stopNear = watch(el, (isNear, far, t) => {
      near = isNear;
      top = t;
      if (near && !cancel) draw();
      else if (!near && cancel && !have) {
        cancel();
        cancel = null;
      }
      if (!far && el.firstChild) {
        el.replaceChildren();
        have = 0;
        want = need();
        setRendered(false);
      }
    });
    return () => {
      rescale.current = () => {};
      clearTimeout(settle);
      stopSize();
      stopRatio();
      stopNear();
      cancel?.();
    };
  }, [renderer, watch, fileId, index]);

  return (
    <span
      ref={host}
      data-rendered={rendered || undefined}
      className={cx("relative block h-full w-full", rendered ? "bg-paper" : "ip-pulse bg-paper", className)}
      style={style}
    />
  );
}
