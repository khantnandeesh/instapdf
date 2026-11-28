/**
 * Bookmarks (spec F10 §4): the outline as the editor holds it, a flat list of rows with a level
 * each (1 = top). Pure: every change returns a new list, and the list is always a valid tree
 * (the first row is at level 1, and no row is more than one level below the row before it).
 */

export const BOOKMARK_LIMITS = { rows: 2000, title: 300, depth: 12 };

/** What a row was in the file: its place in outline order, its name and its page (-1 when it opens no page of the file). */
export type RowSource = { index: number; title: string; page: number };

export type BookmarkRow = {
  key: string;
  title: string;
  /** The page number as typed (1-based). Empty for a bookmark that opens no page (see `src`). */
  page: string;
  level: number;
  /** Set for a row that came from the file, so the saved bookmark can keep its colour, weight, view or other target. */
  src?: RowSource;
};

/** A bookmark as the engine takes it: page is 0-based, -1 for "keep the target it had". */
export type BookmarkNode = { title: string; page: number; src?: RowSource; children: BookmarkNode[] };

let seq = 0;
const key = () => `b${++seq}`;

/** Whether the file's outline is more than the editor holds: it is then not edited at all, rather than cut. */
export const outlineTooBig = (entries: readonly { level: number }[]) => entries.length > BOOKMARK_LIMITS.rows || entries.some((e) => e.level > BOOKMARK_LIMITS.depth);

export function rowsFromOutline(entries: readonly { index: number; level: number; page: number; title: string }[]): BookmarkRow[] {
  return normalize(entries.map((e) => ({ key: key(), title: e.title, page: e.page < 0 ? "" : String(e.page + 1), level: e.level, src: { index: e.index, title: e.title, page: e.page } })));
}

/** Levels made valid: first row at 1, each row at most one below the row before it, never past the depth limit. */
export function normalize(rows: readonly BookmarkRow[]): BookmarkRow[] {
  let prev = 0;
  return rows.map((r) => {
    const level = Math.max(1, Math.min(r.level, prev + 1, BOOKMARK_LIMITS.depth));
    prev = level;
    return level === r.level ? r : { ...r, level };
  });
}

/** The index after the row's last descendant. */
export function subtreeEnd(rows: readonly BookmarkRow[], i: number): number {
  let end = i + 1;
  while (end < rows.length && rows[end].level > rows[i].level) end++;
  return end;
}

const blank = (page: string, level: number): BookmarkRow => ({ key: key(), title: "", page, level });

/** A new empty bookmark after row `i` and everything under it, at its level (at the end, top level, with no row). It points where the row before it points. */
export function addAfter(rows: readonly BookmarkRow[], i: number | null): { rows: BookmarkRow[]; key: string } {
  if (rows.length >= BOOKMARK_LIMITS.rows) return { rows: [...rows], key: "" };
  const at = i === null ? rows.length : subtreeEnd(rows, i);
  const row = blank(i === null ? (rows[rows.length - 1]?.page ?? "1") : rows[i].page, i === null ? 1 : rows[i].level);
  return { rows: [...rows.slice(0, at), row, ...rows.slice(at)], key: row.key };
}

/** A new empty bookmark as the first one under row `i`. */
export function addChild(rows: readonly BookmarkRow[], i: number): { rows: BookmarkRow[]; key: string } {
  if (rows.length >= BOOKMARK_LIMITS.rows || rows[i].level >= BOOKMARK_LIMITS.depth) return { rows: [...rows], key: "" };
  const row = blank(rows[i].page, rows[i].level + 1);
  return { rows: [...rows.slice(0, i + 1), row, ...rows.slice(i + 1)], key: row.key };
}

/** The row goes, and everything under it. */
export const removeRow = (rows: readonly BookmarkRow[], i: number): BookmarkRow[] => [...rows.slice(0, i), ...rows.slice(subtreeEnd(rows, i))];

export function canIndent(rows: readonly BookmarkRow[], i: number): boolean {
  if (i === 0 || rows[i - 1].level < rows[i].level) return false;
  for (let k = i, end = subtreeEnd(rows, i); k < end; k++) if (rows[k].level >= BOOKMARK_LIMITS.depth) return false;
  return true;
}
export const canOutdent = (rows: readonly BookmarkRow[], i: number) => rows[i].level > 1;

const shift = (rows: readonly BookmarkRow[], i: number, by: number): BookmarkRow[] => {
  const end = subtreeEnd(rows, i);
  return rows.map((r, k) => (k >= i && k < end ? { ...r, level: r.level + by } : r));
};
/** Under the bookmark above it (with everything under the row). */
export const indent = (rows: readonly BookmarkRow[], i: number) => (canIndent(rows, i) ? shift(rows, i, 1) : [...rows]);
/**
 * One level up, placed after its old parent's other children, so no bookmark changes parent but
 * this one (and what is under it).
 */
export function outdent(rows: readonly BookmarkRow[], i: number): BookmarkRow[] {
  if (!canOutdent(rows, i)) return [...rows];
  const end = subtreeEnd(rows, i);
  let parentEnd = end;
  while (parentEnd < rows.length && rows[parentEnd].level >= rows[i].level) parentEnd++;
  const moved = rows.slice(i, end).map((r) => ({ ...r, level: r.level - 1 }));
  return [...rows.slice(0, i), ...rows.slice(end, parentEnd), ...moved, ...rows.slice(parentEnd)];
}

/** The start of the sibling before row `i`, or -1 when it is its parent's first. */
function prevSibling(rows: readonly BookmarkRow[], i: number): number {
  for (let k = i - 1; k >= 0; k--) {
    if (rows[k].level === rows[i].level) return k;
    if (rows[k].level < rows[i].level) return -1;
  }
  return -1;
}
/** The start of the sibling after row `i`, or -1 when it is its parent's last. */
function nextSibling(rows: readonly BookmarkRow[], i: number): number {
  const end = subtreeEnd(rows, i);
  return end < rows.length && rows[end].level === rows[i].level ? end : -1;
}
export const canMoveUp = (rows: readonly BookmarkRow[], i: number) => prevSibling(rows, i) >= 0;
export const canMoveDown = (rows: readonly BookmarkRow[], i: number) => nextSibling(rows, i) >= 0;

/** Before the bookmark above it at the same level; what is under each moves with it. */
export function moveUp(rows: readonly BookmarkRow[], i: number): BookmarkRow[] {
  const p = prevSibling(rows, i);
  if (p < 0) return [...rows];
  const end = subtreeEnd(rows, i);
  return [...rows.slice(0, p), ...rows.slice(i, end), ...rows.slice(p, i), ...rows.slice(end)];
}
export function moveDown(rows: readonly BookmarkRow[], i: number): BookmarkRow[] {
  const n = nextSibling(rows, i);
  return n < 0 ? [...rows] : moveUp(rows, n);
}

export const pageOf = (text: string, pageCount: number): number | null => {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= pageCount ? n : null;
};

/** A row from the file that opens no page of it (a web link, a heading) and still has no page typed: it keeps the target it had. */
export const keepsTarget = (r: BookmarkRow) => !!r.src && r.src.page < 0 && !r.page.trim();

/** Why the list cannot be saved yet, or null. */
export function rowsError(rows: readonly BookmarkRow[], pageCount: number): "title" | "page" | null {
  if (rows.some((r) => !r.title.trim())) return "title";
  if (rows.some((r) => !keepsTarget(r) && pageOf(r.page, pageCount) === null)) return "page";
  return null;
}

/** Whether the list differs from the rows the file gave (order, nesting, names or pages). */
export function rowsChanged(rows: readonly BookmarkRow[], base: readonly BookmarkRow[]): boolean {
  if (rows.length !== base.length) return true;
  return rows.some((r, i) => r.key !== base[i].key || r.level !== base[i].level || r.title !== base[i].title || r.page.trim() !== base[i].page);
}

/** The rows as a tree (rows must be valid: see rowsError). */
export function toTree(rows: readonly BookmarkRow[]): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: { level: number; children: BookmarkNode[] }[] = [{ level: 0, children: root }];
  for (const r of normalize(rows)) {
    while (stack[stack.length - 1].level >= r.level) stack.pop();
    const node: BookmarkNode = { title: r.title.replace(/\s+/g, " ").trim(), page: keepsTarget(r) ? -1 : Number(r.page.trim()) - 1, children: [], ...(r.src ? { src: r.src } : {}) };
    stack[stack.length - 1].children.push(node);
    stack.push({ level: r.level, children: node.children });
  }
  return root;
}
