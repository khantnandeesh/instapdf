"use client";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { WorkspaceContext } from "@/components/tool-flow/types";
import { ChevronDownIcon, TrashIcon } from "@/components/ui/icons";
import { MoreIcon, SelectAllIcon } from "@/components/ui/page-tool-icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { reverseRange, sortPages, twoSidedScanPages, type PageRef, type SortKey } from "@/lib/page-list";
import { ORGANIZE_OPTIONS } from "@/lib/pdf/merge-options";
import { organizedName } from "@/lib/pdf/naming";
import { mergeCopy } from "@/tools/merge/copy";
import { fullHistory } from "@/tools/merge/full-history";
import { PlainMenuButton, SortGlyph, toolbarButton, usePageWorkspace } from "@/tools/merge/workspace";
import { AddMenus, EditorDialogs, EditWorkspace, usePrefetchEditing } from "@/tools/merge/editing";
import { flowTool } from "@/tools/registry";
import { organizeCopy as o } from "./copy";

const tool = flowTool("organize-pdf");

/** Select, Sort and Remove: labels from 1280 px, 44 px icon buttons from 768 px, one "Page tools" menu below (spec P-3). */
const menuButton = `${toolbarButton} max-xl:size-11 max-xl:px-0`;

/**
 * Organize (spec F4/F5 §3e): Merge's workspace in pick order, opening in the pages view, with
 * Select ▾ (odd / even positions), Sort ▾ (reverse on a selection, two-sided scan order), Remove ▾,
 * pages from a loaded file, full undo / redo, and no options (fixed ORGANIZE_OPTIONS).
 */
export function OrganizeTool() {
  const ws = usePageWorkspace({ tool, history: fullHistory });
  usePrefetchEditing();
  const { pagesRef, sourcesRef } = ws;

  // ---- Select ▾ (AC-491, AC-492, AC-546): switches to the pages view, where the selection shows ----
  const selectWhere = (w: WorkspaceContext, keep: (p: PageRef, position: number) => boolean) => {
    w.api.setView("pages");
    ws.setSelectionTo(pagesRef.current.filter((p, i) => !p.pending && keep(p, i + 1)).map((p) => p.uid));
  };
  const selectItems = (w: WorkspaceContext): MenuEntry[] => {
    const none = !ws.readyPages.length;
    return [
      { id: "all", label: o.selectAll, disabled: none, onSelect: () => selectWhere(w, () => true) },
      { id: "none", label: o.selectNone, disabled: !ws.selection.size, onSelect: ws.clearSelection },
      { id: "invert", label: o.invert, disabled: none, onSelect: () => selectWhere(w, (p) => !ws.selectionRef.current.has(p.uid)) },
      { separator: true },
      { id: "odd", label: o.odd, ariaLabel: o.oddName, icon: <StripGlyph odd />, disabled: none, onSelect: () => selectWhere(w, (_, i) => i % 2 === 1) },
      { id: "even", label: o.even, ariaLabel: o.evenName, icon: <StripGlyph />, disabled: ws.readyPages.length < 2, onSelect: () => selectWhere(w, (_, i) => i % 2 === 0) },
    ];
  };

  // ---- Sort ▾ (AC-493 to AC-495, AC-547, AC-548) ----
  const sortBy = (key: SortKey) => ws.reorder(sortPages(pagesRef.current, sourcesRef.current, key), "sort", mergeCopy.sorted[key]);
  /** Reverse and two-sided act on the selected positions, or on every page when nothing is selected. */
  const permute = (how: "reverse" | "two-sided") => {
    const sel = ws.selectionRef.current;
    if (sel.size === 1) {
      ws.announce(how === "reverse" ? o.reverseSelectionNeedsTwo : o.twoSidedSelectionNeedsTwo);
      return;
    }
    const list = pagesRef.current;
    ws.reorder(how === "reverse" ? reverseRange(list, sel) : twoSidedScanPages(list, sel), how === "reverse" ? "reverse" : "sort", how === "reverse" ? mergeCopy.sorted.reverse : o.twoSidedDone);
  };
  const sortItems = (): MenuEntry[] => {
    const byName = ws.fileRuns >= 2;
    const reorderable = ws.readyPages.length >= 2;
    const keys = ["name-asc", "name-desc", "date-asc", "date-desc"] as const;
    return [
      ...(byName ? [] : [{ note: mergeCopy.sortNeedsMore }]),
      ...keys.map((k) => ({ id: k, label: mergeCopy.sortItems[k], disabled: !byName, onSelect: () => sortBy(k) })),
      { separator: true as const },
      { id: "reverse", label: mergeCopy.sortItems.reverse, disabled: !reorderable, onSelect: () => permute("reverse") },
      { id: "two-sided", label: o.twoSided, hint: o.twoSidedHint, disabled: !reorderable, onSelect: () => permute("two-sided") },
    ];
  };

  // ---- Remove ▾ (AC-496, AC-497): each removal shows the undo notice ----
  const removeItems = (): MenuEntry[] => {
    const inList = [...new Set(pagesRef.current.flatMap((p) => (p.sourceId && !p.pending ? [p.sourceId] : [])))];
    return [
      { id: "remove-selected", label: o.removeSelected, disabled: !ws.selection.size, onSelect: () => ws.removeUids(pagesRef.current.filter((p) => ws.selectionRef.current.has(p.uid)).map((p) => p.uid), "") },
      ...(inList.length > 1
        ? [
            { separator: true as const },
            ...inList.map((id) => {
              const name = sourcesRef.current[id]?.name ?? "";
              return { id: `keep-${id}`, label: o.keepOnly(name), onSelect: () => ws.removeUids(pagesRef.current.filter((p) => p.sourceId !== id).map((p) => p.uid), "") };
            }),
          ]
        : []),
      { separator: true },
      { id: "remove-all", label: o.removeAll, disabled: !ws.pages.length, onSelect: () => ws.removeUids(pagesRef.current.map((p) => p.uid), "") },
    ];
  };

  // ---- Add pages → From a loaded file (AC-498) ----
  const loadedItems = (): MenuEntry[] => {
    const ids = [...new Set(ws.pages.flatMap((p) => (p.sourceId && !p.pending ? [p.sourceId] : [])))];
    if (!ids.length) return [];
    return [
      { heading: o.fromLoaded },
      ...ids.map((id) => {
        const name = ws.sources[id]?.name ?? "";
        return { id: `loaded-${id}`, label: name, ariaLabel: o.fromLoadedName(name), onSelect: () => ws.openLoadedPicker(id) };
      }),
    ];
  };

  return (
    <>
      <ToolFlow
        tool={tool}
        {...ws.flowProps}
        process={ws.runList(
          () => pagesRef.current,
          () => ORGANIZE_OPTIONS,
          // The first file loaded that still has a page in the output (eval G-6): `sources` keeps the
          // files in load order, so moving, rotating or reversing pages never changes the name.
          (first, used) => organizedName(sourcesRef.current[Object.keys(sourcesRef.current).find((id) => used.includes(id)) ?? ""]?.name ?? first),
        )}
        copyOverrides={{ pickerButton: mergeCopy.pickerButton, pickerHint: mergeCopy.pickerHint, limits: mergeCopy.limits, limitsFull: mergeCopy.limitsFull, statusEmpty: mergeCopy.statusEmpty, errorType: mergeCopy.errorType }}
        readyStatus={() => o.status(ws.readyPages.length, ws.sourceCount)}
        renderWorkspace={(w) => <EditWorkspace ws={ws} w={w} labels={{ pages: { list: o.pagesLabel }, segments: { list: o.filesLabel } }} />}
        toolbarStart={(w) => (
          <>
            <span className="contents max-md:hidden">
              <PlainMenuButton label={o.select} items={selectItems(w)} disabled={w.dimmed} className={menuButton} title={o.select} data-testid="select-menu">
                <SelectAllIcon size={18} />
                <span className="max-xl:sr-only">{o.select}</span>
                <ChevronDownIcon size={16} className="max-xl:hidden" />
              </PlainMenuButton>
              <PlainMenuButton label={o.sort} items={sortItems()} disabled={w.dimmed} className={menuButton} title={o.sort} data-testid="sort-menu">
                <SortGlyph />
                <span className="max-xl:sr-only">{o.sort}</span>
                <ChevronDownIcon size={16} className="max-xl:hidden" />
              </PlainMenuButton>
              <PlainMenuButton label={o.remove} items={removeItems()} disabled={w.dimmed} className={menuButton} title={o.remove} data-testid="remove-menu">
                <TrashIcon size={18} />
                <span className="max-xl:sr-only">{o.remove}</span>
                <ChevronDownIcon size={16} className="max-xl:hidden" />
              </PlainMenuButton>
            </span>
            {/* Below 768 px one menu holds all three, in sections, so the toolbar stays one row (P-3). */}
            <span className="contents md:hidden">
              <PlainMenuButton
                label={o.pageTools}
                items={[{ heading: o.select }, ...selectItems(w), { heading: o.sort }, ...sortItems(), { heading: o.remove }, ...removeItems()]}
                disabled={w.dimmed}
                className={`${toolbarButton} size-11 px-0`}
                title={o.pageTools}
                sheet
                data-testid="page-tools-menu"
              >
                <MoreIcon size={20} />
              </PlainMenuButton>
            </span>
          </>
        )}
        toolbarEnd={(w) => <AddMenus ws={ws} w={w} loaded={loadedItems()} />}
        dockStart={ws.renderHistory}
        // Organize has no options: its output settings are fixed (spec §3e).
        renderOptions={() => null}
      />
      <EditorDialogs ws={ws} />
    </>
  );
}

/** A three-page strip with the odd (or even) positions filled: the Select ▾ glyph (spec P-4, `ScopeIcon` style). */
function StripGlyph({ odd = false }: { odd?: boolean }) {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {[0, 1, 2].map((k) => (
        <rect key={k} x={1 + k * 7} y={2} width={5.5} height={12} rx={1} fill={(k % 2 === 0) === odd ? "currentColor" : "none"} fillOpacity={0.35} />
      ))}
    </svg>
  );
}
