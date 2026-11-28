"use client";
import "./page-decor.css";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { describeDelta, formatDelta } from "@/lib/pdf/rotation";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { cx } from "../ui/cx";
import { TileActions, TileBadge, TileCheck, TileCorner, TileHit, TileLabel, TilePage, TileRow } from "../tile/parts";
import { TrashIcon } from "../ui/icons";
import { pageTurnScale } from "./page-box";
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
      <div className="ip-tile__box relative grid place-items-center" data-testid="page-tile" data-rotation={pendingDelta}>
        <TilePage size={size} rotation={pendingDelta} data-testid="page-visual">
          <PageThumb fileId={fileId} index={index} scale={pageTurnScale(size, pendingDelta)} className={decor?.flip && `ip-flip ip-flip--${decor.flip}`} />
          {decor?.keep && (
            <span
              aria-hidden="true"
              className="ip-keep"
              data-testid="keep-area"
              style={{ left: `${decor.keep.x * 100}%`, top: `${decor.keep.y * 100}%`, width: `${decor.keep.w * 100}%`, height: `${decor.keep.h * 100}%` }}
            />
          )}
        </TilePage>
        <TileHit
          tabIndex={active ? 0 : -1}
          aria-label={label}
          aria-pressed={decor?.pressed}
          aria-describedby="ip-grid-hint"
          data-tile-button=""
          onFocus={onFocus}
          onClick={onOpen}
          onKeyDown={onKeyDown}
        />
        {badge && <TileBadge>{badge}</TileBadge>}
        {inScope ? (
          <TileCorner>
            <TileCheck on pop={!!picked} />
          </TileCorner>
        ) : picked === false ? (
          // Extract: the empty pick ring, on hover / focus from 1024 px (never on touch). A state mark, not a control.
          <TileCorner className="ip-hover-hint">
            <TileCheck on={false} />
          </TileCorner>
        ) : null}
        {marked !== undefined && (
          // Delete: a ghost trash badge on hover from 1024 px (never on touch); solid once marked. A state mark, not a control.
          <TileCorner className={marked ? undefined : "ip-hover-hint"} data-testid={marked ? "marked-badge" : undefined}>
            <span
              className={cx(
                "grid size-[26px] place-items-center rounded-full ring-2 ring-white transition-colors duration-(--motion-micro)",
                marked ? "ip-badge-in bg-danger text-white" : "bg-surface text-danger",
              )}
            >
              <TrashIcon size={15} />
            </span>
          </TileCorner>
        )}
        {corner && !dimmed && !compact && <div className="ip-corner-enlarge absolute right-1 bottom-1 z-10 max-lg:hidden">{corner}</div>}
        {actions && !dimmed && !compact && <TileActions>{actions}</TileActions>}
      </div>
      {/* Page number in Fredoka 600, muted (5.19:1 on the cream work area); Split adds the part. */}
      {/* Below 1024 px a grid with gap marks (Split) gives every tile a 44px number line: the marks sit level with it, off the
          page (PT-1 rule 6). A part's first tile starts the line with its tone dot. */}
      <TileLabel className={compact && numberLine ? "h-11 leading-11" : "h-5"}>
        {part?.first && partDot(part.n)}
        {index + 1}
        {part && <span data-testid="part-label"> · Part {part.n}</span>}
        {/* Delete: the word says it, the danger colour backs it up (never colour alone; no strike across the digit). */}
        {marked && <span data-testid="marked-label"> · To delete</span>}
      </TileLabel>
      {compact && (actions || cornerRow) && (
        <TileRow data-testid="tile-row">
          {!dimmed && (
            <>
              {actions}
              {cornerRow}
            </>
          )}
        </TileRow>
      )}
      {gap}
    </div>
  );
}
