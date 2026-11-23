/**
 * The ordered page list behind Merge's two views (spec F3 §3e). The pages view
 * renders it page by page; the files view groups it into segments (maximal
 * runs of consecutive pages from one source). Pure functions on immutable
 * arrays, so a snapshot for undo is just the previous array.
 */

export type PageSize = { width: number; height: number };

export type SourceInfo = {
  id: string;
  /** "A", "B", … "Z", "AA", "AB" … */
  letter: string;
  name: string;
  size: number;
  lastModified: number;
  kind: "pdf" | "image";
  /** Pages (or image frames) in the source. 0 while it loads. */
  pageCount: number;
};

export type PageRef = {
  uid: string;
  /** null for a blank page the user inserted. */
  sourceId: string | null;
  /** Page index in the source (0-based); -1 for a blank page or a placeholder. */
  sourceIndex: number;
  /** User rotation in display degrees (unbounded, a multiple of 90). */
  rotation: number;
  /** Displayed size of the page before the user's rotation (its own /Rotate applied). */
  size: PageSize;
  /** Placeholder for a source that is still loading. */
  pending?: boolean;
};

export type Segment = {
  /** Stable key: the uid of its first page. */
  key: string;
  /** Source of its pages; null only when the whole list is blank pages. */
  sourceId: string | null;
  pages: PageRef[];
  /** Index of its first page in the list. */
  start: number;
};

/** A4 portrait in PDF points. */
export const A4: PageSize = { width: 595, height: 842 };

/** Natural, case-insensitive order: "file2" before "File10". */
const collator = typeof Intl !== "undefined" ? new Intl.Collator("en", { numeric: true, sensitivity: "base" }) : null;
export function naturalCompare(a: string, b: string): number {
  if (collator) return collator.compare(a, b);
  return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
}

/** Sorts names naturally (stable), e.g. the first batch of a Merge. */
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => naturalCompare(a.name, b.name));
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB", 701 -> "ZZ", 702 -> "AAA". */
export function sourceLetter(n: number): string {
  let s = "";
  let k = n + 1;
  while (k > 0) {
    const r = (k - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    k = Math.floor((k - 1) / 26);
  }
  return s;
}

export const isBlank = (p: PageRef) => p.sourceId === null;

/** Size as shown after the user's rotation. */
export function displayedSize(p: Pick<PageRef, "size" | "rotation">): PageSize {
  const quarter = (((p.rotation / 90) % 4) + 4) % 4;
  return quarter % 2 ? { width: p.size.height, height: p.size.width } : p.size;
}

/**
 * Units: a source page plus the blank pages the user inserted after it. Blank
 * pages at the very start belong to the first unit. Sorting moves whole units,
 * so a blank page travels with the page in front of it.
 */
export function unitsOf(pages: readonly PageRef[]): PageRef[][] {
  const units: PageRef[][] = [];
  const leading: PageRef[] = [];
  for (const p of pages) {
    if (isBlank(p)) {
      if (units.length) units[units.length - 1].push(p);
      else leading.push(p);
    } else units.push([p]);
  }
  if (leading.length) {
    if (units.length) units[0].unshift(...leading);
    else units.push(leading);
  }
  return units;
}

const sourceOfUnit = (unit: PageRef[]) => unit.find((p) => !isBlank(p))?.sourceId ?? null;

/** Maximal runs of consecutive units from the same source (the files view's cards). */
export function segmentsOf(pages: readonly PageRef[]): Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  for (const unit of unitsOf(pages)) {
    const sourceId = sourceOfUnit(unit);
    const last = segments[segments.length - 1];
    if (last && last.sourceId === sourceId) last.pages.push(...unit);
    else segments.push({ key: unit[0].uid, sourceId, pages: [...unit], start });
    start += unit.length;
  }
  return segments;
}

export const flatten = (groups: readonly (readonly PageRef[])[]): PageRef[] => groups.flatMap((g) => [...g]);

/**
 * Moves the pages in `uids` (keeping their relative order) so the block starts
 * at `toIndex` of the list *without* them. The index is clamped.
 */
export function moveBlock(pages: readonly PageRef[], uids: ReadonlySet<string>, toIndex: number): PageRef[] {
  const moving = pages.filter((p) => uids.has(p.uid));
  if (!moving.length) return [...pages];
  const rest = pages.filter((p) => !uids.has(p.uid));
  const at = Math.max(0, Math.min(rest.length, Math.round(toIndex)));
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/**
 * Target index for `moveBlock` when the block is dropped in gap `gap` of the
 * current list (0 = before the first page, length = after the last).
 */
export function gapToIndex(pages: readonly PageRef[], uids: ReadonlySet<string>, gap: number): number {
  let before = 0;
  for (let i = 0; i < Math.min(gap, pages.length); i++) if (uids.has(pages[i].uid)) before++;
  return gap - before;
}

export type MoveStep = "earlier" | "later" | "first" | "last";

/** Index of the block's first page after a one-step (or to-the-end) move. */
export function stepIndex(pages: readonly PageRef[], uids: ReadonlySet<string>, step: MoveStep): number {
  const first = pages.findIndex((p) => uids.has(p.uid));
  const restLength = pages.length - pages.filter((p) => uids.has(p.uid)).length;
  switch (step) {
    case "first":
      return 0;
    case "last":
      return restLength;
    case "earlier":
      return Math.max(0, first - 1);
    case "later":
      return Math.min(restLength, first + 1);
  }
}

/** Moves segment `from` to segment position `to` (both indexes into `segmentsOf(pages)`). */
export function moveSegment(pages: readonly PageRef[], from: number, to: number): PageRef[] {
  const segs = segmentsOf(pages).map((s) => s.pages);
  if (from < 0 || from >= segs.length) return [...pages];
  const [moved] = segs.splice(from, 1);
  segs.splice(Math.max(0, Math.min(segs.length, to)), 0, moved);
  return flatten(segs);
}

export function removePages(pages: readonly PageRef[], uids: ReadonlySet<string>): PageRef[] {
  return pages.filter((p) => !uids.has(p.uid));
}

/** Inserts a copy (same source page and rotation) right after each page in `uids`. */
export function duplicatePages(pages: readonly PageRef[], uids: ReadonlySet<string>, newUid: () => string): { pages: PageRef[]; added: string[] } {
  const out: PageRef[] = [];
  const added: string[] = [];
  for (const p of pages) {
    out.push(p);
    if (uids.has(p.uid)) {
      const copy = { ...p, uid: newUid() };
      out.push(copy);
      added.push(copy.uid);
    }
  }
  return { pages: out, added };
}

export function insertPages(pages: readonly PageRef[], index: number, added: readonly PageRef[]): PageRef[] {
  const at = Math.max(0, Math.min(pages.length, index));
  return [...pages.slice(0, at), ...added, ...pages.slice(at)];
}

/**
 * Size for a blank page inserted at `index`: the displayed size of the page in
 * front of it, or of the page after it at the very start (A4 if the list is empty).
 */
export function blankSizeAt(pages: readonly PageRef[], index: number): PageSize {
  const neighbour = pages[index - 1] ?? pages[index];
  return neighbour ? displayedSize(neighbour) : A4;
}

/** Applies a rotation step to the pages in `uids`. */
export function rotatePages(pages: readonly PageRef[], uids: ReadonlySet<string>, step: number): PageRef[] {
  return pages.map((p) => (uids.has(p.uid) ? { ...p, rotation: p.rotation + step } : p));
}

export type SortKey = "name-asc" | "name-desc" | "date-asc" | "date-desc";

/**
 * Stable sort by each page's source (name naturally, or last-modified date),
 * keeping page order inside each source. Works on units, so blank pages move
 * with the page in front of them.
 */
export function sortPages(pages: readonly PageRef[], sources: Readonly<Record<string, SourceInfo>>, key: SortKey): PageRef[] {
  const units = unitsOf(pages).map((unit, i) => ({ unit, i, src: sources[sourceOfUnit(unit) ?? ""] }));
  const dir = key.endsWith("desc") ? -1 : 1;
  const byDate = key.startsWith("date");
  units.sort((a, b) => {
    if (!a.src || !b.src) return a.i - b.i;
    const c = byDate ? a.src.lastModified - b.src.lastModified : naturalCompare(a.src.name, b.src.name);
    return c !== 0 ? c * dir : a.i - b.i;
  });
  return flatten(units.map((u) => u.unit));
}

/** Reverses the order of the segments, keeping page order inside each (AC-78). */
export function reverseSegments(pages: readonly PageRef[]): PageRef[] {
  return flatten(segmentsOf(pages).map((s) => s.pages).reverse());
}

/** "A1" for a source page, "Blank" for a blank page. */
export function pageLabel(p: PageRef, sources: Readonly<Record<string, SourceInfo>>): string {
  if (isBlank(p)) return "Blank";
  const src = p.sourceId ? sources[p.sourceId] : undefined;
  return `${src?.letter ?? "?"}${p.sourceIndex + 1}`;
}

/**
 * Which pages of a source a segment holds: "" when it is the whole source in
 * order, otherwise "page 2", "pages 2–3" or "pages 3, 1".
 */
export function describeSourcePages(indexes: readonly number[], total: number): string {
  if (!indexes.length) return "";
  const whole = indexes.length === total && indexes.every((v, i) => v === i);
  if (whole) return "";
  if (indexes.length === 1) return `page ${indexes[0] + 1}`;
  const contiguous = indexes.every((v, i) => i === 0 || v === indexes[i - 1] + 1);
  if (contiguous) return `pages ${indexes[0] + 1}–${indexes[indexes.length - 1] + 1}`;
  const shown = indexes.slice(0, 4).map((v) => v + 1);
  return `pages ${shown.join(", ")}${indexes.length > 4 ? "…" : ""}`;
}

/** Distinct sources in order of first appearance (pending placeholders included). */
export function sourcesInOrder(pages: readonly PageRef[]): string[] {
  const seen = new Set<string>();
  for (const p of pages) if (p.sourceId && !seen.has(p.sourceId)) seen.add(p.sourceId);
  return [...seen];
}
