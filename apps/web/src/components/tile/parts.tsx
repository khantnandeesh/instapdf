"use client";
/**
 * The page tile kit (berrypdf.md "Page tiles", polish rules): every grid of pages or files (Rotate,
 * Split, Extract, Delete, Organize, Merge, Combine, Alternate, the page picker) builds its tiles from
 * these parts, so a fix to a tile lands on every tool at once.
 *
 *   <div role="listitem" className="group/tile ip-tile …">      the tile (the caller's: state, data-*)
 *     <div className="ip-tile__box …">                          the box the page sits in
 *       <TilePage/>                                             the page: paper, page radius, turn
 *       <TileHit/>                                              the hit area: one ring at the page radius
 *       <TileBadge/>                                            top-left pill (turn, letter, "In use");
 *                                                               two or more go in a <TileBadges> row
 *       <TileCorner><TileCheck/></TileCorner>                   top-right mark (tick, pick ring, trash)
 *       <TileRemove/>                                           top-right remove button (file tiles)
 *       <TileActions>…</TileActions>                            the actions pill on the page (from 1024 px)
 *     <TileLabel/>                                              the number or name under the page
 *
 * Concentric corners: the page has --ip-page-radius, its tile that plus the tile padding (tool-flow.css).
 */
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { PageSize } from "@/lib/pdf/pdfjs";
import { pageBoxStyle, pageTransform } from "../tool-flow/page-box";
import { cx } from "../ui/cx";
import { IconButton, type IconButtonProps } from "../ui/IconButton";
import { CheckIcon, CloseIcon } from "../ui/icons";

/** The page: paper with the page radius and shadow, turned by `rotation` (degrees). */
export function TilePage({ size, rotation = 0, className, children, ...rest }: { size: PageSize; rotation?: number } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx("relative block overflow-hidden rounded-(--ip-page-radius) bg-paper shadow-paper transition-transform duration-(--dur-move) ease-standard", className)}
      style={{ ...pageBoxStyle(size), transform: pageTransform(size, rotation) }}
    >
      {children}
    </span>
  );
}

/** The tile's hit area over its whole box; its keyboard ring follows the page radius. */
export const TileHit = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { [data: `data-${string}`]: string | boolean | undefined }>(
  function TileHit({ className, ...rest }, ref) {
    return <button ref={ref} type="button" {...rest} className={cx("absolute inset-0 rounded-(--ip-page-radius) focus-visible:outline-offset-1", className)} />;
  },
);

const BADGE_SPOT = "pointer-events-none absolute top-1.5 left-1.5 z-[1]";

/**
 * A small pill on the page's top-left corner: a turn ("+90°"), a file's letter, "In use".
 * `inline`: one of several in a <TileBadges> row, which holds the corner instead.
 */
export function TileBadge({ children, muted, inline, className, ...rest }: { muted?: boolean; inline?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden={inline ? undefined : "true"}
      {...rest}
      className={cx(
        !inline && BADGE_SPOT,
        "grid h-6 min-w-6 place-items-center rounded-pill bg-surface-raised px-2 font-display text-help font-semibold tabular-nums shadow-menu",
        muted ? "text-muted" : "text-brand-strong",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A row of badges sharing the top-left corner (a file's letter and its turn). */
export function TileBadges({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span aria-hidden="true" {...rest} className={cx(BADGE_SPOT, "flex gap-1", className)}>
      {children}
    </span>
  );
}

/**
 * The top-right corner of the page: a 32px slot centred 18px in from the corner, for the selection tick,
 * Extract's pick ring or Delete's trash mark. With `onToggle` a pointer press there toggles the tile
 * (the hit button carries the state for assistive tech, so the slot itself is aria-hidden).
 * `hint`: shown only on hover or focus (from 1024 px with a mouse); always shown on touch.
 */
export function TileCorner({ children, onToggle, hint, className, ...rest }: { onToggle?: () => void; hint?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      data-no-drag={onToggle ? "" : undefined}
      {...rest}
      onClick={onToggle}
      className={cx(
        "absolute top-0.5 right-0.5 z-[2] grid size-8 place-items-center",
        onToggle ? "cursor-pointer" : "pointer-events-none",
        hint && "opacity-0 transition-opacity duration-(--dur-base) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The remove button on a file tile's top-right corner (from 1024 px; below it the button goes in the
 * row under the page). At rest the corner stays clear: it shows on hover or focus, always on touch.
 */
export function TileRemove({ className, ...rest }: Omit<IconButtonProps, "icon" | "variant">) {
  return (
    <IconButton
      variant="soft"
      data-no-drag=""
      {...rest}
      icon={<CloseIcon size={16} />}
      className={cx(
        "absolute top-0 right-0 z-[2] bg-surface-raised text-brand-strong opacity-0 transition-[background-color,color,transform,opacity] duration-(--dur-fast)",
        "group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        "hover:rotate-90 hover:bg-brand hover:text-white focus-visible:bg-brand focus-visible:text-white motion-reduce:hover:rotate-0",
        className,
      )}
    />
  );
}

/** The selection tick: a leaf disc with a check when on, an empty ring when off. */
export function TileCheck({ on, pop = true }: { on: boolean; pop?: boolean }) {
  return on ? (
    <span className={cx("grid size-[22px] place-items-center rounded-full bg-leaf text-white ring-2 ring-white", pop && "mp-tick-in")}>
      <CheckIcon size={14} />
    </span>
  ) : (
    <span className="size-[22px] rounded-full border-[1.5px] border-field-line bg-surface-raised" />
  );
}

/**
 * The actions pill on the page (from 1024 px; below it the actions go in a row under the page, PT-1
 * rule 6). Shown on hover, focus or while one of its menus is open; always on touch.
 */
export function TileActions({ children, className, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-no-drag=""
      {...rest}
      className={cx(
        "absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-lg border-[1.5px] border-sand bg-surface-raised p-1.5 shadow-menu",
        "max-sm:bottom-0 max-sm:gap-0 max-sm:border-0 max-sm:bg-surface-raised/90 max-sm:p-0",
        "opacity-0 transition-opacity duration-(--dur-base) group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The row under the page below 1024 px (the actions, never on the page; PT-1 rule 6). */
export function TileRow({ children, className, ...rest }: { children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-no-drag="" {...rest} className={cx("flex h-11 items-center justify-center gap-2.5", className)}>
      {children}
    </div>
  );
}

/** The page number or name under the page, in Fredoka, muted. */
export function TileLabel({ children, className, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span aria-hidden="true" {...rest} className={cx("ip-tile__n max-w-full truncate tabular-nums", className)}>
      {children}
    </span>
  );
}
