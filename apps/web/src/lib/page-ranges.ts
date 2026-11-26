/**
 * Page lists typed by the visitor (spec F4/F5 §0a.1, I-6, AC-402 to AC-403,
 * AC-543, AC-544). Pure functions, unit tested.
 *
 * Syntax: items separated by commas and/or spaces. An item is
 *   `n`        one page
 *   `a-b`      pages a to b
 *   `a-`       page a to the last page
 *   `-b`       page 1 to page b
 *   `last`     the last page; also `a-last`
 *   `odd`, `even`  every odd or even page (1-based)
 * Pages are 1-based. Spaces around a dash are ignored; an en dash, em dash or
 * minus sign counts as a dash; keywords ignore case (`EVEN`).
 *
 * Several files share one field. Numbers past one file's end are ignored for
 * that file; an item is an error only when it is past the end of every file.
 * Open ranges and keywords are read against each file's own length, and the
 * canonical text keeps them as typed when two or more files are loaded.
 */

/** A range end: a page number, or the file's last page. */
export type Bound = number | "last";

/**
 * One parsed item. `text` is its tidy form ("5-3", "10-last"); `typed` is the
 * user's own text for it, spaces and dash style kept ("5 – 3"), for errors.
 */
export type RangeItem =
  | { kind: "span"; from: number; to: Bound; text: string; typed?: string }
  | { kind: "last"; text: string; typed?: string }
  | { kind: "odd" | "even"; text: string; typed?: string };

export type RangeErrorReason = "not-a-number" | "page-zero" | "past-end" | "start-after-end";

export type RangeError = {
  /** The item as the user typed it (trimmed), e.g. "5 – 3". */
  item: string;
  reason: RangeErrorReason;
  /** One sentence for the inline error, naming the item. */
  message: string;
};

export type ParseResult = { ok: true; items: RangeItem[] } | { ok: false; error: RangeError };

const DASHES = /[‐-―−]/g;

function fail(item: string, reason: RangeErrorReason, last?: number): { ok: false; error: RangeError } {
  const messages: Record<RangeErrorReason, string> = {
    "not-a-number": `“${item}” isn’t a page number or range.`,
    "page-zero": `“${item}”: pages start at 1.`,
    "past-end": `“${item}” is past the last page${last ? ` (${last})` : ""}.`,
    "start-after-end": `“${item}” starts after it ends.`,
  };
  return { ok: false, error: { item, reason, message: messages[reason] } };
}

type Token = { norm: string; typed: string };

/**
 * Splits the text into items, joining spaces around dashes first ("1 - 3" is
 * one item). Each token keeps the slice of the original text it came from.
 */
function tokens(text: string): Token[] {
  // Normalise char by char, remembering where each kept char came from.
  const dashed = text.replace(DASHES, "-");
  const chars: string[] = [];
  const from: number[] = [];
  for (let i = 0; i < dashed.length; i++) {
    const c = dashed[i];
    if (/\s/.test(c)) {
      // Drop whitespace touching a dash: before one (look ahead) or after one.
      let j = i;
      while (j < dashed.length && /\s/.test(dashed[j])) j++;
      if (dashed[j] !== "-" && chars[chars.length - 1] !== "-") {
        chars.push(" ");
        from.push(i);
      }
      i = j - 1;
      continue;
    }
    chars.push(c);
    from.push(i);
  }
  const out: Token[] = [];
  const norm = chars.join("");
  for (const m of norm.matchAll(/[^\s,;]+/g)) {
    const start = m.index;
    const end = start + m[0].length;
    out.push({ norm: m[0], typed: text.slice(from[start], from[end - 1] + 1) });
  }
  return out;
}

const NUMBER = /^\d+$/;

function parseNumber(s: string): number | null {
  if (!NUMBER.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Checks the syntax only (no page counts): `abc`, `0`, `5-3`, `2-x` and `lst` fail here. */
export function parsePageRanges(text: string): ParseResult {
  const items: RangeItem[] = [];
  for (const { norm, typed: raw } of tokens(text)) {
    const t = norm.toLowerCase();
    if (t === "odd" || t === "even") {
      items.push({ kind: t, text: t, typed: raw });
      continue;
    }
    if (t === "last") {
      items.push({ kind: "last", text: t, typed: raw });
      continue;
    }
    const n = parseNumber(t);
    if (n !== null) {
      if (n === 0) return fail(raw, "page-zero");
      items.push({ kind: "span", from: n, to: n, text: String(n), typed: raw });
      continue;
    }
    const dash = t.indexOf("-");
    if (dash < 0 || t.indexOf("-", dash + 1) >= 0) return fail(raw, "not-a-number");
    const left = t.slice(0, dash);
    const right = t.slice(dash + 1);
    if (!left && !right) return fail(raw, "not-a-number");
    const from = left ? parseNumber(left) : 1;
    if (from === null) return fail(raw, "not-a-number");
    let to: Bound;
    if (!right || right === "last") to = "last";
    else {
      const r = parseNumber(right);
      if (r === null) return fail(raw, "not-a-number");
      to = r;
    }
    if (from === 0 || to === 0) return fail(raw, "page-zero");
    if (typeof to === "number" && from > to) return fail(raw, "start-after-end");
    // Keep what was typed for open ranges ("10-", "10-last"); closed ones are written plainly.
    const shown = to === "last" ? (right ? `${from}-last` : `${from}-`) : `${from}-${to}`;
    items.push({ kind: "span", from, to, text: shown, typed: raw });
  }
  return { ok: true, items };
}

/**
 * Parses and checks against the loaded files' page counts. A number past the
 * end of the longest file is an error; past a shorter file's end it just
 * selects nothing there.
 */
export function validatePageRanges(text: string, pageCounts: readonly number[]): ParseResult {
  const parsed = parsePageRanges(text);
  if (!parsed.ok) return parsed;
  const longest = Math.max(0, ...pageCounts);
  if (!longest) return parsed;
  for (const item of parsed.items) {
    if (item.kind !== "span") continue;
    if (item.from > longest || (typeof item.to === "number" && item.to > longest)) return fail(item.typed ?? item.text, "past-end", longest);
  }
  return parsed;
}

/** The pages (0-based, ascending) one item selects in a file of `pageCount` pages. */
export function resolveItem(item: RangeItem, pageCount: number): number[] {
  const out: number[] = [];
  if (item.kind === "span") {
    const to = item.to === "last" ? pageCount : Math.min(item.to, pageCount);
    for (let p = item.from; p <= to; p++) out.push(p - 1);
    return out;
  }
  if (item.kind === "last") return pageCount > 0 ? [pageCount - 1] : [];
  for (let i = item.kind === "odd" ? 0 : 1; i < pageCount; i += 2) out.push(i);
  return out;
}

/** Every page the items select (0-based, ascending, no repeats): Extract and Delete. */
export function selectedPages(items: readonly RangeItem[], pageCount: number): number[] {
  const set = new Set<number>();
  for (const item of items) for (const i of resolveItem(item, pageCount)) set.add(i);
  return [...set].sort((a, b) => a - b);
}

/** True when the item reads the file's length (open range or keyword): it differs between files. */
export const isSymbolic = (item: RangeItem) => item.kind !== "span" || item.to === "last";

/** Runs of consecutive pages: [0,1,2,4] -> [[0,2],[4,4]] (0-based, input ascending). */
export function runsOf(indexes: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const i of indexes) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** Canonical text of a page set (0-based in): ascending, merged runs, ", " between, closed ranges: "1-3, 5, 10-12". */
export function formatPages(indexes: readonly number[]): string {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  return runsOf(sorted)
    .map(([a, b]) => (a === b ? `${a + 1}` : `${a + 1}-${b + 1}`))
    .join(", ");
}

/**
 * The field's text after blur for a page set (Extract, Delete). With one file
 * it is the canonical list of the pages selected. With two or more files the
 * closed numbers are canonicalised, and open ranges and keywords stay as
 * typed (each file reads them against its own length, AC-402, AC-543).
 * Text that does not validate against the page counts is returned unchanged,
 * so the field keeps what the user typed next to its error (AC-403), and so
 * does text that selects nothing in a single file (`even` on one page): the
 * field is never blanked.
 */
export function canonicalPageSet(text: string, pageCounts: readonly number[]): string {
  const parsed = validatePageRanges(text, pageCounts);
  if (!parsed.ok) return text;
  if (pageCounts.length <= 1) return formatPages(selectedPages(parsed.items, pageCounts[0] ?? 0)) || text;
  const closed: [number, number][] = [];
  const symbolic: string[] = [];
  for (const item of parsed.items) {
    if (item.kind === "span" && item.to !== "last") closed.push([item.from, item.to]);
    else if (!symbolic.includes(item.text)) symbolic.push(item.text);
  }
  // Merge the closed spans as intervals (they can be large: no page-by-page expansion).
  closed.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of closed) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const numbers = merged.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
  return [...numbers, ...symbolic].join(", ");
}

/**
 * The field's text after blur for Split's Custom mode, where each item is one
 * part, in the typed order. Items are written plainly; with one file, open
 * ranges and `last` are closed against its length (`10-` -> `10-12`).
 * `odd` and `even` stay keywords (each is one part). Text that does not
 * validate is returned unchanged.
 */
export function canonicalPartList(text: string, pageCounts: readonly number[]): string {
  const parsed = validatePageRanges(text, pageCounts);
  if (!parsed.ok) return text;
  const single = pageCounts.length === 1 ? pageCounts[0] : undefined;
  return parsed.items
    .map((item) => {
      if (single === undefined || item.kind === "odd" || item.kind === "even") return item.text;
      const pages = resolveItem(item, single);
      if (!pages.length) return item.text;
      const a = pages[0] + 1;
      const b = pages[pages.length - 1] + 1;
      return a === b ? `${a}` : `${a}-${b}`;
    })
    .join(", ");
}
