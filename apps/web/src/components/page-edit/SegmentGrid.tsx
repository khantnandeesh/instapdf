"use client";
import "./page-edit.css";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { flip } from "@/lib/motion/flow";
import { pageBoxStyle, pageTransform } from "@/components/tool-flow/page-box";
import { PageThumb } from "@/components/tool-flow/Thumbnail";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, EnlargeIcon, LockIcon, PlusIcon, RotateLeftIcon, RotateRightIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/Kbd";
import { Spinner } from "@/components/ui/Spinner";
import { formatDelta } from "@/lib/pdf/rotation";
import { MenuButton, type MenuEntry } from "@/components/ui/Menu";
import { rowSlots, useTileRow } from "@/components/tool-flow/useTileRow";
import type { MoveStep, PageSize } from "@/lib/page-list";
import { editCopy as c } from "@/tools/merge/copy-edit";
import { gridColumns, loadDragFor, moveStepFor, navTarget, useSettled, useWarmDrag } from "./grid-keys";
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
  more: (name: string) => string;
  /** Short menu items for actions that fold into More below 1024 px. */
  items: { rotateLeft: string; rotateRight: string; enlarge: string; remove: string };
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
  more: c.pageMore,
  items: { rotateLeft: c.rotateLeftItem, rotateRight: c.rotateRightItem, enlarge: c.enlargeItem, remove: c.removeItem },
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
  listRef,
  variant = "edit",
  renderSettings,
}: {
  model: ListModel;
  /** Wording that differs from Merge's. */
  labels?: Partial<SegmentGridLabels>;
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
  /** The list element (the [data-flip-root] the owner FLIPs, e.g. on Sort). */
  listRef?: RefObject<HTMLDivElement | null>;
  /**
   * "mix": Alternate's wide cards (spec F4/F5 P-3): thumbnail tray with the letter and remove,
   * name and count, the card's own settings (`renderSettings`) and move earlier / later. No rotate.
   */
  variant?: "edit" | "mix";
  renderSettings?: (card: CardView) => ReactNode;
}) {
  const mix = variant === "mix";
  const labels: SegmentGridLabels = { ...segmentLabels(sourceCount), ...labelsIn };
  const cards = useMemo(() => buildCards(model), [model.pages, model.sources, model.files]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownList = useRef<HTMLDivElement>(null);
  const list = listRef ?? ownList;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const settled = useSettled();
  const active = Math.max(0, cards.findIndex((c) => c.key === activeKey));
  // A keyboard move, the arrow buttons or a removal: the cards FLIP to their new slots (200ms, T9, T10).
  const moved = (change: () => void) => flip(list.current, () => flushSync(change), "reorder");
  // Below 1024 px the card's controls sit in its bottom row, never on the page (PT-1 rule 6): between
  // the move arrows, as many as fit, and More for the rest.
  const { compact, width } = useTileRow(list);
  const midSlots = rowSlots(width + 8) - 2;
  const order = ["rotate-right", "remove", "rotate-left", "enlarge"] as const;
  const rowActions = compact ? (midSlots >= order.length ? [...order] : order.slice(0, Math.max(0, midSlots - 1))) : [];

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
  useWarmDrag();

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const card = cards[i];
    const step = moveStepFor(e);
    if (step) {
      e.preventDefault(); // Alt+Left is "Back" in some browsers
      moved(() => onMove(card.key, step));
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
      moved(() => onRemove(card.key));
    } else if (!mix && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      onRotate(card.key, e.key === "]" ? 90 : -90);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, card: CardView) {
    if (dimmed || card.status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const native = e.nativeEvent;
    const box = e.currentTarget;
    void loadDragFor(native).then((m) =>
      m?.beginDrag({
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

  /**
   * Alternate's wide card (PT-1, "The page is the tile"): the page itself, page-shaped and filling its
   * column, with no fill around it; the letter, name and count under it; the move and remove buttons in
   * a row of their own (never drawn over the page); the card's settings beside it (from 640 px) or under
   * it. The card is grouped by an outline, never a filled block.
   */
  const mixCard = (card: CardView, i: number, tab: number) => {
    const size = card.thumbSize;
    return (
      <div
        key={card.key}
        role="listitem"
        aria-label={`${card.name}, ${card.letter}, ${card.meta}`}
        className="group/card grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-[14px] border-[1.5px] border-sand p-3 [grid-template-areas:'thumb_ctrl'_'name_name'_'set_set'] sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-x-4 sm:[grid-template-areas:'thumb_set'_'name_set'_'ctrl_set']"
        data-card-key={card.key}
        data-testid="file-card"
        data-flip
      >
        <div
          data-card-box=""
          onPointerDown={(e) => onPointerDown(e, card)}
          className={cx(
            "ip-no-callout relative w-full touch-pan-y self-start [grid-area:thumb]",
            "transition-opacity duration-(--dur-base)",
            dragKey === card.key && "opacity-40 outline-2 outline-offset-2 outline-brand outline-dashed",
          )}
        >
          <span className="relative grid w-full place-items-center overflow-hidden rounded-[4px] bg-paper shadow-paper" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "1 / 1.4142" }}>
            {card.status === "ready" && card.fileId && size ? (
              <PageThumb fileId={card.fileId} index={card.thumbIndex} />
            ) : card.status === "loading" ? (
              <Spinner size={20} label={`Reading ${card.name}`} className="text-brand-strong" />
            ) : card.status === "locked" ? (
              <LockIcon size={24} className="text-muted" />
            ) : null}
          </span>
          <button
            type="button"
            data-main=""
            tabIndex={tab}
            aria-label={labels.enlarge(card.name)}
            aria-describedby="ip-files-hint"
            disabled={card.status !== "ready"}
            onFocus={() => setActiveKey(card.key)}
            onClick={() => onPreview(card.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="absolute inset-0 rounded-[4px] focus-visible:outline-offset-1"
            data-testid="card-main"
          />
        </div>
        <div className="flex min-w-0 flex-col [grid-area:name]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="font-display text-[13px] font-semibold text-muted" data-testid="source-badge">
              {card.letter}
            </span>
            <span className="truncate font-display text-[15px] leading-5 font-semibold text-ink" title={card.name} data-testid="file-name">
              {card.name}
            </span>
          </span>
          <span className="truncate text-help text-muted tabular-nums" data-testid="file-meta">
            {card.meta}
          </span>
        </div>
        <div className="-mx-1 flex items-center gap-1 self-start [grid-area:ctrl] sm:self-end">
          <IconButton
            label={labels.moveEarlier(card.name)}
            size="sm"
            tabIndex={tab}
            className="max-lg:size-11"
            disabled={i === 0 || dimmed}
            icon={<ChevronLeftIcon size={16} />}
            onClick={() => moved(() => onMove(card.key, "earlier"))}
          />
          <IconButton
            label={labels.moveLater(card.name)}
            size="sm"
            tabIndex={tab}
            className="max-lg:size-11"
            disabled={i === cards.length - 1 || dimmed}
            icon={<ChevronRightIcon size={16} />}
            onClick={() => moved(() => onMove(card.key, "later"))}
          />
          <IconButton label={labels.remove(card.name)} size="sm" tabIndex={tab} data-no-drag="" className="max-lg:size-11" icon={<CloseIcon size={16} />} onClick={() => moved(() => onRemove(card.key))} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 [grid-area:set]" data-no-drag="" data-testid="card-settings">
          {card.status === "ready" && renderSettings?.(card)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <span id="ip-files-hint" className="sr-only">
        {labels.hint}
      </span>
      <div
        ref={list}
        data-flip-root
        role="list"
        aria-label={labels.list}
        aria-describedby="ip-files-hint"
        data-settled={settled || undefined}
        className={cx(
          mix
            ? "mp-rise-tiles grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(min(var(--ip-mix-card-min),100%),1fr))] sm:gap-5"
            : "mp-rise-tiles ip-tile-grid",
          dimmed && "opacity-60 transition-opacity duration-(--dur-base)",
        )}
        data-testid="segment-grid"
      >
        {cards.map((card, i) => {
          const isActive = i === active;
          const tab = isActive ? 0 : -1;
          const badge = formatDelta(card.rotation);
          if (mix) return mixCard(card, i, tab);
          const action = (a: (typeof order)[number]) => (
            <IconButton
              key={a}
              label={a === "remove" ? labels.remove(card.name) : a === "enlarge" ? labels.enlarge(card.name) : a === "rotate-left" ? labels.rotateLeft(card.name) : labels.rotateRight(card.name)}
              variant="soft"
              tabIndex={tab}
              disabled={a === "remove" ? false : card.status !== "ready" || dimmed}
              className="max-lg:size-11"
              icon={a === "remove" ? <CloseIcon size={16} /> : a === "enlarge" ? <EnlargeIcon size={16} /> : a === "rotate-left" ? <RotateLeftIcon size={16} /> : <RotateRightIcon size={16} />}
              onClick={() => (a === "remove" ? moved(() => onRemove(card.key)) : a === "enlarge" ? onPreview(card.key) : onRotate(card.key, a === "rotate-left" ? -90 : 90))}
            />
          );
          const folded = order.filter((a) => !rowActions.includes(a));
          const moreItems: MenuEntry[] = folded.map((a) => ({
            id: a,
            label: labels.items[a === "rotate-left" ? "rotateLeft" : a === "rotate-right" ? "rotateRight" : a],
            disabled: a !== "remove" && (card.status !== "ready" || !!dimmed),
            onSelect: () => (a === "remove" ? moved(() => onRemove(card.key)) : a === "enlarge" ? onPreview(card.key) : onRotate(card.key, a === "rotate-left" ? -90 : 90)),
          }));
          // Page tile (berrypdf.md "Page tiles"): the file's first page fills the tile, its name in Fredoka below.
          return (
            <div key={card.key} role="listitem" className="group/card ip-tile flex min-w-0 flex-col gap-1" data-card-key={card.key} data-testid="file-card" data-flip>
              <div
                data-card-box=""
                onPointerDown={(e) => onPointerDown(e, card)}
                className={cx(
                  "ip-no-callout ip-tile__box relative grid touch-pan-y place-items-center rounded-[10px]",
                  "transition-opacity duration-(--dur-base)",
                  dragKey === card.key && "opacity-40 outline-2 outline-offset-2 outline-brand outline-dashed",
                )}
              >
                {card.status === "ready" && card.fileId && card.thumbSize ? (
                  <span
                    className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard"
                    style={{ ...pageBoxStyle(card.thumbSize), transform: pageTransform(card.thumbSize, card.rotation) }}
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
                  className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-1"
                  data-testid="card-main"
                />
                <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 -left-1.5 z-[1] flex gap-1">
                  <span className="grid h-6 min-w-6 place-items-center rounded-pill bg-surface-raised px-1.5 font-display text-help font-semibold text-brand-strong shadow-menu" data-testid="source-badge">
                    {card.letter}
                  </span>
                  {badge && <span className="rounded-pill bg-surface-raised px-2 py-1 font-display text-help font-semibold text-brand-strong tabular-nums shadow-menu">{badge}</span>}
                </span>
                {!compact && (
                <IconButton
                  label={labels.remove(card.name)}
                  variant="soft"
                  tabIndex={tab}
                  data-no-drag=""
                  className="absolute -top-2 -right-2 z-[2] bg-surface-raised text-brand-strong shadow-menu transition-[background-color,color,transform] duration-(--dur-fast) hover:rotate-90 hover:bg-brand hover:text-white focus-visible:bg-brand focus-visible:text-white motion-reduce:hover:rotate-0 max-lg:size-11"
                  icon={<CloseIcon size={16} />}
                  onClick={() => moved(() => onRemove(card.key))}
                />
                )}
                {card.status === "ready" && !dimmed && !compact && (
                  <div
                    data-no-drag=""
                    className={cx(
                      "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-lg border-[1.5px] border-sand bg-surface-raised p-1.5 shadow-menu max-sm:bottom-0 max-sm:gap-0 max-sm:border-0 max-sm:bg-surface-raised/90 max-sm:p-0",
                      "opacity-0 transition-opacity duration-(--dur-base) group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    {action("rotate-left")}
                    {action("rotate-right")}
                    {action("enlarge")}
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
                  onClick={() => moved(() => onMove(card.key, "earlier"))}
                />
                {compact && (
                  <span data-no-drag="" className="flex items-center" data-testid="card-row">
                    {rowActions.map(action)}
                    {folded.length > 0 && (
                      <MenuButton
                        label={labels.more(card.name)}
                        items={moreItems}
                        placement="bottom-end"
                        tabIndex={tab}
                        className="mp-iconbtn relative size-11"
                        data-testid="card-more"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                          <circle cx="5" cy="12" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="19" cy="12" r="1.75" />
                        </svg>
                      </MenuButton>
                    )}
                  </span>
                )}
                <IconButton
                  label={labels.moveLater(card.name)}
                  size="sm"
                  tabIndex={tab}
                  className="max-lg:size-11"
                  disabled={i === cards.length - 1 || dimmed}
                  icon={<ChevronRightIcon size={16} />}
                  onClick={() => moved(() => onMove(card.key, "later"))}
                />
              </div>
            </div>
          );
        })}
        <div role="listitem" className="flex min-w-0 flex-col" data-flip>
          <button
            type="button"
            onClick={(e) => onAddFiles(e.currentTarget)}
            disabled={dimmed}
            title={labels.addFiles}
            className={cx(
              mix ? "group/add grid h-full min-h-[120px] w-full place-items-center sm:min-h-[200px]" : "group/add grid aspect-square w-full place-items-center",
              "rounded-tray border-2 border-dashed border-brand-tint-border bg-surface-raised/60 text-brand-strong",
              "transition-[background-color,border-color,transform] duration-(--dur-base) hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint active:translate-y-0 disabled:opacity-50",
            )}
            data-testid="add-tile"
          >
            <span className="flex flex-col items-center gap-1.5 font-display text-[15px] font-semibold">
              <span className="grid size-11 place-items-center rounded-full bg-brand text-white shadow-menu transition-transform duration-(--dur-base) group-hover/add:rotate-90 group-focus-visible/add:rotate-90 motion-reduce:rotate-0">
                <PlusIcon size={20} />
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

