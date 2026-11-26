"use client";
import type { KeyboardEvent, ReactNode } from "react";
import { describeDelta, formatDelta } from "@/lib/pdf/rotation";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { cx } from "../ui/cx";
import { CheckIcon } from "../ui/icons";
import { pageBoxStyle, pageTransform } from "./page-box";
import { PageThumb } from "./Thumbnail";

export { pageBoxStyle, pageTransform, TILE_ASPECT } from "./page-box";

export function PageTile({
  fileId,
  index,
  pageCount,
  size,
  pendingDelta,
  inScope,
  actions,
  active,
  onFocus,
  onOpen,
  onKeyDown,
  dimmed,
  compact,
}: {
  fileId: string;
  index: number;
  pageCount: number;
  size: PageSize;
  pendingDelta: number;
  inScope: boolean;
  actions?: ReactNode;
  active: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  dimmed?: boolean;
  /** Below 1024 px: the actions sit in a row under the page, never on it (PT-1 rule 6). */
  compact?: boolean;
}) {
  const badge = formatDelta(pendingDelta);
  const label = `Page ${index + 1} of ${pageCount}, ${describeDelta(pendingDelta)}`;
  // Page tile (berrypdf.md "Page tiles"): the page fills the tile, its number below in Fredoka; a page
  // in the selected scope gets the 2.5px berry outline (and a leaf tick).
  return (
    <div
      role="listitem"
      className="group/tile ip-tile flex min-w-0 flex-col items-center gap-1.5"
      data-selected={inScope ? "" : undefined}
      data-page-index={index}
      data-file-id={fileId}
    >
      <div
        className="ip-tile__box relative grid place-items-center"
        data-testid="page-tile"
        data-rotation={pendingDelta}
      >
        <span
          className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard"
          style={{ ...pageBoxStyle(size), transform: pageTransform(size, pendingDelta) }}
          data-testid="page-visual"
        >
          <PageThumb fileId={fileId} index={index} />
        </span>
        <button
          type="button"
          tabIndex={active ? 0 : -1}
          aria-label={label}
          aria-describedby="ip-grid-hint"
          data-tile-button=""
          onFocus={onFocus}
          onClick={onOpen}
          onKeyDown={onKeyDown}
          className="absolute inset-0 rounded-sm focus-visible:outline-offset-1"
        />
        {badge && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 z-[1] rounded-pill bg-surface-raised px-2 py-0.5 font-display text-help font-semibold text-brand-strong tabular-nums shadow-menu">
            {badge}
          </span>
        )}
        {inScope && (
          <span className="pointer-events-none absolute top-1.5 right-1.5 z-[1] grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white">
            <CheckIcon size={14} />
          </span>
        )}
        {actions && !dimmed && !compact && (
          <div
            className={cx(
              "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-lg border-[1.5px] border-sand bg-surface-raised p-1.5 shadow-menu",
              "opacity-0 transition-opacity duration-(--dur-base) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {/* Page number in Fredoka 600, muted (5.19:1 on the cream work area). */}
      <span className="ip-tile__n h-5 tabular-nums" aria-hidden="true">
        {index + 1}
      </span>
      {compact && (
        <div className="flex h-11 items-center justify-center gap-2.5" data-testid="tile-row">
          {actions && !dimmed ? actions : null}
        </div>
      )}
    </div>
  );
}
