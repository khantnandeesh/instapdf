"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Thumbs } from "@/lib/pdf/thumbs-lazy";
import { Dialog } from "../ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../ui/icons";
import { fitPage, keyTarget, neighbours, readGesture, renderSize, type Size } from "./preview-fit";
import type { ReadyFile } from "./types";
import "./page-preview.css";

export type PreviewTarget = { items: { file: ReadyFile; index: number; rotation: number }[]; at: number };

type Item = PreviewTarget["items"][number];

/** Rendered pages kept for instant back-and-forth: the page on screen and its neighbours. */
const KEEP = 5;

const pageSize = (it: Item): Size => it.file.pages[it.index] ?? { width: 1, height: 1 };
const keyOf = (it: Item, size: number) => `${it.file.id}:${it.index}:${size}`;

/**
 * The big page view (docs/design/berrypdf.md "Modals"). The page fills the screen less a slim
 * row of chrome, keeps its aspect ratio and is drawn at the screen's pixel ratio; a quiet
 * "13 / 58" counter and a small close button are the only chrome. Previous / Next are small
 * icon buttons beside the page (phones: in a bottom bar, in reach of the thumb). Arrow keys,
 * Home / End and a sideways swipe move through `items` (a file's pages in Rotate, a card's
 * pages in Merge); Escape, the close button or a tap on the dark backdrop close it. The
 * neighbours are drawn ahead, so moving is instant.
 */
export function PagePreviewDialog({
  target: preview,
  renderer,
  onNavigate,
  onClose,
  fallbackFocus,
}: {
  target: PreviewTarget | null;
  renderer: Thumbs | null;
  onNavigate: (at: number) => void;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const items = preview?.items ?? [];
  const at = preview?.at ?? 0;
  const total = items.length;
  const item = items[at];
  const open = !!item;

  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState<Size | null>(null);
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  const pending = useRef(new Map<string, () => void>());
  /** Cache key of the page that should be on screen (a late render of another page is kept, not shown). */
  const current = useRef("");

  // The stage is the space the page may fill (the viewport less the chrome rows and gutters).
  useLayoutEffect(() => {
    const el = stage.current;
    if (!open || !el) return;
    const measure = () => {
      // Content box: the stage's padding is the gutter (and, from 640px, the room for the arrows).
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(v) || 0;
      setAvail({
        width: el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
        height: el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Closed or unmounted: stop anything still drawing and free the drawn pages' pixel memory.
  useEffect(() => {
    if (!open) release(cache.current, pending.current);
  }, [open]);
  useEffect(() => {
    const c = cache.current;
    const p = pending.current;
    return () => release(c, p);
  }, []);

  const fit = (it: Item) => (avail ? fitPage(pageSize(it), it.rotation, avail) : null);
  const fitted = item ? fit(item) : null;
  const box = fitted?.box;
  const shown = fitted?.shown;
  const longest = box ? Math.max(box.width, box.height) : 0;

  // Draw the page on screen (from the cache when it was drawn ahead), then its neighbours.
  useEffect(() => {
    if (!item || !renderer || !longest) return;
    const want = (it: Item, priority: number) => {
      const key = keyFor(it);
      if (!key || cache.current.has(key) || pending.current.has(key)) return;
      const b = fit(it)!.box;
      const cancel = renderer.request(it.file.id, it.index, renderSize(Math.max(b.width, b.height), window.devicePixelRatio), priority, (canvas) => {
        pending.current.delete(key);
        canvas.className = "ip-pv__canvas";
        cache.current.set(key, canvas);
        evict(cache.current, KEEP, host.current?.firstChild);
        // A page drawn ahead may be the one on screen by now (the user moved while it was drawing).
        if (current.current === key) put(canvas);
      });
      pending.current.set(key, cancel);
    };
    const keyFor = (it: Item) => {
      const b = fit(it)?.box;
      return b ? keyOf(it, renderSize(Math.max(b.width, b.height), window.devicePixelRatio)) : null;
    };
    const put = (canvas: HTMLCanvasElement) => {
      const el = host.current;
      if (!el || el.firstChild === canvas) return;
      // Restart the short crossfade (none under reduced motion).
      canvas.classList.remove("ip-pv__canvas--in");
      void canvas.offsetWidth;
      canvas.classList.add("ip-pv__canvas--in");
      el.replaceChildren(canvas);
    };
    current.current = keyFor(item) ?? "";
    // Renders for pages the user has moved away from (fast arrow presses) are cancelled, so the queue only ever
    // holds the page on screen and its neighbours.
    const wanted = new Set([current.current, ...neighbours(at, total).map((n) => keyFor(items[n]))]);
    for (const [key, cancel] of pending.current)
      if (!wanted.has(key)) {
        cancel();
        pending.current.delete(key);
      }
    const ready = cache.current.get(current.current);
    if (ready) put(ready);
    else host.current?.replaceChildren();
    want(item, -2);
    for (const n of neighbours(at, total)) want(items[n], -1);
  }, [item, at, total, renderer, longest, avail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keys work wherever focus is in the dialog (Escape is the dialog's own).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const to = keyTarget(e.key, at, total);
      if (to === null) return;
      e.preventDefault();
      onNavigate(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, at, total, onNavigate]);

  // Swipe sideways to turn the page. A tap on the backdrop closes, but only from the click that follows it: closing
  // on pointerup would let the touch's click fall through to whatever is under the viewer (a ghost click). The
  // page, the buttons and the chrome rows (counter included) are not backdrop; a drag never closes.
  const down = useRef<{ id: number; x: number; y: number; type: string; onBackdrop: boolean } | null>(null);
  const tapped = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    tapped.current = false;
    if (!e.isPrimary || e.button > 0) return;
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, onBackdrop: isBackdrop(e.target) };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId) return;
    const g = readGesture(e.clientX - d.x, e.clientY - d.y);
    if (g === "tap") tapped.current = d.onBackdrop && isBackdrop(e.target);
    else if (g && d.type !== "mouse") {
      const to = g === "next" ? at + 1 : at - 1;
      if (to >= 0 && to < total) onNavigate(to);
    }
  };
  const onClick = (e: React.MouseEvent) => {
    const close = tapped.current && isBackdrop(e.target);
    tapped.current = false;
    if (close) onClose();
  };

  const file = item?.file;
  const pageNo = (item?.index ?? 0) + 1;
  const count = file?.pageCount ?? 0;
  const rotation = item?.rotation ?? 0;
  const title = file ? `Page ${pageNo} of ${count}, ${file.name}` : "";

  return (
    // The full-screen dialog, restyled as the viewer by page-preview.css (.mp-viewer): no surface, a dark scrim.
    <Dialog open={open} variant="fullscreen" className="mp-viewer" onClose={onClose} fallbackFocus={fallbackFocus} title={title}>
      {file && (
        <div
          className="ip-pv"
          data-testid="page-preview"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (down.current = null)}
          onClick={onClick}
        >
          <div className="ip-pv__top">
            <button type="button" className="ip-pv__btn ip-pv__close" aria-label="Close" onClick={onClose}>
              <CloseIcon size={20} />
            </button>
          </div>
          <div ref={stage} className="ip-pv__stage" data-testid="page-preview-stage">
            {box && shown && (
              <span className="ip-pv__frame" style={{ width: shown.width, height: shown.height }}>
                <span
                  className="ip-pv__paper"
                  role="img"
                  aria-label={`Page ${pageNo} of ${file.name}`}
                  data-testid="page-preview-page"
                  style={{ width: box.width, height: box.height, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
                >
                  <span ref={host} className="block h-full w-full" />
                </span>
              </span>
            )}
          </div>
          <div className="ip-pv__bar">
            <button type="button" className="ip-pv__btn ip-pv__prev" aria-label="Previous page" disabled={at <= 0} onClick={() => onNavigate(at - 1)}>
              <ChevronLeftIcon size={20} />
            </button>
            <span className="ip-pv__count" title={file.name} data-testid="page-preview-counter">
              <span aria-hidden="true">
                {pageNo} / {count}
              </span>
              <span className="sr-only" aria-live="polite">
                Page {pageNo} of {count}
              </span>
            </span>
            <button type="button" className="ip-pv__btn ip-pv__next" aria-label="Next page" disabled={at >= total - 1} onClick={() => onNavigate(at + 1)}>
              <ChevronRightIcon size={20} />
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Backdrop: the dark area around the page, not the page itself, a button or the chrome rows. */
function isBackdrop(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest("button, .ip-pv__paper, .ip-pv__top, .ip-pv__bar");
}

/** Frees a canvas's pixel memory now rather than whenever it is collected. */
function zero(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

/** Drops the oldest drawn pages beyond `keep`, never the one on screen. */
function evict(cache: Map<string, HTMLCanvasElement>, keep: number, onScreen: ChildNode | null | undefined) {
  for (const [key, c] of cache) {
    if (cache.size <= keep) return;
    if (c === onScreen) continue;
    cache.delete(key);
    zero(c);
  }
}

/** Cancels every render still running and frees every drawn page. */
function release(cache: Map<string, HTMLCanvasElement>, pending: Map<string, () => void>) {
  for (const cancel of pending.values()) cancel();
  pending.clear();
  for (const c of cache.values()) zero(c);
  cache.clear();
}
