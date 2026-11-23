"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { pageBoxStyle } from "@/components/tool-flow/PageTile";
import { PageThumb } from "@/components/tool-flow/Thumbnail";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, EnlargeIcon, LockIcon, PlusIcon, RotateLeftIcon, RotateRightIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/Kbd";
import { Spinner } from "@/components/ui/Spinner";
import { formatDelta } from "@/lib/pdf/rotation";
import type { MoveStep, PageSize } from "@/lib/page-list";
import { editCopy as c } from "@/tools/merge/copy-edit";
import { gridColumns, loadDrag, moveStepFor, navTarget, useSettled } from "./grid-keys";
import { buildCards, type ListModel } from "./view-model";

export type CardView = {
  key: string;
  /** Uid of a page in the card, used to focus it after a change. */
  uids: string[];
  letter: string;
  name: string;
  fileId: string | null;
  status: "loading" | "locked" | "ready";
  /** First page: source index and size, for the thumbnail. */
  thumbIndex: number;
  thumbSize: PageSize | null;
  rotation: number;
  accessibleName: string;
  meta: string;
};

export type SegmentGridLabels = {
  list: string;
  hint: string;
  moveEarlier: (name: string) => string;
  moveLater: (name: string) => string;
  position: (i: number, n: number) => string;
  rotateLeft: (name: string) => string;
  rotateRight: (name: string) => string;
  enlarge: (name: string) => string;
  remove: (name: string) => string;
  addFiles: string;
};

/** Merge's wording (Organize in F5 can pass its own). */
export const segmentLabels = (sourceCount: number): SegmentGridLabels => ({
  list: c.filesLabel,
  hint: c.filesHint,
  moveEarlier: c.moveEarlier,
  moveLater: c.moveLater,
  position: c.position,
  rotateLeft: c.rotateLeft,
  rotateRight: c.rotateRight,
  enlarge: c.enlarge,
  remove: c.remove,
  addFiles: c.addFilesTile(sourceCount),
});

/**
 * Files view for Merge (spec F3 M-4 `SegmentGrid`): one card per segment,
 * reorderable by pointer drag, by the Move earlier / later buttons and by
 * Alt+arrow keys. Roving tabindex: only the active card's controls are Tab stops.
 */
export function SegmentGrid({
  model,
  labels: labelsIn,
  sourceCount = 0,
  focusUid,
  dimmed,
  onMove,
  onDragTo,
  onRemove,
  onRotate,
  onPreview,
  onAddFiles,
  onDragState,
}: {
  model: ListModel;
  labels?: SegmentGridLabels;
  sourceCount?: number;
  /** Focus the card holding this page uid after the next render. */
  focusUid: { uid: string; tick: number; onMount: boolean } | null;
  dimmed: boolean;
  onMove: (key: string, step: MoveStep) => void;
  onDragTo: (key: string, gap: number) => void;
  onRemove: (key: string) => void;
  onRotate: (key: string, step: number) => void;
  onPreview: (key: string) => void;
  onAddFiles: (trigger: HTMLElement) => void;
  onDragState: (s: { phase: "start" | "cancel"; name: string }) => void;
}) {
  const labels = labelsIn ?? segmentLabels(sourceCount);
  const cards = useMemo(() => buildCards(model), [model.pages, model.sources, model.files]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const settled = useSettled();
  const active = Math.max(0, cards.findIndex((c) => c.key === activeKey));

  const focusCard = (i: number) => {
    const c = cards[Math.max(0, Math.min(cards.length - 1, i))];
    if (!c) return;
    setActiveKey(c.key);
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-card-key="${CSS.escape(c.key)}"] [data-main]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  // At mount, only a request made for this grid (an insert that switched views) moves focus;
  // an older one belonged to the other view and must not steal focus from the view toggle.
  const handled = useRef(focusUid && !focusUid.onMount ? focusUid.tick : -1);
  useEffect(() => {
    if (!focusUid || focusUid.tick === handled.current) return;
    handled.current = focusUid.tick;
    const i = cards.findIndex((c) => c.uids.includes(focusUid.uid));
    if (i >= 0) focusCard(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUid]);

  // Warm the drag module once the grid is on screen.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const t = idle ? idle(() => void loadDrag()) : setTimeout(() => void loadDrag(), 1000);
    return () => {
      if (!idle) clearTimeout(t as ReturnType<typeof setTimeout>);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const card = cards[i];
    const step = moveStepFor(e);
    if (step) {
      e.preventDefault(); // Alt+Left is "Back" in some browsers
      onMove(card.key, step);
      return;
    }
    const next = navTarget(e.key, i, cards.length, gridColumns(list.current));
    if (next !== null && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      focusCard(next);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(card.key);
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      onRotate(card.key, e.key === "]" ? 90 : -90);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, card: CardView) {
    if (dimmed || card.status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const native = e.nativeEvent;
    const box = e.currentTarget;
    void loadDrag().then(({ beginDrag }) =>
      beginDrag({
        event: native,
        source: box,
        container: list.current!,
        boxes: () => Array.from(list.current?.querySelectorAll<HTMLElement>("[data-card-box]") ?? []),
        count: 1,
        onLift: () => {
          setDragKey(card.key);
          onDragState({ phase: "start", name: card.name });
        },
        onDrop: (gap) => {
          setDragKey(null);
          onDragTo(card.key, gap);
        },
        onCancel: () => {
          setDragKey(null);
          onDragState({ phase: "cancel", name: card.name });
        },
      }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span id="ip-files-hint" className="sr-only">
        {labels.hint}
      </span>
      <div
        ref={list}
        role="list"
        aria-label={labels.list}
        aria-describedby="ip-files-hint"
        data-settled={settled || undefined}
        className={cx(
          "mp-rise-tiles grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,calc(var(--ip-thumb-size)+32px))] sm:gap-5",
          dimmed && "opacity-60 transition-opacity duration-(--dur-base)",
        )}
        data-testid="segment-grid"
      >
        {cards.map((card, i) => {
          const isActive = i === active;
          const tab = isActive ? 0 : -1;
          const badge = formatDelta(card.rotation);
          // BerryPDF PagePreview tray: the file's first page on a pink tray, its name in Fredoka below.
          return (
            <div key={card.key} role="listitem" className="group/card mp-tray flex min-w-0 flex-col gap-1 max-sm:p-2" data-card-key={card.key} data-testid="file-card">
              <div
                data-card-box=""
                onPointerDown={(e) => onPointerDown(e, card)}
                className={cx(
                  "ip-no-callout relative grid aspect-square w-(--ip-thumb-size) touch-pan-y place-items-center rounded-[10px] max-sm:w-full",
                  "transition-opacity duration-(--dur-base)",
                  dragKey === card.key && "opacity-40 outline-2 outline-offset-2 outline-brand outline-dashed",
                )}
              >
                {card.status === "ready" && card.fileId && card.thumbSize ? (
                  <span
                    className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard"
                    style={{ ...pageBoxStyle(card.thumbSize), transform: `rotate(${card.rotation}deg)` }}
                  >
                    <PageThumb fileId={card.fileId} index={card.thumbIndex} />
                  </span>
                ) : card.status === "loading" ? (
                  <Spinner size={24} label={`Reading ${card.name}`} className="text-brand-strong" />
                ) : card.status === "locked" ? (
                  <LockIcon size={28} className="text-muted" />
                ) : null}
                <button
                  type="button"
                  data-main=""
                  tabIndex={tab}
                  aria-label={card.accessibleName}
                  aria-describedby="ip-files-hint"
                  disabled={card.status !== "ready"}
                  onFocus={() => setActiveKey(card.key)}
                  onClick={() => onPreview(card.key)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-3"
                  data-testid="card-main"
                />
                <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 -left-1.5 z-[1] flex gap-1">
                  <span className="grid h-6 min-w-6 place-items-center rounded-pill bg-surface-raised px-1.5 font-display text-help font-semibold text-brand-strong shadow-menu" data-testid="source-badge">
                    {card.letter}
                  </span>
                  {badge && <span className="rounded-pill bg-surface-raised px-2 py-1 font-display text-help font-semibold text-brand-strong tabular-nums shadow-menu">{badge}</span>}
                </span>
                <IconButton
                  label={labels.remove(card.name)}
                  variant="soft"
                  tabIndex={tab}
                  data-no-drag=""
                  className="absolute -top-2 -right-2 z-[2] bg-surface-raised shadow-menu max-lg:size-11"
                  icon={<CloseIcon size={16} />}
                  onClick={() => onRemove(card.key)}
                />
                {card.status === "ready" && !dimmed && (
                  <div
                    data-no-drag=""
                    className={cx(
                      "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-lg border-[1.5px] border-sand bg-surface-raised p-1.5 shadow-menu max-sm:bottom-0 max-sm:gap-0 max-sm:border-0 max-sm:bg-surface-raised/90 max-sm:p-0",
                      "opacity-0 transition-opacity duration-(--dur-base) group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    <IconButton label={labels.rotateLeft(card.name)} variant="soft" tabIndex={tab} className="max-lg:size-11" icon={<RotateLeftIcon size={16} />} onClick={() => onRotate(card.key, -90)} />
                    <IconButton label={labels.rotateRight(card.name)} variant="soft" tabIndex={tab} className="max-lg:size-11" icon={<RotateRightIcon size={16} />} onClick={() => onRotate(card.key, 90)} />
                    <IconButton label={labels.enlarge(card.name)} variant="soft" tabIndex={tab} className="max-lg:size-11" icon={<EnlargeIcon size={16} />} onClick={() => onPreview(card.key)} />
                  </div>
                )}
              </div>
              <span className="mt-1 truncate font-display text-[15px] leading-5 font-semibold text-ink" title={card.name} data-testid="file-name">
                {card.name}
              </span>
              <span className="truncate text-help text-muted tabular-nums" data-testid="file-meta">
                {card.meta}
              </span>
              <div className="-mx-1 flex h-11 items-center justify-between">
                <IconButton
                  label={labels.moveEarlier(card.name)}
                  size="sm"
                  tabIndex={tab}
                  className="max-lg:size-11"
                  disabled={i === 0 || dimmed}
                  icon={<ChevronLeftIcon size={16} />}
                  onClick={() => onMove(card.key, "earlier")}
                />
                <IconButton
                  label={labels.moveLater(card.name)}
                  size="sm"
                  tabIndex={tab}
                  className="max-lg:size-11"
                  disabled={i === cards.length - 1 || dimmed}
                  icon={<ChevronRightIcon size={16} />}
                  onClick={() => onMove(card.key, "later")}
                />
              </div>
            </div>
          );
        })}
        <div role="listitem" className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={(e) => onAddFiles(e.currentTarget)}
            disabled={dimmed}
            title={labels.addFiles}
            className={cx(
              "grid aspect-square w-full place-items-center rounded-tray border-2 border-dashed border-brand-tint-border bg-surface-raised/60 text-brand-strong",
              "transition-[background-color,border-color,transform] duration-(--dur-base) hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint active:translate-y-0 disabled:opacity-50",
            )}
            data-testid="add-tile"
          >
            <span className="flex flex-col items-center gap-1.5 font-display text-[15px] font-semibold">
              <span className="grid size-11 place-items-center rounded-full bg-brand-tint">
                <PlusIcon size={22} />
              </span>
              {labels.addFiles}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Keyboard shortcuts" disclosure under the grids (spec F3 M-8), collapsed by default. */
export function ShortcutsHelp() {
  return (
    <details className="mt-4 text-sm">
      <summary className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-pill px-3 text-muted transition-colors duration-(--dur-base) hover:bg-band hover:text-brand-strong">{c.shortcuts}</summary>
      <ul className="mt-2 grid gap-1.5 text-muted sm:grid-cols-2">
        <li>
          <Kbd>Alt</Kbd> + <Kbd>←</Kbd> <Kbd>→</Kbd> move the focused file or page
        </li>
        <li>
          <Kbd>Alt</Kbd> + <Kbd>Home</Kbd> / <Kbd>End</Kbd> move it to the start or end
        </li>
        <li>
          <Kbd>Space</Kbd> select a page · <Kbd>Shift</Kbd> + arrows extend
        </li>
        <li>
          <Kbd>[</Kbd> <Kbd>]</Kbd> rotate · <Kbd>Delete</Kbd> remove
        </li>
        <li>
          <Kbd>Shift</Kbd> + <Kbd>F10</Kbd> page actions · <Kbd>Esc</Kbd> clear selection
        </li>
        <li>
          <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> undo a removal or sort
        </li>
      </ul>
    </details>
  );
}

