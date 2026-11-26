"use client";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { CloseIcon, EnlargeIcon, LockIcon } from "../ui/icons";
import { Spinner } from "../ui/Spinner";
import { copy } from "./copy";
import { PageTile } from "./PageTile";
import { rowSlots, useTileRow } from "./useTileRow";
import type { LoadedFile, PageDecoration } from "./types";

export type PageActionsRenderer = (file: LoadedFile, index: number, tabIndex: number) => ReactNode;

type TileRef = { fileId: string; index: number };

/**
 * Pages view. One list per file (each a CSS grid), roving tabindex across all
 * tiles: arrows, Home/End, PageUp/PageDown; Enter/Space opens the preview.
 */
export function PageGrid({
  files,
  decorate,
  renderActions,
  onPageKey,
  onRemove,
  onOpen,
  dimmed,
}: {
  files: LoadedFile[];
  decorate: (file: LoadedFile, index: number) => PageDecoration;
  renderActions?: PageActionsRenderer;
  onPageKey?: (file: LoadedFile, index: number, key: string) => boolean;
  onRemove: (file: LoadedFile) => void;
  onOpen: (file: LoadedFile, index: number) => void;
  dimmed?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<TileRef | null>(null);
  const flat: TileRef[] = [];
  for (const f of files) if (f.status === "ready" && f.pages) for (let i = 0; i < f.pageCount; i++) flat.push({ fileId: f.id, index: i });
  const activeIdx = Math.max(0, active ? flat.findIndex((t) => t.fileId === active.fileId && t.index === active.index) : 0);
  const showHeaders = files.length > 1;
  // Below 1024 px the actions go under the page (PT-1 rule 6); Enlarge drops out when the row is full
  // (a tap on the page opens the same preview).
  const { compact, width } = useTileRow(root);
  const withEnlarge = !compact || rowSlots(width + 10) >= 3;

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
        if (onPageKey?.(file, index, e.key)) e.preventDefault();
        return;
    }
    e.preventDefault();
    focusTile(next);
  }

  return (
    <div ref={root} className="flex flex-col gap-4" data-testid="page-grid">
      <span id="ip-grid-hint" className="sr-only">
        Use arrow keys to move between pages.{onPageKey ? " Press [ or ] to rotate the page." : ""}
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
                "ip-tile-grid",
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
                    compact={compact}
                    actions={
                      <>
                        {renderActions?.(file, i, isActive ? 0 : -1)}
                        {withEnlarge && (
                        <IconButton
                          label={`Enlarge page ${i + 1}`}
                          variant="soft"
                          tabIndex={isActive ? 0 : -1}
                          icon={<EnlargeIcon size={16} />}
                          onClick={() => onOpen(file, i)}
                        />
                        )}
                      </>
                    }
                    onFocus={() => setActive({ fileId: file.id, index: i })}
                    onOpen={() => onOpen(file, i)}
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
