"use client";
import dynamic from "next/dynamic";
import type { PageRef } from "@/lib/page-list";
import type { History, HistoryStep, Snapshot } from "./history";

/**
 * Full undo / redo (spec F4/F5 I-10, AC-549, AC-550) for the tools that have it (Organize, Combine &
 * reorder), passed to `usePageWorkspace({ history: fullHistory })`. It is its own module so Merge,
 * which keeps F3's single undo (AC-79), does not ship it (first-load budget, P-12).
 */

/** Repeats the last undone step; null when there is nothing to redo. */
export function redo(h: History, current: readonly PageRef[]): { history: History; pages: readonly PageRef[]; step: HistoryStep } | null {
  const next = h.future[h.future.length - 1];
  if (!next) return null;
  return { history: { past: [...h.past, { pages: current, step: next.step }], future: h.future.slice(0, -1) }, pages: next.pages, step: next.step };
}

/**
 * Forgets the steps that would bring back any of `ids` (so those files can be released). The
 * remaining snapshots are whole lists, so the steps around a dropped one still restore exactly.
 */
export function dropSources(h: History, ids: ReadonlySet<string>): History {
  const keep = (s: Snapshot) => !s.pages.some((p) => p.sourceId !== null && ids.has(p.sourceId));
  return { past: h.past.filter(keep), future: h.future.filter(keep) };
}

const loadButtons = () => import("./HistoryButtons");

export const fullHistory = {
  redo,
  dropSources,
  undoneStep: (step: string) => `Undone: ${step}`,
  redoneStep: (step: string) => `Redone: ${step}`,
  /** Undo│Redo shows only once a step exists, after files are in, so it loads apart from the page. */
  Buttons: dynamic(() => loadButtons().then((m) => m.HistoryButtons), { ssr: false }),
  prefetch: () => void loadButtons(),
};

export type FullHistory = typeof fullHistory;
