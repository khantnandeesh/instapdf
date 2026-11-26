"use client";
import { useLayoutEffect, useState, type RefObject } from "react";

/** Below 1024 px a tile's controls sit in a row under the page, never on it (berrypdf.md "Page tiles" PT-1 rule 6). */
const COMPACT = "(max-width: 1023px)";

/**
 * Whether tiles use the under-the-page control row, and the current tile width (the first `.ip-tile`
 * under `root`), so a grid can show as many 44 px buttons as fit and fold the rest into its menu.
 * Measured in a layout effect, so the first paint already has the right row.
 */
export function useTileRow(root: RefObject<HTMLElement | null>): { compact: boolean; width: number } {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(COMPACT).matches);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const mq = window.matchMedia(COMPACT);
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // offsetWidth ignores transforms, so an entrance or FLIP in progress never shrinks the row.
    const measure = () => setWidth(el.querySelector<HTMLElement>(".ip-tile")?.offsetWidth ?? 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return { compact, width };
}

/** How many 44 px targets fit in a row of `width` px. */
export const rowSlots = (width: number) => Math.max(0, Math.floor(width / 44));
