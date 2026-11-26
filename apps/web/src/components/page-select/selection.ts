/**
 * The page selection behind Extract (picked pages) and Delete (marked pages): spec F4/F5 §0a.2,
 * §0a.3, §3a, AC-402 to AC-408, AC-543. Pure functions over an immutable state, unit tested;
 * `usePageSelection` wraps them for the tools.
 *
 * - Clicks change one file; typing in the shared field applies to every file (§3a).
 * - The field follows the grid: after a grid change it shows the canonical list, or is emptied
 *   with the "Differs per file" placeholder when no single list gives every file its pages.
 * - Page indexes are 0-based; the field's text is 1-based.
 */
import { canonicalPageSet, formatPages, parsePageRanges, selectedPages, validatePageRanges, type RangeError } from "@/lib/page-ranges";

export { rangeErrorText } from "./range-errors";

export type SelFile = { id: string; name: string; pageCount: number };
export type PageSets = Record<string, number[]>;
export type QuickPick = "odd" | "even" | "custom";

export type SelectionState = {
  /** Selected pages per file id (0-based, ascending). */
  sets: PageSets;
  /** The range field's text. */
  text: string;
  /** The files' selections can't be written as one list: the field is empty and says so. */
  differs: boolean;
  /** The tile Shift+click and Shift+Space extend from. */
  anchor: { fileId: string; index: number } | null;
  /** Extract's quick pick: odd or even until the next click or edit. */
  pick: QuickPick;
};

export const emptySelection = (): SelectionState => ({ sets: {}, text: "", differs: false, anchor: null, pick: "custom" });

const counts = (files: readonly SelFile[]) => files.map((f) => f.pageCount);
const same = (a: readonly number[] = [], b: readonly number[] = []) => a.length === b.length && a.every((v, i) => v === b[i]);
const allPages = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Selected pages per file for a parsed list (every file reads it against its own length). */
function setsFor(text: string, files: readonly SelFile[]): PageSets | null {
  const parsed = validatePageRanges(text, counts(files));
  if (!parsed.ok) return null;
  return Object.fromEntries(files.map((f) => [f.id, selectedPages(parsed.items, f.pageCount)]));
}

/**
 * The field's text for these sets: one list that gives every file exactly its pages, or
 * `differs` when there is none. One file: its canonical list.
 */
export function textForSets(sets: PageSets, files: readonly SelFile[]): { text: string; differs: boolean } {
  if (files.length <= 1) return { text: formatPages(sets[files[0]?.id] ?? []), differs: false };
  if (files.every((f) => !(sets[f.id]?.length ?? 0))) return { text: "", differs: false };
  const candidates = [...new Set(files.map((f) => formatPages(sets[f.id] ?? [])))];
  // Whole files read best as a keyword-free open list ("1-12" gives a 3-page file all of its pages too).
  if (files.every((f) => (sets[f.id]?.length ?? 0) === f.pageCount)) candidates.unshift(`1-${Math.max(...counts(files))}`);
  for (const text of candidates) {
    if (!text) continue;
    const parsed = parsePageRanges(text);
    if (!parsed.ok) continue;
    if (files.every((f) => same(selectedPages(parsed.items, f.pageCount), sets[f.id]))) return { text, differs: false };
  }
  return { text: "", differs: true };
}

function fromGrid(state: SelectionState, sets: PageSets, files: readonly SelFile[], anchor: SelectionState["anchor"]): SelectionState {
  return { ...state, sets, ...textForSets(sets, files), anchor, pick: "custom" };
}

/** Typing in the field: applies to every file when it parses; an invalid text keeps the tiles as they were. */
export function typeText(state: SelectionState, text: string, files: readonly SelFile[]): SelectionState {
  const sets = setsFor(text, files);
  return { ...state, text, differs: false, pick: "custom", sets: sets ?? state.sets };
}

/** The error the field shows for its text, if any (empty text is fine). */
export function fieldError(text: string, files: readonly SelFile[]): RangeError | null {
  const parsed = validatePageRanges(text, counts(files));
  return parsed.ok ? null : parsed.error;
}

/** On blur: the canonical form (AC-402, AC-455); open ranges and keywords stay with several files. */
export function blurText(state: SelectionState, files: readonly SelFile[]): SelectionState {
  if (state.differs || !state.text.trim() || fieldError(state.text, files)) return state;
  return { ...state, text: canonicalPageSet(state.text, counts(files)) };
}

/** A click (or Space, Enter, Ctrl/Cmd+click) on one tile: toggles that page of that file only. */
export function togglePage(state: SelectionState, files: readonly SelFile[], fileId: string, index: number): SelectionState {
  const cur = state.sets[fileId] ?? [];
  const next = cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index].sort((a, b) => a - b);
  return fromGrid(state, { ...state.sets, [fileId]: next }, files, { fileId, index });
}

/**
 * Shift+click or Shift+Space: every page from the anchor to this one takes the anchor's state
 * (picked or not). Without an anchor in the same file it is a plain toggle.
 */
export function extendTo(state: SelectionState, files: readonly SelFile[], fileId: string, index: number): SelectionState {
  const a = state.anchor;
  if (!a || a.fileId !== fileId) return togglePage(state, files, fileId, index);
  const on = (state.sets[fileId] ?? []).includes(a.index);
  const [from, to] = a.index <= index ? [a.index, index] : [index, a.index];
  const set = new Set(state.sets[fileId] ?? []);
  for (let i = from; i <= to; i++) {
    if (on) set.add(i);
    else set.delete(i);
  }
  return fromGrid(state, { ...state.sets, [fileId]: [...set].sort((x, y) => x - y) }, files, { fileId, index });
}

/** Clear × and Escape in the grid (AC-406). */
export const clearSelection = (state: SelectionState): SelectionState => ({ ...state, sets: {}, text: "", differs: false, anchor: null, pick: "custom" });

/** Ctrl/Cmd+A in Extract's grid: every page of every file. */
export function selectAll(state: SelectionState, files: readonly SelFile[]): SelectionState {
  return fromGrid(state, Object.fromEntries(files.map((f) => [f.id, allPages(f.pageCount)])), files, state.anchor);
}

/** Extract's Odd / Even quick pick: selects them and writes them into the field (AC-452, AC-453). */
export function quickPick(state: SelectionState, files: readonly SelFile[], pick: "odd" | "even"): SelectionState {
  const text = canonicalPageSet(pick, counts(files));
  return { ...state, sets: setsFor(pick, files) ?? {}, text, differs: false, anchor: null, pick };
}

/**
 * After files are added or removed: removed files drop out; a new file takes the field's list
 * when there is one, else nothing.
 */
export function syncFiles(state: SelectionState, files: readonly SelFile[]): SelectionState {
  const fromText = !state.differs && state.text.trim() ? setsFor(state.text, files) : null;
  const sets: PageSets = {};
  let changed = Object.keys(state.sets).some((id) => !files.some((f) => f.id === id));
  for (const f of files) {
    const have = state.sets[f.id];
    if (have) sets[f.id] = have.filter((i) => i < f.pageCount);
    else {
      sets[f.id] = fromText?.[f.id] ?? [];
      changed = true;
    }
  }
  if (!changed) return state;
  const anchor = state.anchor && files.some((f) => f.id === state.anchor!.fileId) ? state.anchor : null;
  return { ...state, sets, anchor };
}

/** Total selected pages over every file. */
export const selectedCount = (state: SelectionState, files: readonly SelFile[]) => files.reduce((n, f) => n + (state.sets[f.id]?.length ?? 0), 0);

export const isSelected = (state: SelectionState, fileId: string, index: number) => (state.sets[fileId] ?? []).includes(index);
