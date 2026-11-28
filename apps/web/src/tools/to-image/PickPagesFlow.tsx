"use client";
import { useRef, type ReactNode } from "react";
import { formatCount as n } from "@/components/page-select/copy";
import { useDebouncedAnnounce } from "@/components/page-select/hooks";
import { usePageSelection } from "@/components/page-select/usePageSelection";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, FlowContext, LoadedFile, PageDecoration, ReadyFile, ToolOutput } from "@/components/tool-flow/types";
import type { FlowTool } from "@/tools/registry";

/** One file's share of the job: the picked pages, or every page when nothing is picked. */
export type PickedSource = { name: string; source: Blob; password?: string; pageCount: number; pages: number[] };

export function pickedSources(files: readonly ReadyFile[], sets: Record<string, number[] | undefined>, anyPicked: boolean): PickedSource[] {
  return files.map((f) => ({
    name: f.name,
    source: f.source,
    password: f.password,
    pageCount: f.pageCount,
    pages: anyPicked ? [...(sets[f.id] ?? [])].sort((a, b) => a - b) : Array.from({ length: f.pageCount }, (_, i) => i),
  }));
}

export const pickCopy = {
  tile: (page: number, total: number) => `Page ${n(page)} of ${n(total)}`,
  status: (k: number, total: number) => (k === total ? `All ${n(total)} pages` : `${n(k)} of ${n(total)} pages`),
  live: (k: number, total: number, verb: string) => (k === 0 ? `All ${n(total)} pages will be ${verb}` : `${n(k)} of ${n(total)} pages picked`),
};

/**
 * The flow of the tools that work on "these pages, or all of them" (PDF to image, Extract images;
 * spec F12 §2, §5): click pages to pick them, Escape clears, Ctrl+A picks all, none picked means all.
 */
/** Where a page stands: its file, and its place among the pages of that file the run will change. */
export type PageSpot = { file: LoadedFile; index: number; order: number; count: number };

export function PickPagesFlow({
  tool,
  verb,
  gridHint,
  primaryLabel,
  run,
  renderOptions,
  renderMore,
  canRun,
  warm,
  decorate,
}: {
  tool: FlowTool;
  /** "converted", "searched": ends the live message "All 12 pages will be …". */
  verb: string;
  gridHint: string;
  primaryLabel?: (pages: number) => string;
  run: (sources: PickedSource[], signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<ToolOutput>;
  renderOptions?: () => ReactNode;
  renderMore?: (ctx: FlowContext) => ReactNode;
  /** Why the run must wait (the status line says it), or true. */
  canRun?: () => true | string;
  /** See ToolFlow `warm`: for a tool whose run is not in the processing worker. */
  warm?: () => void;
  /** Extra marks on a page: `applies` is true when the run will change it (picked, or nothing is picked). */
  decorate?: (applies: boolean, at: PageSpot) => Partial<PageDecoration>;
}) {
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  const s = usePageSelection((state, files) => {
    const picked = files.reduce((k, f) => k + (state.sets[f.id]?.length ?? 0), 0);
    if (files.length) announce(pickCopy.live(picked, files.reduce((k, f) => k + f.pageCount, 0), verb));
  });
  // Nothing picked means every page.
  const pages = s.count || s.total;
  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={(files, signal, onProgress) => {
        const now = s.current();
        return run(pickedSources(files, now.state.sets, now.count > 0), signal, onProgress);
      }}
      canRun={canRun}
      warm={warm}
      onFilesChange={s.onFilesChange}
      onReset={s.reset}
      readyStatus={() => pickCopy.status(pages, s.total)}
      primaryLabel={primaryLabel && (() => primaryLabel(pages))}
      gridHint={gridHint}
      decoratePage={(file, index) => {
        const set = s.state.sets[file.id] ?? [];
        const picked = set.includes(index);
        const all = s.count === 0;
        // The page's place among the pages the run will change in this file (in page order), for tools that count them.
        const spot: PageSpot = { file, index, order: all ? index : set.filter((i) => i < index).length, count: all ? file.pageCount : set.length };
        return { pendingDelta: 0, inScope: picked, picked, pressed: picked, label: pickCopy.tile(index + 1, file.pageCount), ...decorate?.(picked || all, spot) };
      }}
      onTileActivate={(file, index, mods) => s.activate(file.id, index, mods.shift)}
      onPageKey={(_file, _index, key, e) => {
        if (key === "Escape") {
          s.clear();
          return true;
        }
        if ((key === "a" || key === "A") && (e?.ctrlKey || e?.metaKey)) {
          s.selectAll();
          return true;
        }
        return false;
      }}
      renderMore={renderMore}
      renderOptions={renderOptions ?? (() => null)}
    />
  );
}
