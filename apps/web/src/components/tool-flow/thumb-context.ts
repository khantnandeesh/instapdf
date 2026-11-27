"use client";
import { createContext } from "react";
import type { Thumbs } from "@/lib/pdf/thumbs-lazy";

/**
 * What a grid's thumbnails share: the renderer and one visibility watcher. Its own module so the tool
 * shell (ToolFlow, in every tool's first load) provides it without pulling in PageThumb and its sizing,
 * which load with the grids.
 */
export type Watch = (el: Element, onChange: (near: boolean, far: boolean, top: number) => void) => () => void;

/**
 * One pair of IntersectionObservers for a whole grid: "near" (the viewport
 * plus 200 px, about one row of overscan) asks for renders; leaving "far"
 * (three screens away) releases the bitmap. `root` is the pages' own scroll
 * area when it scrolls (>= 1024 px), so the overscan applies inside it.
 */
export function createVisibilityWatcher(root: Element | null = null): { watch: Watch; disconnect: () => void } {
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
    { root, rootMargin: "200px 0px" },
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
    { root, rootMargin: "300% 0px" },
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

export const ThumbContext = createContext<{ renderer: Thumbs | null; watch: Watch | null }>({ renderer: null, watch: null });

