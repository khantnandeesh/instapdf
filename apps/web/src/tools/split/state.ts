/**
 * Split's settings shape and defaults, without the planner (spec F4/F5 UI P-12: the model and the
 * engine load after hydration). model.ts holds the rules; page-tools.test.ts keeps the defaults
 * equal to the engine's.
 */
export type SplitKind = "every" | "everyN" | "spreads" | "custom";

export type SplitState = {
  kind: SplitKind;
  /** Every N pages: the stepper's text (validated with parseCount). */
  nText: string;
  /** Custom: the field's text, one part per item. */
  text: string;
  /** Custom: parts set by the marks, per file id (0-based page lists). */
  perFile: Record<string, number[][]>;
  /** Custom: the files' parts differ, so the field is empty and says so. */
  differs: boolean;
};

export const DEFAULT_N = "2";
export const initialSplit = (): SplitState => ({ kind: "every", nText: DEFAULT_N, text: "", perFile: {}, differs: false });
/** lib/page-plans SPLIT_PATTERN. */
export const DEFAULT_PATTERN = "{name}-{pages}";

/** The mode control: Custom brings back its own field and marks. */
export const setKind = (s: SplitState, kind: SplitKind): SplitState => ({ ...s, kind });

export const setN = (s: SplitState, nText: string): SplitState => ({ ...s, nText });

/** Typing in the Custom field: one part per item, for every file; marks set before are dropped. */
export const typeParts = (s: SplitState, text: string): SplitState => ({ ...s, kind: "custom", text, perFile: {}, differs: false });

/** Clear parts (×): an empty field, one part per file. */
export const clearParts = (s: SplitState): SplitState => ({ ...s, kind: "custom", text: "", perFile: {}, differs: false });
