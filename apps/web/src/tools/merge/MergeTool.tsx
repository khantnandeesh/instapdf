"use client";
import { useEffect, useState } from "react";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { reverseSegments, sortByName, sortPages, type SortKey } from "@/lib/page-list";
import { changedCount, defaultMergeOptions, MERGE_OPTIONS_KEY, parseMergeOptions, type MergeOptions as Options } from "@/lib/pdf/merge-options";
import { mergedName } from "@/lib/pdf/naming";
import { flowTool } from "@/tools/registry";
import { mergeCopy as c } from "./copy";
import { MergeOptions } from "./MergeOptions";
import { fullHistory } from "./full-history";
import { MenuButton, SortGlyph, toolbarButton, usePageWorkspace } from "./workspace";
import { AddMenus, EditorDialogs, EditWorkspace, usePrefetchEditing } from "./editing";

/** The routes that run Merge (spec F4/F5 §3f): Combine & reorder is Merge on its own route. */
export type MergeSlug = "merge-pdf" | "combine-reorder-pdf";

/**
 * Merge, and Combine & reorder (the same tool opening in the pages view, spec F4/F5 §3f). Both
 * have full undo / redo (I-10, AC-549, AC-550; F3 AC-79's undo notice stays) and remember their
 * options in the same place (`berrypdf:merge-options`).
 */
export function MergeTool({ slug = "merge-pdf" }: { slug?: MergeSlug }) {
  const tool = flowTool(slug);
  const ws = usePageWorkspace({ tool, history: fullHistory });
  usePrefetchEditing();
  const [options, setOptions] = useState<Options>(defaultMergeOptions);

  // ---- options, remembered on this device (AC-42, AC-512) ----
  useEffect(() => {
    try {
      setOptions(parseMergeOptions(localStorage.getItem(MERGE_OPTIONS_KEY)));
    } catch {}
  }, []);
  const changeOptions = (next: Options) => {
    setOptions(next);
    try {
      localStorage.setItem(MERGE_OPTIONS_KEY, JSON.stringify(next));
    } catch {}
  };

  const sortBy = (key: SortKey | "reverse") => {
    const list = ws.pagesRef.current;
    ws.reorder(key === "reverse" ? reverseSegments(list) : sortPages(list, ws.sourcesRef.current, key), key === "reverse" ? "reverse" : "sort", c.sorted[key]);
  };
  const keys = ["name-asc", "name-desc", "date-asc", "date-desc"] as const;
  const sortItems: MenuEntry[] =
    ws.segments.length < 2
      ? [{ note: c.sortNeedsMore }, ...keys.map((k) => ({ id: k, label: c.sortItems[k], disabled: true, onSelect: () => {} })), { separator: true as const }, { id: "reverse", label: c.sortItems.reverse, disabled: true, onSelect: () => {} }]
      : [...keys.map((k) => ({ id: k, label: c.sortItems[k], onSelect: () => sortBy(k) })), { separator: true as const }, { id: "reverse", label: c.sortItems.reverse, onSelect: () => sortBy("reverse") }];

  const changed = changedCount(options);
  return (
    <>
      <ToolFlow
        tool={tool}
        {...ws.flowProps}
        process={ws.runList(
          () => ws.pagesRef.current,
          () => options,
          mergedName,
        )}
        sortIntake={(list) => sortByName(list)}
        optionsBadge={changed ? c.changed(changed) : undefined}
        copyOverrides={{ pickerButton: c.pickerButton, pickerHint: c.pickerHint, limits: c.limits, limitsFull: c.limitsFull, statusEmpty: c.statusEmpty, errorType: c.errorType }}
        readyStatus={() => c.status(ws.readyPages.length, ws.sourceCount)}
        renderWorkspace={(w) => <EditWorkspace ws={ws} w={w} />}
        toolbarStart={(w) => (
          <MenuButton label={c.sort} items={sortItems} disabled={w.dimmed} className={toolbarButton} title={c.sort} data-testid="sort-menu">
            <SortGlyph />
            <span className="max-md:sr-only">{c.sort}</span>
            <ChevronDownIcon size={16} className="max-md:hidden" />
          </MenuButton>
        )}
        toolbarEnd={(w) => <AddMenus ws={ws} w={w} />}
        dockStart={ws.renderHistory}
        renderOptions={(ctx) => <MergeOptions value={options} onChange={changeOptions} announce={ctx.announce} />}
      />
      <EditorDialogs ws={ws} />
    </>
  );
}
