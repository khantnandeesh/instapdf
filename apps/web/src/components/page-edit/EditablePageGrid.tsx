"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { pageBoxStyle } from "@/components/tool-flow/PageTile";
import { PageThumb } from "@/components/tool-flow/Thumbnail";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, FileIcon, LockIcon, PlusIcon, RotateLeftIcon, RotateRightIcon } from "@/components/ui/icons";
import { MenuButton, type MenuButtonHandle, type MenuEntry } from "@/components/ui/Menu";
import { Spinner } from "@/components/ui/Spinner";
import { formatDelta } from "@/lib/pdf/rotation";
import type { MoveStep, PageSize } from "@/lib/page-list";
import { editCopy as c } from "@/tools/merge/copy-edit";
import { gridColumns, loadDrag, moveStepFor, navTarget } from "./grid-keys";
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
  labels = pageLabels,
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
}: {
  model: ListModel;
  selection: ReadonlySet<string>;
  inserted: ReadonlySet<string>;
  labels?: PageGridLabels;
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
}) {
  const tiles = useMemo(() => buildTiles(model, selection, inserted), [model.pages, model.sources, model.files, selection, inserted]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useRef<HTMLDivElement>(null);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Set<string>>(new Set());
  const menus = useRef(new Map<string, MenuButtonHandle | null>());
  const active = Math.max(0, tiles.findIndex((t) => t.uid === activeUid));
  const narrow = useNarrow();

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
    const step = moveStepFor(e);
    if (step) {
      e.preventDefault(); // Alt+Left is "Back" in some browsers
      onMove(tile.uid, step);
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
    if (dimmed || tile.status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const native = e.nativeEvent;
    const box = e.currentTarget;
    const moving = tile.selected ? tiles.filter((t) => t.selected).map((t) => t.uid) : [tile.uid];
    void loadDrag().then(({ beginDrag }) =>
      beginDrag({
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
        "absolute top-1/2 z-10 -translate-y-1/2",
        side === "start" ? "-left-1.5 -translate-x-1/2 sm:-left-2" : "-right-1.5 translate-x-1/2 sm:-right-2",
      )}
    >
      <MenuButton
        label={name}
        items={insertItems(gap)}
        tabIndex={tab}
        className={cx(
          "group/ins grid size-11 place-items-center rounded-full outline-none",
          "opacity-0 transition-opacity duration-(--ip-duration-fast) hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
        )}
        data-testid="insert-point"
      >
        <span
          aria-hidden="true"
          className={cx(
            "grid size-(--ip-insert-size) place-items-center rounded-full border border-border-strong bg-surface-raised text-fg-muted shadow-sm",
            "group-hover/ins:bg-primary-soft group-hover/ins:text-primary group-focus-visible/ins:bg-primary-soft group-focus-visible/ins:text-primary group-focus-visible/ins:outline-2 group-focus-visible/ins:outline-focus group-aria-expanded/ins:bg-primary-soft group-aria-expanded/ins:text-primary",
          )}
        >
          <PlusIcon size={14} strokeWidth={2.25} />
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
        role="list"
        aria-label={labels.list}
        aria-describedby="ip-pages-hint"
        className={cx("grid grid-cols-2 gap-3 px-2 sm:grid-cols-[repeat(auto-fill,var(--ip-thumb-size))] sm:gap-4", dimmed && "opacity-60")}
        data-testid="page-grid"
      >
        {tiles.map((t, i) => {
          const isActive = i === active;
          const tab = isActive ? 0 : -1;
          const badge = formatDelta(t.rotation);
          const count = t.selected ? selectionCount : 1;
          const moreItems: MenuEntry[] = [
            ...(narrow ? [{ id: "rotate-left", label: labels.rotateLeft, onSelect: () => onAction(t.uid, "rotate-left", null) }] : []),
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
          return (
            <div key={t.uid} role="listitem" className="group/tile relative flex min-w-0 flex-col items-center gap-1" data-uid={t.uid}>
              <div
                data-tile-box=""
                onPointerDown={(e) => onPointerDown(e, t)}
                className={cx(
                  "ip-no-callout relative grid aspect-square w-(--ip-thumb-size) touch-pan-y place-items-center rounded-lg max-sm:w-full",
                  "transition-[opacity,box-shadow] duration-(--ip-duration-fast) group-hover/tile:shadow-md group-focus-within/tile:shadow-md",
                  t.selected && "outline-2 -outline-offset-2 outline-primary",
                  dragging.has(t.uid) && "opacity-40 outline-2 outline-border-strong outline-dashed",
                )}
                data-testid="page-tile"
                data-selected={t.selected || undefined}
                data-rotation={t.rotation}
              >
                <span
                  className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--ip-duration-base) ease-out"
                  style={{ ...pageBoxStyle(t.size), transform: `rotate(${t.rotation}deg)` }}
                >
                  {t.blank ? (
                    <span className="absolute inset-2 flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-strong text-xs text-on-paper-muted">
                      <FileIcon size={24} />
                      {labels.blankName}
                    </span>
                  ) : t.status === "ready" && t.fileId ? (
                    <PageThumb fileId={t.fileId} index={t.sourceIndex} />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-surface-sunken">
                      {t.status === "locked" ? <LockIcon size={24} className="text-fg-muted" /> : <Spinner size={20} label={t.accessibleName} className="text-primary" />}
                    </span>
                  )}
                </span>
                {i === 0 && insertPoint(0, labels.insertStart, tab, "start")}
                {t.inserted && <span aria-hidden="true" className="ip-glow pointer-events-none absolute inset-0 rounded-lg bg-primary-soft" />}
                <button
                  type="button"
                  data-main=""
                  tabIndex={tab}
                  aria-label={t.accessibleName}
                  aria-pressed={t.selected}
                  aria-describedby="ip-pages-hint"
                  disabled={t.status !== "ready"}
                  onFocus={() => setActiveUid(t.uid)}
                  onClick={(e) => {
                    if (e.detail === 0) return; // keyboard handled in onKeyDown
                    onSelect(t.uid, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="absolute inset-0 rounded-lg focus-visible:outline-focus"
                  data-testid="tile-main"
                />
                <span aria-hidden="true" className="pointer-events-none absolute top-1.5 left-1.5 flex gap-1">
                  <span
                    className={cx(
                      "grid h-5 min-w-5 place-items-center rounded-sm px-1 text-xs font-semibold shadow-sm",
                      t.selected ? "bg-primary-soft text-on-primary-soft" : "bg-surface-raised/90 text-fg",
                    )}
                  >
                    {t.label}
                  </span>
                  {badge && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary-soft tabular-nums">{badge}</span>}
                </span>
                {t.status === "ready" && (
                  <span
                    aria-hidden="true"
                    data-no-drag=""
                    onClick={() => onSelect(t.uid, { toggle: true, range: false })}
                    className={cx(
                      "absolute top-1 right-1 grid size-7 cursor-pointer place-items-center",
                      !t.selected && "opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    {t.selected ? (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-on-primary">
                        <CheckIcon size={14} strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span className="size-5 rounded-full border-[1.5px] border-border-strong bg-surface-raised/90" />
                    )}
                  </span>
                )}
                {t.status === "ready" && !dimmed && (
                  <div
                    data-no-drag=""
                    className={cx(
                      "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md bg-surface-raised/90 p-0.5 shadow-md",
                      "opacity-0 transition-opacity duration-(--ip-duration-fast) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    {!narrow && <IconButton label={labels.rotateTileLeft(t.label)} size="sm" tabIndex={tab} className="max-lg:size-11" icon={<RotateLeftIcon size={18} />} onClick={(e) => onAction(t.uid, "rotate-left", e.currentTarget)} />}
                    <IconButton label={labels.rotateTileRight(t.label)} size="sm" tabIndex={tab} className="max-lg:size-11" icon={<RotateRightIcon size={18} />} onClick={(e) => onAction(t.uid, "rotate-right", e.currentTarget)} />
                    <IconButton
                      label={labels.removeTile(t.label)}
                      size="sm"
                      tabIndex={tab}
                      className="max-lg:size-11"
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      }
                      onClick={(e) => onAction(t.uid, "remove", e.currentTarget)}
                    />
                    <MenuButton
                      ref={(h) => {
                        menus.current.set(t.uid, h);
                      }}
                      label={labels.more(t.label)}
                      items={moreItems}
                      placement="bottom-end"
                      tabIndex={tab}
                      className="relative grid size-8 place-items-center rounded-md text-fg before:absolute before:size-11 before:content-[''] hover:bg-surface-sunken max-lg:size-11"
                      data-testid="tile-more"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                        <circle cx="5" cy="12" r="1.75" />
                        <circle cx="12" cy="12" r="1.75" />
                        <circle cx="19" cy="12" r="1.75" />
                      </svg>
                    </MenuButton>
                  </div>
                )}
                {insertPoint(i + 1, labels.insertAfter(t.label), tab, "end")}
              </div>
              <span className="h-5 text-xs font-medium text-fg tabular-nums" aria-hidden="true" data-testid="tile-label">
                {t.label}
              </span>
            </div>
          );
        })}
        <div role="listitem" className="flex min-w-0 flex-col items-center gap-1">
          <MenuButton
            label={labels.addAtEnd}
            items={insertItems(tiles.length)}
            disabled={dimmed}
            className={cx(
              "grid aspect-square w-(--ip-thumb-size) place-items-center rounded-lg border-2 border-dashed border-border-strong bg-surface max-sm:w-full",
              "transition-colors duration-(--ip-duration-fast) hover:border-primary hover:bg-primary-soft",
            )}
            data-testid="add-tile"
          >
            <span className="flex flex-col items-center gap-1 text-sm font-medium">
              <PlusIcon size={24} className="text-primary" />
              {labels.addTile}
            </span>
          </MenuButton>
        </div>
      </div>
      {selectionCount > 0 && !dimmed && (
        <div
          role="toolbar"
          aria-label={labels.selectionBar}
          className="ip-rise-in fixed bottom-[calc(var(--ip-dock-actual,0px)+12px)] left-1/2 z-(--ip-z-selbar) flex h-(--ip-selbar-h) -translate-x-1/2 items-center gap-1 rounded-xl bg-surface-raised px-2 shadow-lg lg:bottom-6 lg:left-[calc(50%-var(--ip-dock-w)/2)]"
          data-testid="selection-bar"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(at + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]?.focus();
            e.preventDefault();
          }}
        >
          <span className="min-w-[7.5rem] px-2 text-sm font-semibold tabular-nums" data-testid="selection-count">
            {labels.selected(selectionCount)}
          </span>
          <IconButton label={labels.rotateSelLeft} icon={<RotateLeftIcon />} onClick={() => onRotateSelection(-90)} />
          <IconButton label={labels.rotateSelRight} icon={<RotateRightIcon />} tabIndex={-1} onClick={() => onRotateSelection(90)} />
          <Button variant="ghost" size="sm" aria-label={labels.removeSel} tabIndex={-1} className="max-sm:h-11" onClick={onRemoveSelection}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
            <span className="max-sm:hidden">Remove</span>
          </Button>
          <Button variant="ghost" size="sm" aria-label={labels.clearSel} tabIndex={-1} className="max-sm:h-11" onClick={onClearSelection}>
            {labels.clear}
          </Button>
        </div>
      )}
    </div>
  );
}

/** True below 640 px (Rotate left moves into the More menu there). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
