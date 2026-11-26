"use client";
import "./page-decor.css";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { describeDelta, formatDelta } from "@/lib/pdf/rotation";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { cx } from "../ui/cx";
import { CheckIcon, TrashIcon } from "../ui/icons";
import { pageBoxStyle, pageTransform } from "./page-box";
import { PageThumb } from "./Thumbnail";
import type { PageDecoration } from "./types";

export { pageBoxStyle, pageTransform, TILE_ASPECT } from "./page-box";

/** The page-tool fields of a decoration (spec F4/F5 UI P-6); Rotate passes none of them. */
export type TileDecor = Omit<PageDecoration, "pendingDelta" | "inScope">;

// Split: a small dot in the part's tone leads the first tile's number line (the label already says
// "Part n"); nothing sits on the page (owner review 2026-11-26).
function partDot(n: number) {
  return <span key={n} aria-hidden="true" data-testid="part-disc" className="ip-part-dot ip-badge-in" />;
}

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
  decor,
  corner,
  cornerRow,
  gap,
  numberLine,
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
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  dimmed?: boolean;
  /** Below 1024 px: the actions sit in a row under the page, never on it (PT-1 rule 6). */
  compact?: boolean;
  /** Page-tool state: part tone and disc, left out, picked, marked; the tile's own name and aria-pressed. */
  decor?: TileDecor;
  /** From 1024 px, drawn in the page box's bottom-right corner instead of the centred actions pill (Enlarge on toggle tiles). */
  corner?: ReactNode;
  /** Below 1024 px the corner control goes in the row under the page instead (PT-1 rule 6, 44px target). */
  cornerRow?: ReactNode;
  /** Drawn in the grid gap after the tile (Split's mark). */
  gap?: ReactNode;
  /** Below 1024 px: the 44px number line the gap marks sit level with (every tile of a grid with marks). */
  numberLine?: boolean;
}) {
  const badge = formatDelta(pendingDelta);
  const label = decor?.label ?? `Page ${index + 1} of ${pageCount}, ${describeDelta(pendingDelta)}`;
  const part = decor?.part;
  const picked = decor?.picked;
  const marked = decor?.marked;
  const decorated = !!decor && (part !== undefined || decor.leftOut !== undefined || picked !== undefined || marked !== undefined);
  // Page tile (berrypdf.md "Page tiles"): the page fills the tile, its number below in Fredoka; a page
  // in the selected scope gets the 2.5px berry outline (and a leaf tick). Page tools add their state as
  // an outline, an overlay or a badge (page-decor.css, PT-1 rule 4a), never a fill or padding.
  return (
    <div
      role="listitem"
      className="group/tile ip-tile relative flex min-w-0 flex-col items-center gap-1.5"
      data-selected={inScope ? "" : undefined}
      data-page-index={index}
      data-file-id={fileId}
      data-decor={decorated ? "" : undefined}
      data-tone={part ? (part.n % 2 === 0 ? "even" : "odd") : undefined}
      data-part={part?.n}
      data-left-out={decor?.leftOut ? "" : undefined}
      data-picked={picked ? "" : undefined}
      data-marked={marked ? "" : undefined}
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
          aria-pressed={decor?.pressed}
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
          <span className={cx("pointer-events-none absolute top-1.5 right-1.5 z-[1] grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white", picked && "ip-badge-in")}>
            <CheckIcon size={14} />
          </span>
        )}
        {picked === false && (
          // Extract: the empty pick ring, on hover / focus (always on touch). A state mark, not a control.
          <span aria-hidden="true" className="ip-hover-hint pointer-events-none absolute top-1.5 right-1.5 z-[1] size-[22px] rounded-full border-[1.5px] border-field-line bg-surface/85" />
        )}
        {marked !== undefined && (
          // Delete: a ghost trash badge on hover (always on touch); solid once marked. A state mark, not a control.
          <span
            aria-hidden="true"
            data-testid={marked ? "marked-badge" : undefined}
            className={cx(
              "pointer-events-none absolute top-1.5 right-1.5 z-[1] grid size-[26px] place-items-center rounded-full ring-2 ring-white transition-colors duration-(--motion-micro)",
              marked ? "ip-badge-in bg-danger text-white" : "ip-hover-hint bg-surface text-danger shadow-menu",
            )}
          >
            <TrashIcon size={15} />
          </span>
        )}
        {corner && !dimmed && !compact && <div className="ip-corner-enlarge absolute right-1 bottom-1 z-10 max-lg:hidden">{corner}</div>}
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
      {/* Page number in Fredoka 600, muted (5.19:1 on the cream work area); Split adds the part. */}
      {/* Below 1024 px a grid with gap marks (Split) gives every tile a 44px number line: the marks sit level with it, off the
          page (PT-1 rule 6). A part's first tile starts the line with its tone dot. */}
      <span className={cx("ip-tile__n max-w-full truncate tabular-nums", compact && numberLine ? "h-11 leading-11" : "h-5")} aria-hidden="true">
        {part?.first && partDot(part.n)}
        {index + 1}
        {part && <span data-testid="part-label"> · Part {part.n}</span>}
      </span>
      {compact && (actions || cornerRow) && (
        <div className="flex h-11 items-center justify-center gap-2.5" data-testid="tile-row">
          {!dimmed && (
            <>
              {actions}
              {cornerRow}
            </>
          )}
        </div>
      )}
      {gap}
    </div>
  );
}
