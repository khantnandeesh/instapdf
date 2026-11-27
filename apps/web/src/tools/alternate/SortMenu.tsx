"use client";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { sortPages } from "@/lib/page-list";
import { PlainMenuButton, SortGlyph, toolbarButton, type PageWorkspace } from "@/tools/merge/workspace";
import { cardCopy as a } from "./copy-card";

/**
 * Sort ▾: name order of the cards (AC-529). It is in the tools row, drawn only once a file is in, so it
 * loads apart from the route (first-load budget, P-12).
 */
export function SortMenu({ ws, disabled }: { ws: PageWorkspace; disabled: boolean }) {
  const items: MenuEntry[] = (["name-asc", "name-desc"] as const).map((k) => ({
    id: k,
    label: a.sortItems[k],
    disabled: ws.fileRuns < 2,
    onSelect: () => ws.reorder(sortPages(ws.pagesRef.current, ws.sourcesRef.current, k), "sort", a.sorted[k]),
  }));
  return (
    <PlainMenuButton label={a.sort} items={ws.segments.length < 2 ? [{ note: a.sortNeedsMore }, ...items] : items} disabled={disabled} className={toolbarButton} title={a.sort} data-testid="sort-menu">
      <SortGlyph />
      <span className="max-md:sr-only">{a.sort}</span>
      <ChevronDownIcon size={16} className="max-md:hidden" />
    </PlainMenuButton>
  );
}
