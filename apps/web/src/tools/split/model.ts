/**
 * Split's settings as the UI holds them (spec F4/F5 §3b, UI P-5, P-6; AC-420 to AC-439, AC-545).
 * Pure functions, unit tested. The engine (lib/page-plans.ts) turns them into the plan; this
 * module adds the UI rules: four modes, the Custom field, the marks between pages and how a mark
 * switches the mode to Custom.
 *
 * Custom keeps its own field and marks while another mode is chosen, so going back to Custom
 * shows them again; an empty Custom field is one part, the whole file (AC-424, AC-439).
 */
import { canonicalPartList, validatePageRanges, type RangeError } from "@/lib/page-ranges";
import { formatParts, isCut, isMarkVisible, parseCount, planSplit, splitParts, toggleCut, type OutputPlan, type PlanFile, type SplitMode } from "@/lib/page-plans";

import type { SplitState } from "./state";

export { rangeErrorText } from "@/components/page-select/range-errors";
export { clearParts, DEFAULT_N, initialSplit, setKind, setN, typeParts, type SplitKind, type SplitState } from "./state";

const counts = (files: readonly PlanFile[]) => files.map((f) => f.pageCount);

/** What is wrong with the settings, if anything: the N field or the Custom field. */
export function splitProblem(s: SplitState, files: readonly PlanFile[]): { n: true } | { field: RangeError } | null {
  if (s.kind === "everyN") return parseCount(s.nText) === null ? { n: true } : null;
  if (s.kind !== "custom" || s.differs || !s.text.trim()) return null;
  const parsed = validatePageRanges(s.text, counts(files));
  return parsed.ok ? null : { field: parsed.error };
}

/** The mode for files without marks of their own; null while the settings are invalid. */
export function baseMode(s: SplitState, files: readonly PlanFile[]): SplitMode | null {
  switch (s.kind) {
    case "every":
      return { kind: "every" };
    case "spreads":
      return { kind: "spreads" };
    case "everyN": {
      const n = parseCount(s.nText);
      return n === null ? null : { kind: "everyN", n };
    }
    case "custom": {
      if (s.differs || !s.text.trim()) return { kind: "ranges", items: [] };
      const parsed = validatePageRanges(s.text, counts(files));
      return parsed.ok ? { kind: "ranges", items: parsed.items } : null;
    }
  }
}

/** Marks of each file, in Custom mode only. */
function perFileModes(s: SplitState): Record<string, SplitMode> | undefined {
  if (s.kind !== "custom") return undefined;
  return Object.fromEntries(Object.entries(s.perFile).map(([id, parts]) => [id, { kind: "parts", parts } as SplitMode]));
}

/** The parts one file is cut into (0-based page lists, output order), or null while invalid. */
export function partsOf(s: SplitState, file: PlanFile, files: readonly PlanFile[]): number[][] | null {
  const own = s.kind === "custom" ? s.perFile[file.id] : undefined;
  if (own) return splitParts(file.pageCount, { kind: "parts", parts: own });
  const mode = baseMode(s, files);
  return mode ? splitParts(file.pageCount, mode) : null;
}

/** The output plan, or null while the settings are invalid. */
export function splitPlan(s: SplitState, files: readonly PlanFile[], extra: { pattern?: string; renames?: Record<string, string>; date?: Date } = {}): OutputPlan | null {
  const mode = baseMode(s, files);
  if (!mode || !files.length) return null;
  return planSplit(files, { mode, perFile: perFileModes(s), ...extra });
}

/** The Custom field's text for these parts: one list that gives every file its parts, or "differs". */
export function textForParts(perFile: Record<string, number[][]>, files: readonly PlanFile[]): { text: string; differs: boolean } {
  if (files.length <= 1) return { text: formatParts(perFile[files[0]?.id] ?? [], files[0]?.pageCount ?? 0), differs: false };
  const texts = [...new Set(files.map((f) => formatParts(perFile[f.id] ?? [], f.pageCount)))];
  for (const text of texts) {
    const parsed = validatePageRanges(text, counts(files));
    if (!parsed.ok) continue;
    const ok = files.every((f) => JSON.stringify(splitParts(f.pageCount, { kind: "ranges", items: parsed.items })) === JSON.stringify(perFile[f.id] ?? []));
    if (ok) return { text, differs: false };
  }
  return { text: "", differs: true };
}


/** On blur: one part per item, open ranges closed with one file (`10-` → `10-12`). */
export function blurParts(s: SplitState, files: readonly PlanFile[]): SplitState {
  if (s.kind !== "custom" || s.differs || !s.text.trim() || splitProblem(s, files)) return s;
  return { ...s, text: canonicalPartList(s.text, counts(files)) };
}

/**
 * Toggles the mark after page index k of one file (AC-424, AC-425, AC-428). In another mode it
 * first switches to Custom with every file's current parts as their marks. The field is rewritten.
 */
export function toggleMark(s: SplitState, files: readonly PlanFile[], fileId: string, k: number): SplitState {
  const current: Record<string, number[][]> = {};
  for (const f of files) {
    const p = partsOf(s, f, files);
    if (!p) return s;
    current[f.id] = p;
  }
  if (!current[fileId]) return s;
  const perFile = { ...current, [fileId]: toggleCut(current[fileId], k) };
  return { ...s, kind: "custom", perFile, ...textForParts(perFile, files) };
}

export type MarkState = "hidden" | "off" | "on";

/** The mark after page index k: hidden when a page beside it is in no part (§3b). */
export function markAfter(parts: readonly (readonly number[])[] | null, k: number): MarkState {
  if (!parts) return "hidden";
  if (!isMarkVisible(parts, k)) return "hidden";
  return isCut(parts, k) ? "on" : "off";
}

/** What each page of a file shows: its part (1-based, the first that holds it), whether it starts one, or left out. */
export type PagePart = { part: number; first: boolean } | null;

export function pageParts(parts: readonly (readonly number[])[] | null, pageCount: number): PagePart[] {
  const out: PagePart[] = Array.from({ length: pageCount }, () => null);
  if (!parts) return out;
  parts.forEach((p, i) => {
    p.forEach((page, j) => {
      if (page < 0 || page >= pageCount) return;
      if (!out[page]) out[page] = { part: i + 1, first: j === 0 };
    });
  });
  // A page that starts a later part (overlaps) still shows that part's disc.
  parts.forEach((p, i) => {
    const page = p[0];
    if (page !== undefined && out[page] && out[page]!.part !== i + 1 && !out[page]!.first) out[page] = { part: i + 1, first: true };
  });
  return out;
}

/** Distinct source pages the plan uses (the status says "{used} of {total} pages" when some are left out). */
export function pagesUsed(plan: OutputPlan | null): number {
  if (!plan) return 0;
  const seen = new Set<string>();
  for (const d of plan.documents) for (const p of d.pages) seen.add(`${p.sourceId}:${p.sourceIndex}`);
  return seen.size;
}
