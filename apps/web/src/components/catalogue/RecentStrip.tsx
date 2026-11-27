"use client";
import { Button } from "../ui/Button";
import { catalogueCopy as copy } from "./copy";
import { ToolChip } from "./ToolCard";
import type { ToolIndexItem } from "./types";

/** From 1024 px the inline strip (the All tools panel) keeps to one row beside the search: two chips, three from 1536 px. */
const INLINE_MAX = 3;

/**
 * "Recently used" heading, chips and a Clear button. Not rendered when empty.
 * `inline` puts all three on one row (the desktop All tools panel, beside its search).
 */
export function RecentStrip({
  items,
  onClear,
  idPrefix,
  level = 3,
  inline = false,
}: {
  items: ToolIndexItem[];
  onClear: () => void;
  idPrefix: string;
  level?: 2 | 3;
  inline?: boolean;
}) {
  if (!items.length) return null;
  const H = level === 2 ? "h2" : "h3";
  const headingId = `${idPrefix}-recent`;
  if (inline)
    return (
      <section aria-labelledby={headingId} data-testid={`${idPrefix}-recent`} className="flex min-w-0 flex-1 items-center gap-3 max-lg:basis-full">
        <H id={headingId} className="mp-eyebrow shrink-0 px-0 py-1">
          {copy.recentTitle}
        </H>
        {/* Swipes sideways below 1024 px (data-ip-scroll="chips"). From 1024 px only the latest two (three from 1536 px) beside the
            search, on one row (six wrapped into three ragged rows around Clear; UI polish); the home page lists them all. */}
        <ul className="-my-1 flex min-w-0 scroll-px-1.5 gap-2 overflow-x-auto px-1.5 py-1.5 lg:flex-wrap lg:overflow-x-visible" data-ip-scroll="chips">
          {items.map((item, i) => (
            <li key={item.slug} className={i >= INLINE_MAX ? "shrink-0 lg:hidden" : i === INLINE_MAX - 1 ? "shrink-0 lg:max-2xl:hidden" : "shrink-0"}>
              <ToolChip item={item} />
            </li>
          ))}
        </ul>
        <Button variant="plain" aria-label={copy.recentClearLabel} onClick={onClear} className="shrink-0">
          {copy.recentClear}
        </Button>
      </section>
    );
  return (
    <section aria-labelledby={headingId} data-testid={`${idPrefix}-recent`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3">
      {/* Eyebrow in ink: "Recently used" is not a category, so it takes no category hue. */}
      <H id={headingId} className="mp-eyebrow px-0 py-1">
        {copy.recentTitle}
      </H>
      {/* Swipes sideways below 1024 px (no bar, data-ip-scroll="chips"), wraps from 1024 px. 6px of padding (offset by
          negative margins, so nothing moves) keeps the 2+2px focus outline inside the scroller. */}
      <ul className="col-span-2 row-start-2 -mx-1.5 -my-1 flex scroll-px-1.5 gap-2 overflow-x-auto px-1.5 py-1.5 lg:flex-wrap lg:overflow-x-visible" data-ip-scroll="chips">
        {items.map((item) => (
          <li key={item.slug}>
            <ToolChip item={item} />
          </li>
        ))}
      </ul>
      <Button variant="plain" aria-label={copy.recentClearLabel} onClick={onClear} className="col-start-2 row-start-1">
        {copy.recentClear}
      </Button>
    </section>
  );
}
