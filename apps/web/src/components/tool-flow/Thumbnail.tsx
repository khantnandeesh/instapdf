"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { cx } from "../ui/cx";

type Watch = (el: Element, onChange: (near: boolean, far: boolean, top: number) => void) => () => void;

/**
 * One pair of IntersectionObservers for a whole grid: "near" (the viewport
 * plus 200 px, about one row of overscan) asks for renders; leaving "far"
 * (three screens away) releases the bitmap.
 */
export function createVisibilityWatcher(): { watch: Watch; disconnect: () => void } {
  const callbacks = new Map<Element, { cb: (near: boolean, far: boolean, top: number) => void; near: boolean; far: boolean }>();
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = callbacks.get(e.target);
        if (!c) continue;
        c.near = e.isIntersecting;
        if (c.near) c.far = true;
        c.cb(c.near, c.far, e.boundingClientRect.top);
      }
    },
    { rootMargin: "200px 0px" },
  );
  const far = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = callbacks.get(e.target);
        if (!c) continue;
        c.far = e.isIntersecting;
        c.cb(c.near, c.far, e.boundingClientRect.top);
      }
    },
    { rootMargin: "300% 0px" },
  );
  return {
    watch(el, cb) {
      callbacks.set(el, { cb, near: false, far: false });
      near.observe(el);
      far.observe(el);
      return () => {
        callbacks.delete(el);
        near.unobserve(el);
        far.unobserve(el);
      };
    },
    disconnect() {
      near.disconnect();
      far.disconnect();
      callbacks.clear();
    },
  };
}

export const ThumbContext = createContext<{ renderer: ThumbnailRenderer | null; watch: Watch | null; renderSize: number }>({
  renderer: null,
  watch: null,
  renderSize: 160,
});

/**
 * The page image area of a tile or card: a placeholder (pulsing sunken box)
 * until the canvas arrives, then the canvas, which fades in. Box size never
 * changes, so nothing shifts.
 */
export function PageThumb({ fileId, index, className }: { fileId: string; index: number; className?: string }) {
  const { renderer, watch, renderSize } = useContext(ThumbContext);
  const host = useRef<HTMLSpanElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !renderer || !watch) return;
    let cancel: (() => void) | null = null;
    let have = (el.firstChild as HTMLCanvasElement | null)?.dataset.size === String(renderSize);
    const stop = watch(el, (near, far, top) => {
      if (near && !have && !cancel) {
        cancel = renderer.request(fileId, index, renderSize, top, (canvas) => {
          cancel = null;
          have = true;
          canvas.dataset.size = String(renderSize);
          canvas.className = "ip-fade-in block h-full w-full";
          el.replaceChildren(canvas);
          setRendered(true);
        });
      } else if (!near && cancel) {
        cancel();
        cancel = null;
      }
      if (!far && el.firstChild) {
        el.replaceChildren();
        have = false;
        setRendered(false);
      }
    });
    return () => {
      stop();
      cancel?.();
    };
  }, [renderer, watch, renderSize, fileId, index]);

  return (
    <span
      ref={host}
      data-rendered={rendered || undefined}
      className={cx("block h-full w-full", rendered ? "bg-paper" : "ip-pulse bg-paper", className)}
    />
  );
}
