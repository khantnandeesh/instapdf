"use client";
import "./page-edit.css";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { flip } from "@/lib/motion/flow";
import { pageBoxStyle, pageTransform } from "@/components/tool-flow/page-box";
import { PageThumb } from "@/components/tool-flow/Thumbnail";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, FileIcon, LockIcon, PlusIcon, RotateLeftIcon, RotateRightIcon } from "@/components/ui/icons";
import { MenuButton, type MenuButtonHandle, type MenuEntry } from "@/components/ui/Menu";
import { Spinner } from "@/components/ui/Spinner";
import { formatDelta } from "@/lib/pdf/rotation";
import { rowSlots, useTileRow } from "@/components/tool-flow/useTileRow";
import type { MoveStep, PageSize } from "@/lib/page-list";
import { editCopy as c } from "@/tools/merge/copy-edit";
import { gridColumns, loadDragFor, moveStepFor, navTarget, useSettled, useWarmDrag } from "./grid-keys";
import { buildTiles, type ListModel } from "./view-model";

export type TileView = {
  uid: string;
  label: string;
  accessibleName: string;
  fileId: string | null;
  sourceIndex: number;
  /** Size before the user's rotation (the box is drawn at this size and turned). */
  size: PageSize;
  rotation: number;
  blank: boolean;
  status: "loading" | "locked" | "ready";
  selected: boolean;
  inserted: boolean;
};

export type PageAction =
  | "rotate-left"
  | "rotate-right"
  | "remove"
  | "duplicate"
  | "move-to"
  | "move-earlier"
  | "move-later"
  | "blank-after"
  | "pages-after"
  | "files-after"
  | "enlarge";

export type InsertKind = "files" | "pages" | "blank";

export type PageGridLabels = {
  list: string;
  hint: string;
  more: (label: string) => string;
  insertAfter: (label: string) => string;
  insertStart: string;
  addAtEnd: string;
  addTile: string;
  filesHere: string;
  pagesHere: string;
  blankHere: string;
  rotateLeft: string;
  rotateRight: string;
  remove: string;
  duplicate: (n: number) => string;
  moveTo: (n: number) => string;
  moveEarlier: string;
  moveLater: string;
  blankAfter: string;
  pagesAfter: string;
  filesAfter: string;
  enlarge: string;
  rotateTileLeft: (label: string) => string;
  rotateTileRight: (label: string) => string;
  removeTile: (label: string) => string;
  blankName: string;
  selected: (n: number) => string;
  selectionBar: string;
  rotateSelLeft: string;
  rotateSelRight: string;
  removeSel: string;
  clear: string;
  clearSel: string;
};

/** Merge's wording (Organize in F5 can pass its own). */
export const pageLabels: PageGridLabels = {
  list: c.pagesLabel,
  hint: c.pagesHint,
  more: c.pageMore,
  insertAfter: c.insertAfter,
  insertStart: c.insertStart,
  addAtEnd: c.addAtEnd,
  addTile: c.addTile,
  filesHere: c.filesHere,
  pagesHere: c.pagesHere,
  blankHere: c.blankHere,
  rotateLeft: c.rotateLeftItem,
  rotateRight: c.rotateRightItem,
  remove: c.removeItem,
  duplicate: c.duplicate,
  moveTo: c.moveTo,
  moveEarlier: c.moveEarlierItem,
  moveLater: c.moveLaterItem,
  blankAfter: c.blankAfter,
  pagesAfter: c.pagesAfter,
  filesAfter: c.filesAfter,
  enlarge: c.enlargeItem,
  rotateTileLeft: (l) => `Rotate ${l} left`,
  rotateTileRight: (l) => `Rotate ${l} right`,
  removeTile: (l) => `Remove ${l}`,
  blankName: c.blankName,
  selected: c.selected,
  selectionBar: c.selectionBar,
  rotateSelLeft: c.rotateSelLeft,
  rotateSelRight: c.rotateSelRight,
  removeSel: c.removeSel,
  clear: c.clear,
  clearSel: c.clearSel,
};

/**
 * Pages view for Merge (spec F3 M-4 `EditablePageGrid`): one flat list in
 * output order with selection (click, Ctrl/Cmd, Shift, Space), moves (drag,
 * Alt+arrows, Move to position), per-page actions and insert points.
 */
export default function EditablePageGrid({
  model,
  selection,
  inserted,
  labels: labelsIn,
  focusUid,
  dimmed,
  selectionCount,
  onSelect,
  onSelectAll,
  onClearSelection,
  onMove,
  onDragTo,
  onAction,
  onInsert,
  onRotateSelection,
  onRemoveSelection,
  onDragState,
  listRef,
  readOnly = false,
}: {
  model: ListModel;
  selection: ReadonlySet<string>;
  inserted: ReadonlySet<string>;
  /** Wording that differs from Merge's (Organize, Alternate's result view). */
  labels?: Partial<PageGridLabels>;
  focusUid: { uid: string; tick: number; onMount: boolean } | null;
  dimmed: boolean;
  selectionCount: number;
  onSelect: (uid: string, how: { toggle: boolean; range: boolean }) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMove: (uid: string, step: MoveStep) => void;
  onDragTo: (uid: string, gap: number) => void;
  onAction: (uid: string, action: PageAction, trigger: HTMLElement | null) => void;
  onInsert: (gap: number, kind: InsertKind, trigger: HTMLElement | null) => void;
  onRotateSelection: (step: number) => void;
  onRemoveSelection: () => void;
  onDragState: (s: { phase: "start" | "cancel"; label: string; count: number }) => void;
  /** The list element (the [data-flip-root] the owner FLIPs, e.g. on Sort). */
  listRef?: RefObject<HTMLDivElement | null>;
  /**
   * A result to look at, not to edit (Alternate's Pages view, spec F4/F5 P-3): no drag, insert
   * points, add tile, selection or page actions; a click or Enter opens the preview ("enlarge").
   */
  readOnly?: boolean;
}) {
  const labels: PageGridLabels = labelsIn ? { ...pageLabels, ...labelsIn } : pageLabels;
  const tiles = useMemo(() => buildTiles(model, selection, inserted), [model.pages, model.sources, model.files, selection, inserted]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownList = useRef<HTMLDivElement>(null);
  const list = listRef ?? ownList;
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Set<string>>(new Set());
  const settled = useSettled();
  // Warm the drag module once the grid is on screen (Organize opens on this grid, never on the files view).
  useWarmDrag();
  const menus = useRef(new Map<string, MenuButtonHandle | null>());
  const active = Math.max(0, tiles.findIndex((t) => t.uid === activeUid));
  // Below 1024 px the controls sit in a row under the page (PT-1 rule 6): as many as fit, the rest in More.
  const { compact, width } = useTileRow(list);
  const rowActions = (["rotate-right", "remove", "rotate-left"] as const).slice(0, compact ? Math.max(0, rowSlots(width + 8) - 1) : 3);

  const focusTile = (i: number) => {
    const t = tiles[Math.max(0, Math.min(tiles.length - 1, i))];
    if (!t) return;
    setActiveUid(t.uid);
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-uid="${CSS.escape(t.uid)}"] [data-main]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  // At mount, only a request made for this grid (an insert that switched views) moves focus;
  // an older one belonged to the other view and must not steal focus from the view toggle.
  const handled = useRef(focusUid && !focusUid.onMount ? focusUid.tick : -1);
  useEffect(() => {
    if (!focusUid || focusUid.tick === handled.current) return;
    handled.current = focusUid.tick;
    const i = tiles.findIndex((t) => t.uid === focusUid.uid);
    if (i >= 0) focusTile(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUid]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const tile = tiles[i];
    if (readOnly) {
      const to = navTarget(e.key, i, tiles.length, gridColumns(list.current));
      if (to !== null && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        focusTile(to);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onAction(tile.uid, "enlarge", e.currentTarget);
      }
      return;
    }
    const step = moveStepFor(e);
    if (step) {
      e.preventDefault(); // Alt+Left is "Back" in some browsers
      // The moved tile and its neighbours FLIP to their new slots (200ms, T9).
      flip(list.current, () => flushSync(() => onMove(tile.uid, step)), "reorder");
      return;
    }
    const next = navTarget(e.key, i, tiles.length, gridColumns(list.current));
    if (next !== null && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) onSelect(tiles[next].uid, { toggle: false, range: true });
      focusTile(next);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelect(tile.uid, { toggle: !e.shiftKey, range: e.shiftKey });
    } else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelectAll();
    } else if (e.key === "Escape" && selectionCount > 0) {
      e.preventDefault();
      onClearSelection();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onAction(tile.uid, "remove", e.currentTarget);
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      onAction(tile.uid, e.key === "]" ? "rotate-right" : "rotate-left", e.currentTarget);
    } else if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      menus.current.get(tile.uid)?.open();
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, tile: TileView) {
    if (readOnly || dimmed || tile.status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const native = e.nativeEvent;
    const box = e.currentTarget;
    const moving = tile.selected ? tiles.filter((t) => t.selected).map((t) => t.uid) : [tile.uid];
    void loadDragFor(native).then((m) =>
      m?.beginDrag({
        event: native,
        source: box,
        container: list.current!,
        boxes: () => Array.from(list.current?.querySelectorAll<HTMLElement>("[data-tile-box]") ?? []),
        count: moving.length,
        onLift: () => {
          setDragging(new Set(moving));
          onDragState({ phase: "start", label: tile.label, count: moving.length });
        },
        onDrop: (gap) => {
          setDragging(new Set());
          onDragTo(tile.uid, gap);
        },
        onCancel: () => {
          setDragging(new Set());
          onDragState({ phase: "cancel", label: tile.label, count: moving.length });
        },
      }),
    );
  }

  const insertItems = (gap: number): MenuEntry[] => [
    { id: "files", label: labels.filesHere, onSelect: () => onInsert(gap, "files", null) },
    { id: "pages", label: labels.pagesHere, onSelect: () => onInsert(gap, "pages", null) },
    { id: "blank", label: labels.blankHere, onSelect: () => onInsert(gap, "blank", null) },
  ];

  /** "+" in the gap before (side "start") or after a tile, at the middle of its box. */
  const insertPoint = (gap: number, name: string, tab: number, side: "start" | "end") => (
    <span
      data-no-drag=""
      className={cx(
        "absolute z-10",
        // In the gap, level with the page's middle; below 1024 px level with the label line under the page.
        compact ? "bottom-[76px] translate-y-1/2" : "top-[calc(var(--ip-tile-pad)+var(--ip-thumb-size)*0.7071)] -translate-y-1/2",
        side === "start" ? "-left-1.5 -translate-x-1/2 sm:-left-2" : "-right-1.5 translate-x-1/2 sm:-right-2",
      )}
    >
      <MenuButton
        label={name}
        items={insertItems(gap)}
        tabIndex={tab}
        className={cx(
          "group/ins grid size-11 place-items-center rounded-full outline-none",
          "opacity-0 transition-opacity duration-(--dur-fast) hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
        )}
        data-testid="insert-point"
      >
        <span
          aria-hidden="true"
          className={cx(
            "grid size-(--ip-insert-size) place-items-center rounded-full border-[1.5px] border-brand-tint-border bg-surface-raised text-brand-strong transition-[background-color,transform] duration-(--dur-base)",
            "group-hover/ins:scale-110 group-hover/ins:bg-brand-tint group-focus-visible/ins:bg-brand-tint group-focus-visible/ins:outline-3 group-focus-visible/ins:outline-offset-2 group-focus-visible/ins:outline-focus group-aria-expanded/ins:bg-brand-tint",
          )}
        >
          <PlusIcon size={14} />
        </span>
      </MenuButton>
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <span id="ip-pages-hint" className="sr-only">
        {labels.hint}
      </span>
      <div
        ref={list}
        data-flip-root
        role="list"
        aria-label={labels.list}
        aria-describedby="ip-pages-hint"
        data-settled={settled || undefined}
        className={cx(
          "mp-rise-tiles ip-tile-grid px-2 max-lg:px-3",
          dimmed && "opacity-60 transition-opacity duration-(--dur-base)",
        )}
        data-testid="page-grid"
      >
        {tiles.map((t, i) => {
          const isActive = i === active;
          const tab = isActive ? 0 : -1;
          const badge = formatDelta(t.rotation);
          const count = t.selected ? selectionCount : 1;
          const moreItems: MenuEntry[] = [
            ...(["rotate-right", "remove", "rotate-left"] as const)
              .filter((a) => !rowActions.includes(a))
              .map((a) => ({ id: a, label: a === "remove" ? labels.remove : a === "rotate-left" ? labels.rotateLeft : labels.rotateRight, onSelect: () => onAction(t.uid, a, null) })),
            { id: "duplicate", label: labels.duplicate(count), onSelect: () => onAction(t.uid, "duplicate", null) },
            { id: "move-to", label: labels.moveTo(count), onSelect: () => onAction(t.uid, "move-to", null) },
            { id: "move-earlier", label: labels.moveEarlier, disabled: i === 0, onSelect: () => onAction(t.uid, "move-earlier", null) },
            { id: "move-later", label: labels.moveLater, disabled: i === tiles.length - 1, onSelect: () => onAction(t.uid, "move-later", null) },
            { separator: true },
            { id: "blank-after", label: labels.blankAfter, onSelect: () => onAction(t.uid, "blank-after", null) },
            { id: "pages-after", label: labels.pagesAfter, onSelect: () => onAction(t.uid, "pages-after", null) },
            { id: "files-after", label: labels.filesAfter, onSelect: () => onAction(t.uid, "files-after", null) },
            { separator: true },
            { id: "enlarge", label: labels.enlarge, disabled: t.blank, onSelect: () => onAction(t.uid, "enlarge", null) },
          ];
          const actionButton = (a: "rotate-left" | "rotate-right" | "remove") => (
            <IconButton
              key={a}
              label={a === "remove" ? labels.removeTile(t.label) : a === "rotate-left" ? labels.rotateTileLeft(t.label) : labels.rotateTileRight(t.label)}
              variant="soft"
              tabIndex={tab}
              className="max-lg:size-11"
              icon={
                a === "rotate-left" ? (
                  <RotateLeftIcon size={16} />
                ) : a === "rotate-right" ? (
                  <RotateRightIcon size={16} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                )
              }
              onClick={(e) => onAction(t.uid, a, e.currentTarget)}
            />
          );
          const more = (
            <MenuButton
              ref={(h) => {
                menus.current.set(t.uid, h);
              }}
              label={labels.more(t.label)}
              items={moreItems}
              placement="bottom-end"
              tabIndex={tab}
              className="mp-iconbtn relative before:absolute before:size-11 before:content-[''] max-lg:size-11"
              data-testid="tile-more"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <circle cx="5" cy="12" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="19" cy="12" r="1.75" />
              </svg>
            </MenuButton>
          );
          const selectMark = t.selected ? (
            <span className="mp-tick-in grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white">
              <CheckIcon size={14} />
            </span>
          ) : (
            <span className="size-[22px] rounded-full border-[1.5px] border-field-line bg-surface-raised" />
          );
          return (
            // Page tile (berrypdf.md "Page tiles"): the page fills the tile, its label below in Fredoka; a selected page gets the berry outline and a leaf tick.
            <div key={t.uid} role="listitem" className="group/tile ip-tile relative flex min-w-0 flex-col items-center gap-1.5" data-selected={t.selected || undefined} data-uid={t.uid} data-flip>
              {i === 0 && !readOnly && insertPoint(0, labels.insertStart, tab, "start")}
              <div
                data-tile-box=""
                onPointerDown={(e) => onPointerDown(e, t)}
                className={cx(
                  "ip-no-callout ip-tile__box relative grid touch-pan-y place-items-center rounded-[10px]",
                  "transition-opacity duration-(--dur-base)",
                  dragging.has(t.uid) && "opacity-40 outline-2 outline-offset-2 outline-brand outline-dashed",
                )}
                data-testid="page-tile"
                data-selected={t.selected || undefined}
                data-rotation={t.rotation}
              >
                <span
                  className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard"
                  style={{ ...pageBoxStyle(t.size), transform: pageTransform(t.size, t.rotation) }}
                >
                  {t.blank ? (
                    <span className="absolute inset-2 flex flex-col items-center justify-center gap-1 rounded-sm border-[1.5px] border-dashed border-brand-tint-border text-help text-on-paper-muted">
                      <FileIcon size={24} />
                      {labels.blankName}
                    </span>
                  ) : t.status === "ready" && t.fileId ? (
                    <PageThumb fileId={t.fileId} index={t.sourceIndex} />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-band">
                      {t.status === "locked" ? <LockIcon size={24} className="text-muted" /> : <Spinner size={20} label={t.accessibleName} className="text-brand-strong" />}
                    </span>
                  )}
                </span>
                {t.inserted && <span aria-hidden="true" className="ip-glow pointer-events-none absolute inset-0 rounded-[10px] bg-brand-tint" />}
                <button
                  type="button"
                  data-main=""
                  tabIndex={tab}
                  aria-label={t.accessibleName}
                  aria-pressed={readOnly ? undefined : t.selected}
                  aria-describedby="ip-pages-hint"
                  disabled={t.status !== "ready"}
                  onFocus={() => setActiveUid(t.uid)}
                  onClick={(e) => {
                    if (e.detail === 0) return; // keyboard handled in onKeyDown
                    if (readOnly) onAction(t.uid, "enlarge", e.currentTarget);
                    else onSelect(t.uid, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="absolute inset-0 rounded-[10px] focus-visible:outline-offset-1"
                  data-testid="tile-main"
                />
                {badge && (
                  <span aria-hidden="true" className="pointer-events-none absolute top-1.5 left-1.5 z-[1] rounded-pill bg-surface-raised px-2 py-0.5 font-display text-help font-semibold text-brand-strong tabular-nums shadow-menu">
                    {badge}
                  </span>
                )}
                {t.status === "ready" && !compact && !readOnly && (
                  <span
                    aria-hidden="true"
                    data-no-drag=""
                    onClick={() => onSelect(t.uid, { toggle: true, range: false })}
                    className={cx(
                      "absolute -top-2 -right-2 z-[2] grid size-8 cursor-pointer place-items-center",
                      !t.selected && "opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    {selectMark}
                  </span>
                )}
                {t.status === "ready" && !dimmed && !compact && !readOnly && (
                  <div
                    data-no-drag=""
                    className={cx(
                      "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-lg border-[1.5px] border-sand bg-surface-raised p-1.5 shadow-menu max-sm:bottom-0 max-sm:gap-0 max-sm:border-0 max-sm:bg-surface-raised/90 max-sm:p-0",
                      "opacity-0 transition-opacity duration-(--dur-base) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    {actionButton("rotate-left")}
                    {actionButton("rotate-right")}
                    {actionButton("remove")}
                    {more}
                  </div>
                )}
              </div>
              {compact && !readOnly ? (
                // Below 1024 px nothing sits on the page (PT-1 rule 6): the selection mark and the label
                // share a line (the insert points sit in the gaps at its height), the actions a row below.
                <>
                  <div className="flex h-11 w-full items-center px-4">
                    {t.status === "ready" ? (
                      <span
                        aria-hidden="true"
                        data-no-drag=""
                        onClick={() => onSelect(t.uid, { toggle: true, range: false })}
                        className="grid size-11 shrink-0 cursor-pointer place-items-center"
                        data-testid="tile-select"
                      >
                        {selectMark}
                      </span>
                    ) : (
                      <span className="size-11 shrink-0" />
                    )}
                    <span className="ip-tile__n min-w-0 flex-1 truncate text-center tabular-nums" aria-hidden="true" data-testid="tile-label">
                      {t.label}
                    </span>
                  </div>
                  <div data-no-drag="" className="-mx-1 flex h-11 items-center justify-center" data-testid="tile-row">
                    {t.status === "ready" && !dimmed && (
                      <>
                        {rowActions.map(actionButton)}
                        {more}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <span className="ip-tile__n h-5 tabular-nums" aria-hidden="true" data-testid="tile-label">
                  {t.label}
                </span>
              )}
              {!readOnly && insertPoint(i + 1, labels.insertAfter(t.label), tab, "end")}
            </div>
          );
        })}
        {!readOnly && (
        <div role="listitem" className="flex min-w-0 flex-col" data-flip>
          <MenuButton
            label={labels.addAtEnd}
            items={insertItems(tiles.length)}
            disabled={dimmed}
            className={cx(
              "group/add grid aspect-square w-full place-items-center rounded-tray border-2 border-dashed border-brand-tint-border bg-surface-raised/60 text-brand-strong",
              "transition-[background-color,border-color,transform] duration-(--dur-base) hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint active:translate-y-0 disabled:opacity-50",
            )}
            data-testid="add-tile"
          >
            <span className="flex flex-col items-center gap-1.5 font-display text-[15px] font-semibold">
              <span className="grid size-11 place-items-center rounded-full bg-brand text-white shadow-menu transition-transform duration-(--dur-base) group-hover/add:rotate-90 group-focus-visible/add:rotate-90 motion-reduce:rotate-0">
                <PlusIcon size={20} />
              </span>
              {labels.addTile}
            </span>
          </MenuButton>
        </div>
        )}
      </div>
      {selectionCount > 0 && !dimmed && !readOnly && (
        <div
          role="toolbar"
          aria-label={labels.selectionBar}
          className="mp-rise-in fixed bottom-[calc(var(--ip-dock-actual,0px)+12px)] left-1/2 z-(--ip-z-selbar) flex h-(--ip-selbar-h) -translate-x-1/2 items-center gap-1.5 rounded-panel border-[1.5px] border-sand bg-surface-raised px-2.5 shadow-menu"
          data-testid="selection-bar"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(at + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]?.focus();
            e.preventDefault();
          }}
        >
          <span className="min-w-[6.5rem] px-2 font-display text-[15px] font-semibold text-brand-strong tabular-nums" data-testid="selection-count">
            {labels.selected(selectionCount)}
          </span>
          <IconButton label={labels.rotateSelLeft} variant="soft" icon={<RotateLeftIcon size={18} />} onClick={() => onRotateSelection(-90)} />
          <IconButton label={labels.rotateSelRight} variant="soft" icon={<RotateRightIcon size={18} />} tabIndex={-1} onClick={() => onRotateSelection(90)} />
          <Button variant="soft" aria-label={labels.removeSel} tabIndex={-1} className="ip-bare max-sm:size-11 max-sm:px-0" onClick={onRemoveSelection}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
            <span className="max-sm:hidden">Remove</span>
          </Button>
          <Button variant="plain" aria-label={labels.clearSel} tabIndex={-1} className="max-sm:h-11" onClick={onClearSelection}>
            {labels.clear}
          </Button>
        </div>
      )}
    </div>
  );
}
