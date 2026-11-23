"use client";
import type { KeyboardEvent, ReactNode } from "react";
import { describeDelta, formatDelta } from "@/lib/pdf/rotation";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { cx } from "../ui/cx";
import { CheckIcon } from "../ui/icons";
import { PageThumb } from "./Thumbnail";

/** Page box inside a square: contained so its longest side equals the box. */
export function pageBoxStyle(size: PageSize): { width: string; height: string } {
  const landscape = size.width >= size.height;
  const ratio = landscape ? size.height / size.width : size.width / size.height;
  return landscape ? { width: "100%", height: `${ratio * 100}%` } : { width: `${ratio * 100}%`, height: "100%" };
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
}) {
  const badge = formatDelta(pendingDelta);
  const label = `Page ${index + 1} of ${pageCount}, ${describeDelta(pendingDelta)}`;
  return (
    <div role="listitem" className="group/tile flex min-w-0 flex-col items-center gap-1" data-page-index={index} data-file-id={fileId}>
      <div
        className={cx(
          "ip-paper-lit relative grid aspect-square w-(--ip-thumb-size) place-items-center rounded-lg max-sm:w-full",
          "transition-shadow duration-(--ip-duration-fast) group-hover/tile:shadow-md group-focus-within/tile:shadow-md",
          inScope && "outline-2 -outline-offset-2 outline-accent",
        )}
        data-testid="page-tile"
        data-rotation={pendingDelta}
      >
        <span
          className="ip-paper relative block overflow-hidden shadow-paper transition-[transform,filter] duration-(--ip-duration-base) ease-out"
          style={{ ...pageBoxStyle(size), transform: `rotate(${pendingDelta}deg)` }}
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
          className="absolute inset-0 rounded-lg focus-visible:outline-focus"
        />
        {badge && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 z-[1] rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-semibold text-primary-ink tabular-nums shadow-md">
            {badge}
          </span>
        )}
        {inScope && (
          <span className="pointer-events-none absolute top-1.5 right-1.5 grid size-5 place-items-center z-[1] rounded-full bg-primary text-on-primary shadow-md ring-1 ring-surface-overlay">
            <CheckIcon size={14} strokeWidth={2.5} />
          </span>
        )}
        {actions && !dimmed && (
          <div
            className={cx(
              "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md bg-surface-overlay p-1 shadow-lg",
              "opacity-0 transition-opacity duration-(--ip-duration-fast) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            {actions}
          </div>
        )}
      </div>
      <span className="h-5 text-xs text-fg-muted tabular-nums" aria-hidden="true">
        {index + 1}
      </span>
    </div>
  );
}
