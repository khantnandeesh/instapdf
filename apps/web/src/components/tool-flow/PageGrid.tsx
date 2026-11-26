"use client";
import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { CloseIcon, EnlargeIcon, LockIcon } from "../ui/icons";
import { Spinner } from "../ui/Spinner";
import { copy } from "./copy";
import { PageTile } from "./PageTile";
import type { LoadedFile, PageDecoration } from "./types";

export type PageActionsRenderer = (file: LoadedFile, index: number, tabIndex: number) => ReactNode;
/** Page-tool hooks (spec F4/F5 UI P-4): a tile click that toggles instead of opening the preview. */
export type TileActivate = (file: LoadedFile, index: number, mods: { shift: boolean }) => void;
/** Tile keyboard shortcuts; return true when handled. `e` carries the modifiers (Ctrl/Cmd+A, Shift+Space). */
export type PageKeyHandler = (file: LoadedFile, index: number, key: string, e?: KeyboardEvent) => boolean;

type TileRef = { fileId: string; index: number };

/**
 * Pages view. One list per file (each a CSS grid), roving tabindex across all
 * tiles: arrows, Home/End, PageUp/PageDown; Enter/Space opens the preview, or
 * toggles the page when the tool passes `onTileActivate` (Extract, Delete).
 */
export function PageGrid({
  files,
  decorate,
  renderActions,
  onPageKey,
  onRemove,
  onOpen,
  dimmed,
  onTileActivate,
  renderGap,
  gridHint,
}: {
  files: LoadedFile[];
  decorate: (file: LoadedFile, index: number) => PageDecoration;
  renderActions?: PageActionsRenderer;
  onPageKey?: PageKeyHandler;
  onRemove: (file: LoadedFile) => void;
  onOpen: (file: LoadedFile, index: number) => void;
  dimmed?: boolean;
  /** Replaces "open the preview" on the tile (click, Enter, Space); Enlarge then sits in the tile's corner. */
  onTileActivate?: TileActivate;
  /** Drawn in the grid gap after a tile, reachable by Tab after the tile's Enlarge (Split's marks). */
  renderGap?: (file: LoadedFile, index: number, tabIndex: number) => ReactNode;
  /** Replaces the grid's keyboard hint after "Use arrow keys to move between pages." */
  gridHint?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<TileRef | null>(null);
  const flat: TileRef[] = [];
  for (const f of files) if (f.status === "ready" && f.pages) for (let i = 0; i < f.pageCount; i++) flat.push({ fileId: f.id, index: i });
  const activeIdx = Math.max(0, active ? flat.findIndex((t) => t.fileId === active.fileId && t.index === active.index) : 0);
  const showHeaders = files.length > 1;

  function columns(): number {
    const list = root.current?.querySelector<HTMLElement>("[role=list]");
    if (!list) return 1;
    return Math.max(1, getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length);
  }

  function focusTile(i: number) {
    const t = flat[Math.max(0, Math.min(flat.length - 1, i))];
    if (!t) return;
    setActive(t);
    const el = root.current?.querySelector<HTMLButtonElement>(`[data-file-id="${t.fileId}"][data-page-index="${t.index}"] [data-tile-button]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, file: LoadedFile, index: number) {
    const cur = flat.findIndex((t) => t.fileId === file.id && t.index === index);
    const cols = columns();
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight": next = cur + 1; break;
      case "ArrowLeft": next = cur - 1; break;
      case "ArrowDown": next = cur + cols; break;
      case "ArrowUp": next = cur - cols; break;
      case "Home": next = 0; break;
      case "End": next = flat.length - 1; break;
      case "PageDown": next = cur + cols * 3; break;
      case "PageUp": next = cur - cols * 3; break;
      default:
        if (onPageKey?.(file, index, e.key, e)) {
          e.preventDefault();
          return;
        }
        if (onTileActivate && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onTileActivate(file, index, { shift: e.shiftKey });
        }
        return;
    }
    e.preventDefault();
    focusTile(next);
  }

  // Enlarge sits in the tile's corner when it is the tile's only action (spec F4/F5 UI P-4): toggle
  // tiles (Extract, Delete) and tools without page actions (Split). Rotate keeps its actions pill.
  const corner = !!onTileActivate || !renderActions;
  const enlarge = (file: LoadedFile, i: number, isActive: boolean, inCorner = false) => (
    <IconButton
      label={`Enlarge page ${i + 1}`}
      variant={inCorner ? "raised" : "soft"}
      tabIndex={isActive ? 0 : -1}
      icon={<EnlargeIcon size={16} />}
      className={inCorner ? "size-9 bg-surface-raised shadow-menu" : undefined}
      onClick={() => onOpen(file, i)}
    />
  );

  return (
    <div ref={root} className="flex flex-col gap-4" data-testid="page-grid">
      <span id="ip-grid-hint" className="sr-only">
        Use arrow keys to move between pages.{gridHint !== undefined ? (gridHint ? ` ${gridHint}` : "") : onPageKey ? " Press [ or ] to rotate the page." : ""}
      </span>
      {files.map((file) => (
        <section key={file.id} aria-label={showHeaders ? file.name : undefined}>
          {(showHeaders || file.status !== "ready") && (
            <div className="mb-2 flex h-10 items-center gap-2">
              {file.status === "loading" && <Spinner size={16} label={`Reading ${file.name}`} className="text-brand-strong" />}
              {file.status === "locked" && <LockIcon size={16} className="text-muted" />}
              <span className="min-w-0 truncate font-bold text-ink" title={file.name}>
                {file.status === "loading" ? copy.reading(file.name) : file.name}
              </span>
              <span className="shrink-0 text-sm text-muted tabular-nums">
                {file.status === "ready" ? `· ${copy.pages(file.pageCount)}` : file.status === "locked" ? "· Password needed" : ""}
              </span>
              {showHeaders && (
                <IconButton
                  label={`Remove ${file.name}`}
                  size="sm"
                  className="ms-auto"
                  icon={<CloseIcon size={18} />}
                  onClick={() => onRemove(file)}
                />
              )}
            </div>
          )}
          {file.status === "ready" && file.pages && (
            <div
              role="list"
              aria-label={showHeaders ? `Pages of ${file.name}` : "Pages"}
              className={cx(
                "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,calc(var(--ip-thumb-size)+40px))] sm:gap-5",
                // Split's marks sit in the gaps (--ip-grid-gap, the same values): px-2 keeps the last
                // column's mark inside the grid (spec F4/F5 UI P-6, "Mark geometry").
                renderGap && "px-2 [--ip-grid-gap:12px] sm:[--ip-grid-gap:20px]",
                dimmed && "opacity-60 transition-opacity duration-(--dur-base)",
              )}
            >
              {file.pages.map((size, i) => {
                const d = decorate(file, i);
                const isActive = flat[activeIdx]?.fileId === file.id && flat[activeIdx]?.index === i;
                return (
                  <PageTile
                    key={i}
                    fileId={file.id}
                    index={i}
                    pageCount={file.pageCount}
                    size={size}
                    pendingDelta={d.pendingDelta}
                    inScope={d.inScope}
                    active={isActive}
                    dimmed={dimmed}
                    decor={d}
                    actions={
                      corner ? undefined : (
                        <>
                          {renderActions?.(file, i, isActive ? 0 : -1)}
                          {enlarge(file, i, isActive)}
                        </>
                      )
                    }
                    corner={corner ? enlarge(file, i, isActive, true) : undefined}
                    // Below 1024 px nothing is drawn over the page (berrypdf.md "Page tiles", PT-1 rule 6):
                    // a toggle tile's Enlarge moves to the row under the page; Split's tile opens the preview itself.
                    cornerRow={onTileActivate ? enlarge(file, i, isActive) : undefined}
                    gap={renderGap?.(file, i, isActive ? 0 : -1)}
                    onFocus={() => setActive({ fileId: file.id, index: i })}
                    onOpen={(e: MouseEvent<HTMLButtonElement>) => {
                      if (!onTileActivate) return onOpen(file, i);
                      // Keyboard clicks (detail 0) are handled in onKeyDown, with their Shift state.
                      if (e.detail === 0) return;
                      onTileActivate(file, i, { shift: e.shiftKey });
                    }}
                    onKeyDown={(e) => onKeyDown(e, file, i)}
                  />
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
