"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ThumbnailRenderer } from "@/lib/pdf/thumbnails";
import { Dialog } from "../ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../ui/icons";
import { fitPage, keyTarget, neighbours, readGesture, type Size } from "./preview-fit";
import type { ReadyFile } from "./types";
import "./page-preview.css";

export type PreviewTarget = { items: { file: ReadyFile; index: number; rotation: number }[]; at: number };

type Item = PreviewTarget["items"][number];

/** Rendered pages kept for instant back-and-forth: the page on screen and its neighbours. */
const KEEP = 5;
/** The sharpest the view draws (device pixels per CSS pixel). */
const MAX_DPR = 3;

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
  renderer: ThumbnailRenderer | null;
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

  // Closed: drop the drawn pages and anything still drawing.
  useEffect(() => {
    if (open) return;
    for (const cancel of pending.current.values()) cancel();
    pending.current.clear();
    cache.current.clear();
  }, [open]);

  const fit = (it: Item) => (avail ? fitPage(pageSize(it), it.rotation, avail) : null);
  const box = item ? fit(item)?.box : undefined;
  const longest = box ? Math.max(box.width, box.height) : 0;

  // Draw the page on screen (from the cache when it was drawn ahead), then its neighbours.
  useEffect(() => {
    if (!item || !renderer || !longest) return;
    const want = (it: Item, priority: number, show: boolean) => {
      const b = fit(it)?.box;
      if (!b) return;
      const size = Math.max(b.width, b.height);
      const key = keyOf(it, size);
      const done = cache.current.get(key);
      if (done) {
        if (show) put(done);
        return;
      }
      if (pending.current.has(key)) return;
      const cancel = renderer.request(
        it.file.id,
        it.index,
        size,
        priority,
        (canvas) => {
          pending.current.delete(key);
          canvas.className = "ip-pv__canvas";
          cache.current.set(key, canvas);
          while (cache.current.size > KEEP) cache.current.delete(cache.current.keys().next().value!);
          if (show && current.current === key) put(canvas);
        },
        MAX_DPR,
      );
      pending.current.set(key, cancel);
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
    current.current = keyOf(item, longest);
    if (!cache.current.has(current.current)) host.current?.replaceChildren();
    want(item, -2, true);
    for (const n of neighbours(at, total)) want(items[n], -1, false);
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

  // Swipe sideways to turn the page; a tap on the backdrop (not the page, not a button) closes.
  const down = useRef<{ id: number; x: number; y: number; type: string; onBackdrop: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button > 0) return;
    const t = e.target as HTMLElement;
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, onBackdrop: !t.closest("button, .ip-pv__paper") };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId) return;
    const g = readGesture(e.clientX - d.x, e.clientY - d.y);
    if (g === "tap") {
      if (d.onBackdrop && !(e.target as HTMLElement).closest("button, .ip-pv__paper")) onClose();
    } else if (g && d.type !== "mouse") {
      const to = g === "next" ? at + 1 : at - 1;
      if (to >= 0 && to < total) onNavigate(to);
    }
  };

  const file = item?.file;
  const pageNo = (item?.index ?? 0) + 1;
  const count = file?.pageCount ?? 0;
  const rotation = item?.rotation ?? 0;
  const title = file ? `Page ${pageNo} of ${count}, ${file.name}` : "";

  return (
    <Dialog open={open} variant="viewer" onClose={onClose} fallbackFocus={fallbackFocus} title={title}>
      {file && (
        <div
          className="ip-pv"
          data-testid="page-preview"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (down.current = null)}
        >
          <div className="ip-pv__top">
            <button type="button" className="ip-pv__btn ip-pv__close" aria-label="Close" onClick={onClose}>
              <CloseIcon size={20} />
            </button>
          </div>
          <div ref={stage} className="ip-pv__stage" data-testid="page-preview-stage">
            {box && (
              <span
                className="ip-pv__paper"
                role="img"
                aria-label={`Page ${pageNo} of ${file.name}`}
                data-testid="page-preview-page"
                style={{ width: box.width, height: box.height, transform: rotation ? `rotate(${rotation}deg)` : undefined }}
              >
                <span ref={host} className="block h-full w-full" />
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
