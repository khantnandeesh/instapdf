/**
 * Undo / redo for the page workspace (spec F4/F5 I-10, AC-549, AC-550). The page list is
 * immutable, so the history is two stacks of whole lists: `past` holds the list before each step,
 * `future` the list each undone step had made. Pure functions, unit tested (history.test.ts).
 */
import type { PageRef } from "@/lib/page-list";

/** What a step did, as the live region names it ("Undone: rotate"). */
export type HistoryStep = "move" | "rotate" | "duplicate" | "blank page" | "remove" | "sort" | "reverse" | "add files" | "add pages";

export type Snapshot = { pages: readonly PageRef[]; step: HistoryStep };
export type History = { past: readonly Snapshot[]; future: readonly Snapshot[] };

/** At least 50 steps are kept (AC-550); the oldest go first. */
export const HISTORY_LIMIT = 100;

export const emptyHistory: History = { past: [], future: [] };

/** A new edit: `before` is the list it replaced. Any redo steps are dropped. */
export function record(h: History, before: readonly PageRef[], step: HistoryStep, limit = HISTORY_LIMIT): History {
  const past = [...h.past, { pages: before, step }];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

/** Steps back once from `current`; null when there is nothing to undo. */
export function undo(h: History, current: readonly PageRef[]): { history: History; pages: readonly PageRef[]; step: HistoryStep } | null {
  const last = h.past[h.past.length - 1];
  if (!last) return null;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, { pages: current, step: last.step }] }, pages: last.pages, step: last.step };
}

/** Every source file a step could bring back (those files must stay loaded). */
export function referencedSources(h: History): Set<string> {
  const ids = new Set<string>();
  for (const s of [...h.past, ...h.future]) for (const p of s.pages) if (p.sourceId) ids.add(p.sourceId);
  return ids;
}

/**
 * A restored list may hold placeholders of files that were still loading when it was saved.
 * `expand` gives each placeholder's pages now: the pages (file ready), null (still loading: keep
 * the placeholder) or [] (the file failed or is gone: drop it).
 */
export function materialize(pages: readonly PageRef[], expand: (placeholder: PageRef) => readonly PageRef[] | null): PageRef[] {
  return pages.flatMap((p) => {
    if (!p.pending) return [p];
    const real = expand(p);
    return real === null ? [p] : [...real];
  });
}
