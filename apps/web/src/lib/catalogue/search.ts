/**
 * Tool search shared by the home catalogue and the header menu (spec F2 §3b).
 * Case-insensitive substring match on the name, the summary or a keyword;
 * surrounding spaces are ignored and an empty query matches everything.
 */

export type Searchable = { name: string; summary: string; keywords: readonly string[] };

/** Half-open [start, end) range of the match inside a string. */
export type Range = [number, number];

export type ToolMatch<T> = {
  item: T;
  /** Where the query sits in the name, if it does. */
  name?: Range;
  /** Where the query sits in the summary, if it does. */
  summary?: Range;
  /** True when only a keyword matched (no highlight is shown). */
  keywordOnly: boolean;
};

export const normalizeQuery = (query: string) => query.trim().toLowerCase();

function find(text: string, q: string): Range | undefined {
  const i = text.toLowerCase().indexOf(q);
  return i < 0 ? undefined : [i, i + q.length];
}

export function matchTools<T extends Searchable>(items: readonly T[], query: string): ToolMatch<T>[] {
  const q = normalizeQuery(query);
  if (!q) return items.map((item) => ({ item, keywordOnly: false }));
  const out: ToolMatch<T>[] = [];
  for (const item of items) {
    const name = find(item.name, q);
    const summary = find(item.summary, q);
    if (name || summary) out.push({ item, name, summary, keywordOnly: false });
    else if (item.keywords.some((k) => k.toLowerCase().includes(q))) out.push({ item, keywordOnly: true });
  }
  return out;
}

/** Splits text around a match range: [before, match, after]. */
export function splitAt(text: string, range: Range | undefined): [string, string, string] | null {
  if (!range) return null;
  return [text.slice(0, range[0]), text.slice(range[0], range[1]), text.slice(range[1])];
}
