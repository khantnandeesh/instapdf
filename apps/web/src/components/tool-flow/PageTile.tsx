"use client";
import "./page-decor.css";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { describeDelta, formatDelta } from "@/lib/pdf/rotation";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { cx } from "../ui/cx";
import { CheckIcon, TrashIcon } from "../ui/icons";
import { PageThumb } from "./Thumbnail";
import type { PageDecoration } from "./types";

/** Page box inside a square: contained so its longest side equals the box. */
export function pageBoxStyle(size: PageSize): { width: string; height: string } {
  const landscape = size.width >= size.height;
  const ratio = landscape ? size.height / size.width : size.width / size.height;
  return landscape ? { width: "100%", height: `${ratio * 100}%` } : { width: `${ratio * 100}%`, height: "100%" };
}

/** The page-tool fields of a decoration (spec F4/F5 UI P-6); Rotate passes none of them. */
export type TileDecor = Omit<PageDecoration, "pendingDelta" | "inScope">;

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
  decor,
  corner,
  cornerRow,
  gap,
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
  /** Page-tool state: part tone and disc, left out, picked, marked; the tile's own name and aria-pressed. */
  decor?: TileDecor;
  /** Drawn in the page box's bottom-right corner instead of the centred actions pill (Enlarge on toggle tiles). */
  corner?: ReactNode;
  /** Below 1024 px the corner control goes here instead, in the row under the page (44px target). */
  cornerRow?: ReactNode;
  /** Drawn in the grid gap after the tile (Split's mark). */
  gap?: ReactNode;
}) {
  const badge = formatDelta(pendingDelta);
  const label = decor?.label ?? `Page ${index + 1} of ${pageCount}, ${describeDelta(pendingDelta)}`;
  const part = decor?.part;
  const picked = decor?.picked;
  const marked = decor?.marked;
  const decorated = !!decor && (part !== undefined || decor.leftOut !== undefined || picked !== undefined || marked !== undefined);
  // BerryPDF PagePreview: each white page sits in a pink tray (14px radius) with its page number
  // below in Fredoka; a page in the selected scope gets the 2.5px berry ring (and a leaf tick).
  // Page tools add their state as an outline, an overlay or a badge (page-decor.css), never padding.
  return (
    <div
      role="listitem"
      className="group/tile mp-tray relative flex min-w-0 flex-col items-center gap-2 max-sm:p-3"
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
        className="relative grid aspect-square w-(--ip-thumb-size) place-items-center max-sm:w-full"
        data-testid="page-tile"
        data-rotation={pendingDelta}
      >
        <span
          className="relative block overflow-hidden bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard"
          style={{ ...pageBoxStyle(size), transform: `rotate(${pendingDelta}deg)` }}
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
          className="absolute inset-0 rounded-sm focus-visible:outline-offset-3"
        />
        {badge && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 z-[1] rounded-pill bg-surface-raised px-2 py-0.5 font-display text-help font-semibold text-brand-strong tabular-nums shadow-menu">
            {badge}
          </span>
        )}
        {part?.first && (
          // Split: the part number on the first tile of each part (the mp-step__n look).
          <span
            key={part.n}
            aria-hidden="true"
            data-testid="part-disc"
            className="ip-badge-in pointer-events-none absolute top-1.5 left-1.5 z-[1] grid size-(--ip-part-disc) place-items-center rounded-full bg-brand-soft font-display text-[13px] leading-none font-semibold text-brand-strong tabular-nums ring-2 ring-white"
          >
            {part.n}
          </span>
        )}
        {inScope && (
          <span className={cx("pointer-events-none absolute top-1.5 right-1.5 z-[1] grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white", picked && "ip-badge-in")}>
            <CheckIcon size={14} />
          </span>
        )}
        {picked === false && (
          // Extract: the empty pick ring, on hover / focus (always on touch).
          <span aria-hidden="true" className="ip-hover-hint pointer-events-none absolute top-1.5 right-1.5 z-[1] size-[22px] rounded-full border-[1.5px] border-field-line bg-surface/85" />
        )}
        {marked !== undefined && (
          // Delete: a ghost trash badge on hover (always on touch); solid once marked.
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
        {corner && !dimmed && <div className="ip-corner-enlarge absolute right-1 bottom-1 z-10 max-lg:hidden">{corner}</div>}
        {actions && !dimmed && (
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
      {/* Page number in Fredoka 600, muted (4.85:1 on the tray); Split adds the part, in the same colour. */}
      <div className={cx("flex w-full min-w-0 items-center justify-center", !!cornerRow && !dimmed && "max-lg:justify-between max-lg:ps-2")}>
        <span className="mp-tray__n ip-tile__n h-5 truncate tabular-nums" aria-hidden="true">
          {index + 1}
          {part && <span data-testid="part-label"> · Part {part.n}</span>}
        </span>
        {cornerRow && !dimmed && <span className="lg:hidden">{cornerRow}</span>}
      </div>
      {gap}
    </div>
  );
}
