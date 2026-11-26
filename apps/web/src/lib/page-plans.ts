/**
 * Output plans for the page tools (spec F4/F5 §3b to §3g, §6, I-9). Pure
 * functions, unit tested: each maps the loaded files and the tool's settings
 * to the documents to write, each a list of (source, page index, rotation).
 * The UI shows the plan (parts list, counts, names) and hands the same plan
 * to the worker (`documentsJob` in lib/pdf/jobs.ts), so the preview and the
 * download always agree.
 *
 * Page indexes are 0-based; page numbers in names and text are 1-based.
 */
import { formatPages, resolveItem, runsOf, selectedPages, type RangeItem } from "./page-ranges";
import { customName, DELETE_ZIP, EXTRACT_ZIP, mixedName, patternName, pdfOutputName, splitZipName, uniqueNames } from "./pdf/naming";

export type PlanFile = { id: string; name: string; pageCount: number };

/** One page of an output: the same shape as Merge's page input. */
export type PlannedPage = { sourceId: string; sourceIndex: number; rotation: number };

export type PlannedDocument = {
  /** Final file name (unique within the run). */
  name: string;
  pages: PlannedPage[];
  /** The input this document comes from. */
  sourceId: string;
  /** Source page numbers it holds, for the parts list: "1-4", "5", "1, 3, 5". */
  range: string;
  /** Stable key for renaming a part: input id + its pages. */
  key: string;
};

export type FileRef = { sourceId: string; name: string };

export type OutputPlan = {
  documents: PlannedDocument[];
  /** One document downloads as that PDF; two or more as one ZIP. */
  download: { kind: "pdf" | "zip"; name: string };
  /** Inputs that give no output (Extract: nothing selected there; Split: no part in range). */
  skipped: FileRef[];
  /** Delete: inputs with every page marked. The run must not start while any is listed. */
  blocked: FileRef[];
};

export const SPLIT_PATTERN = "{name}-{pages}";
export const EXTRACT_PATTERN = "{name}";
export const MAX_COUNT = 9999;

/**
 * A whole number from 1 to `max` typed in a count field (Split's N, Alternate's
 * pages per turn), or null for 0, negatives, decimals, empty or other text.
 */
export function parseCount(text: string, max = MAX_COUNT): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= max ? n : null;
}

/**
 * Guards for every planner entry (the UI parses its fields, but a plan must
 * never loop forever or write an empty or misnamed file on bad numbers).
 * A page count that is not a whole number of 0 or more reads as 0 pages.
 */
const pagesIn = (count: number) => (Number.isSafeInteger(count) && count > 0 ? count : 0);
/** A count setting (Split's N, pages per turn): a whole number of 1 or more, else null. */
const countOf = (n: number | undefined) => (n !== undefined && Number.isSafeInteger(n) && n >= 1 ? n : null);
/** A page index usable in a file of `pageCount` pages. */
const isPageIn = (i: number, pageCount: number) => Number.isInteger(i) && i >= 0 && i < pagesIn(pageCount);
const allPages = (count: number) => Array.from({ length: pagesIn(count) }, (_, i) => i);
const page = (sourceId: string, sourceIndex: number): PlannedPage => ({ sourceId, sourceIndex, rotation: 0 });

/** "1-4", "5", or runs joined with "_" for a page set that is not one run ("1_3_5"): the {pages} token. */
export function pagesToken(indexes: readonly number[]): string {
  return runsOf(indexes)
    .map(([a, b]) => (a === b ? `${a + 1}` : `${a + 1}-${b + 1}`))
    .join("_");
}

function download(documents: PlannedDocument[], zipName: string): OutputPlan["download"] {
  return documents.length === 1 ? { kind: "pdf", name: documents[0].name } : { kind: "zip", name: zipName };
}

function finish(documents: Omit<PlannedDocument, "name">[], names: string[], zip: string, extra: Partial<Pick<OutputPlan, "skipped" | "blocked">> = {}): OutputPlan {
  const unique = uniqueNames(names);
  const docs = documents.map((d, i) => ({ ...d, name: unique[i] }));
  return { documents: docs, download: download(docs, zip), skipped: extra.skipped ?? [], blocked: extra.blocked ?? [] };
}

// ---------------------------------------------------------------- Split

export type SplitMode =
  /** One file per page. */
  | { kind: "every" }
  /** Files of N pages; the last has the rest. */
  | { kind: "everyN"; n: number }
  /** Page 1 alone, then pairs 2-3, 4-5 …, and the last page alone if left over. */
  | { kind: "spreads" }
  /** Custom, typed: one part per item, in the typed order (an empty list = the whole file). */
  | { kind: "ranges"; items: RangeItem[] }
  /** Custom, from the marks of one file: the parts themselves (0-based page lists). */
  | { kind: "parts"; parts: number[][] };

/** The parts (0-based page lists, in output order) a mode gives for a file of `pageCount` pages. */
export function splitParts(pageCount: number, mode: SplitMode): number[][] {
  pageCount = pagesIn(pageCount);
  const pages = allPages(pageCount);
  switch (mode.kind) {
    case "every":
      return pages.map((i) => [i]);
    case "everyN": {
      const n = countOf(mode.n);
      if (n === null) return [];
      const parts: number[][] = [];
      for (let i = 0; i < pageCount; i += n) parts.push(pages.slice(i, i + n));
      return parts;
    }
    case "spreads": {
      if (!pageCount) return [];
      const parts: number[][] = [[0]];
      for (let i = 1; i < pageCount; i += 2) parts.push(pages.slice(i, i + 2));
      return parts;
    }
    case "ranges":
      if (!mode.items.length) return pageCount ? [pages] : [];
      return mode.items.map((item) => resolveItem(item, pageCount)).filter((p) => p.length);
    case "parts":
      return mode.parts.map((p) => p.filter((i) => isPageIn(i, pageCount))).filter((p) => p.length);
  }
}

/** Parts from cut points: a cut after page index k ends a part there. */
export function partsFromCuts(pageCount: number, cutsAfter: Iterable<number>): number[][] {
  pageCount = pagesIn(pageCount);
  const cuts = new Set(cutsAfter);
  const parts: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    current.push(i);
    if (cuts.has(i) || i === pageCount - 1) {
      parts.push(current);
      current = [];
    }
  }
  return parts;
}

const isRun = (part: readonly number[]) => part.every((v, i) => i === 0 || v === part[i - 1] + 1);

/** Whether the mark after page index k is on: one part ends at k and the next one starts at k + 1. */
export function isCut(parts: readonly (readonly number[])[], k: number): boolean {
  return parts.some((p, i) => p[p.length - 1] === k && parts[i + 1]?.[0] === k + 1);
}

/** Marks between two pages that are both in some part are shown; the others are hidden (spec §3b). */
export function isMarkVisible(parts: readonly (readonly number[])[], k: number): boolean {
  const covered = (i: number) => parts.some((p) => p.includes(i));
  return covered(k) && covered(k + 1);
}

/**
 * Toggles the mark after page index k (Custom mode). On: the first part
 * holding k and k + 1 next to each other is split there. Off: the two
 * neighbouring parts that meet there are joined, when both are runs. Any
 * other case returns the parts unchanged.
 */
export function toggleCut(parts: readonly (readonly number[])[], k: number): number[][] {
  const copy = parts.map((p) => [...p]);
  const end = copy.findIndex((p, i) => p[p.length - 1] === k && copy[i + 1]?.[0] === k + 1);
  if (end >= 0) {
    if (!isRun(copy[end]) || !isRun(copy[end + 1])) return copy;
    copy.splice(end, 2, [...copy[end], ...copy[end + 1]]);
    return copy;
  }
  for (let i = 0; i < copy.length; i++) {
    const j = copy[i].findIndex((v, n) => v === k && copy[i][n + 1] === k + 1);
    if (j >= 0) {
      copy.splice(i, 1, copy[i].slice(0, j + 1), copy[i].slice(j + 1));
      return copy;
    }
  }
  return copy;
}

/**
 * The Custom field's text for a list of parts: "1-4, 5-10, 11-12". A part that
 * is every odd or even page is written as the keyword.
 */
export function formatParts(parts: readonly (readonly number[])[], pageCount: number): string {
  const odd = resolveItem({ kind: "odd", text: "odd" }, pageCount).join();
  const even = resolveItem({ kind: "even", text: "even" }, pageCount).join();
  return parts
    .map((p) => {
      if (!isRun(p) && p.join() === odd) return "odd";
      if (!isRun(p) && p.join() === even) return "even";
      return formatPages(p);
    })
    .join(", ");
}

export type SplitSettings = {
  mode: SplitMode;
  /** Files whose parts were set by their own marks (Custom), by file id. */
  perFile?: Readonly<Record<string, SplitMode>>;
  /** File-name pattern (default "{name}-{pages}"). */
  pattern?: string;
  /** Names typed in the parts list, by part key. */
  renames?: Readonly<Record<string, string>>;
  date?: Date;
};

/** Split (spec §3b, §6a): one document per part, every input's parts in one flat list. */
export function planSplit(files: readonly PlanFile[], settings: SplitSettings): OutputPlan {
  const date = settings.date ?? new Date();
  const docs: Omit<PlannedDocument, "name">[] = [];
  const names: string[] = [];
  const skipped: FileRef[] = [];
  for (const f of files) {
    const parts = splitParts(f.pageCount, settings.perFile?.[f.id] ?? settings.mode);
    if (!parts.length) skipped.push({ sourceId: f.id, name: f.name });
    parts.forEach((part, j) => {
      const key = `${f.id}:${formatPages(part)}`;
      const typed = settings.renames?.[key];
      names.push(
        (typed && customName(typed)) ||
          patternName(settings.pattern ?? SPLIT_PATTERN, { input: f.name, pages: pagesToken(part), first: part[0] + 1, last: part[part.length - 1] + 1, n: j + 1, date }),
      );
      docs.push({ pages: part.map((i) => page(f.id, i)), sourceId: f.id, range: formatPages(part), key });
    });
  }
  return finish(
    docs,
    names,
    splitZipName(files.map((f) => f.name)),
    { skipped },
  );
}

// ---------------------------------------------------------------- Extract and Delete

/** The pages a typed list selects in each file (the shared field, spec §3a). */
export function pagesPerFile(items: readonly RangeItem[], files: readonly PlanFile[]): Record<string, number[]> {
  return Object.fromEntries(files.map((f) => [f.id, selectedPages(items, pagesIn(f.pageCount))]));
}

export type ExtractSettings = { pattern?: string; date?: Date };

/**
 * Extract (spec §3c, §6b): one document per input with its selected pages,
 * in document order without repeats. Inputs with nothing selected are skipped.
 */
export function planExtract(files: readonly PlanFile[], selected: Readonly<Record<string, readonly number[]>>, settings: ExtractSettings = {}): OutputPlan {
  const date = settings.date ?? new Date();
  const docs: Omit<PlannedDocument, "name">[] = [];
  const names: string[] = [];
  const skipped: FileRef[] = [];
  for (const f of files) {
    const pages = [...new Set(selected[f.id] ?? [])].filter((i) => isPageIn(i, f.pageCount)).sort((a, b) => a - b);
    if (!pages.length) {
      skipped.push({ sourceId: f.id, name: f.name });
      continue;
    }
    names.push(patternName(settings.pattern ?? EXTRACT_PATTERN, { input: f.name, pages: pagesToken(pages), first: pages[0] + 1, last: pages[pages.length - 1] + 1, n: 1, date }));
    docs.push({ pages: pages.map((i) => page(f.id, i)), sourceId: f.id, range: formatPages(pages), key: `${f.id}:${formatPages(pages)}` });
  }
  return finish(docs, names, EXTRACT_ZIP, { skipped });
}

/**
 * Delete (spec §3d, §6c): one document per input without its marked pages,
 * in the original order, under the input's own name. An input with every
 * page marked is listed in `blocked` and gives no document.
 */
export function planDelete(files: readonly PlanFile[], marked: Readonly<Record<string, readonly number[]>>): OutputPlan {
  const docs: Omit<PlannedDocument, "name">[] = [];
  const names: string[] = [];
  const blocked: FileRef[] = [];
  for (const f of files) {
    const gone = new Set(marked[f.id] ?? []);
    const pages = allPages(f.pageCount).filter((i) => !gone.has(i));
    if (!pages.length) {
      blocked.push({ sourceId: f.id, name: f.name });
      continue;
    }
    names.push(pdfOutputName(f.name));
    docs.push({ pages: pages.map((i) => page(f.id, i)), sourceId: f.id, range: formatPages(pages), key: `${f.id}:${formatPages(pages)}` });
  }
  return finish(docs, names, DELETE_ZIP, { blocked });
}

// ---------------------------------------------------------------- Alternate & mix

export type MixCard = {
  sourceId: string;
  name: string;
  pageCount: number;
  /** Read from the last page to the first. */
  reverse?: boolean;
  /** Pages given each turn (default 1). */
  perTurn?: number;
  /** One-page files only: use the page again every round (default on). */
  repeat?: boolean;
};

/** A one-page card with Repeat on (the default) is never used up. */
export const repeats = (c: MixCard) => c.pageCount === 1 && c.repeat !== false;

/** A card's pages per turn; a bad value (NaN, 0, 2.5) reads as 1 so the order always ends. */
const perTurnOf = (c: MixCard) => countOf(c.perTurn ?? 1) ?? 1;

/**
 * Alternate's page order (spec §3g "Interleave rule"): cards in order, round
 * after round. On its turn a card gives its next `perTurn` pages (fewer if it
 * has fewer left); a used-up card is skipped; a repeating one-page card is
 * never used up. Before each turn, if every non-repeating card is used up,
 * stop: leftovers of a longer file follow at the end, and a repeated page
 * never trails the last real page.
 */
export function interleave(cards: readonly MixCard[]): PlannedPage[] {
  const queues = cards.map((c) => {
    const order = allPages(c.pageCount);
    return c.reverse ? order.reverse() : order;
  });
  const next = cards.map(() => 0);
  const out: PlannedPage[] = [];
  const realLeft = () => cards.some((c, i) => !repeats(c) && next[i] < queues[i].length);
  while (realLeft()) {
    for (let i = 0; i < cards.length; i++) {
      if (!realLeft()) break;
      const c = cards[i];
      if (repeats(c)) {
        out.push(page(c.sourceId, 0));
        continue;
      }
      const take = perTurnOf(c);
      const pages = queues[i].slice(next[i], next[i] + take);
      next[i] += pages.length;
      for (const p of pages) out.push(page(c.sourceId, p));
    }
  }
  return out;
}

/**
 * Alternate needs two cards and at least one that is not a repeating one-page
 * card (spec §3g), and every card's pages per turn must be a whole number of
 * 1 or more.
 */
export function canMix(cards: readonly MixCard[]): boolean {
  if (cards.some((c) => c.perTurn !== undefined && countOf(c.perTurn) === null)) return false;
  return cards.length >= 2 && cards.some((c) => !repeats(c) && pagesIn(c.pageCount) > 0);
}

/** Alternate's single output: the interleaved pages, named "<first card>_mixed.pdf" (spec §6e). */
export function planAlternate(cards: readonly MixCard[]): { name: string; pages: PlannedPage[] } {
  return { name: mixedName(cards[0]?.name), pages: interleave(cards) };
}

// ---------------------------------------------------------------- Two-sided scan order

/** Two-sided scan order (spec I-9, AC-547, AC-548), on any list; see page-list.ts. */
export { twoSidedScanOrder } from "./page-list";
