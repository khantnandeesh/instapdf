"use client";
import { Button } from "../ui/Button";
import { catalogueCopy as copy } from "./copy";
import { ToolChip } from "./ToolCard";
import type { ToolIndexItem } from "./types";

/** "Recently used" heading, chips and a Clear button. Not rendered when empty. */
export function RecentStrip({ items, onClear, idPrefix, level = 3 }: { items: ToolIndexItem[]; onClear: () => void; idPrefix: string; level?: 2 | 3 }) {
  if (!items.length) return null;
  const H = level === 2 ? "h2" : "h3";
  const headingId = `${idPrefix}-recent`;
  return (
    <section aria-labelledby={headingId} data-testid={`${idPrefix}-recent`} className="ip-fade-in grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3">
      <H id={headingId} className={level === 2 ? "text-sm font-semibold text-fg-muted" : "text-lg font-semibold"}>
        {copy.recentTitle}
      </H>
      <ul className="col-span-2 row-start-2 -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:thin]">
        {items.map((item) => (
          <li key={item.slug}>
            <ToolChip item={item} />
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" aria-label={copy.recentClearLabel} onClick={onClear} className="col-start-2 row-start-1">
        {copy.recentClear}
      </Button>
    </section>
  );
}
