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
  // Mint Paper PagePreview: each page sits in a grey tray (20px padding, radius 10) with its number
  // below in grey; the selected scope adds a link-blue outline.
  return (
    <div
      role="listitem"
      className={cx("group/tile mp-tray flex min-w-0 flex-col items-center gap-2 max-sm:p-3", inScope && "outline-2 -outline-offset-2 outline-link")}
      data-page-index={index}
      data-file-id={fileId}
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
          aria-describedby="ip-grid-hint"
          data-tile-button=""
          onFocus={onFocus}
          onClick={onOpen}
          onKeyDown={onKeyDown}
          className="absolute inset-0 rounded-sm"
        />
        {badge && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 z-[1] rounded-md bg-surface-raised px-2 py-0.5 font-ui text-help font-bold text-brand-strong tabular-nums shadow-menu">
            {badge}
          </span>
        )}
        {inScope && (
          <span className="pointer-events-none absolute top-1.5 right-1.5 z-[1] grid size-5 place-items-center rounded-full bg-brand text-on-primary shadow-menu">
            <CheckIcon size={14} strokeWidth={2.5} />
          </span>
        )}
        {actions && !dimmed && (
          <div
            className={cx(
              "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-sm border border-[var(--mp-menu-border)] bg-surface-raised p-1.5 shadow-menu",
              "opacity-0 transition-opacity duration-(--dur-base) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {/* Deviation: muted (4.95:1 on the tray), not the bundle's #767676 (3.91:1 on #eee). */}
      <span className="h-5 text-sm text-muted tabular-nums" aria-hidden="true">
        {index + 1}
      </span>
    </div>
  );
}
