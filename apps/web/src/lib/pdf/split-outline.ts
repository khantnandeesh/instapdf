/**
 * Split by bookmarks (spec F7 §2): reads a file's bookmarks with pdf.js and turns one level of
 * them into parts. `readOutline` touches the file; the rest is pure and unit tested.
 */
import { openPdf } from "./pdfjs";

/** One bookmark: its depth (1 = top), the 0-based page it opens, and its title. */
export type OutlineEntry = { level: number; page: number; title: string };

type Item = { title: string; dest: unknown; items?: Item[] };

/** The part of a pdf.js document the outline needs. */
export type OutlineDoc = {
  numPages: number;
  getOutline(): Promise<unknown>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: never): Promise<number>;
};

/** Every bookmark that points at a page of this file, in outline order. Broken ones are skipped. */
export async function outlineEntries(doc: OutlineDoc): Promise<OutlineEntry[]> {
  const out: OutlineEntry[] = [];
  const walk = async (items: Item[], level: number) => {
    for (const it of items) {
      try {
        const dest = (typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest) as unknown[] | null;
        const target = dest?.[0];
        const page = typeof target === "number" ? target : target ? await doc.getPageIndex(target as never) : -1;
        if (page >= 0 && page < doc.numPages) out.push({ level, page, title: (it.title ?? "").replace(/\s+/g, " ").trim() });
      } catch {
        // A bookmark whose target is missing: not a place to split at.
      }
      if (it.items?.length) await walk(it.items, level + 1);
    }
  };
  await walk(((await doc.getOutline()) ?? []) as Item[], 1);
  return out;
}

/** The bookmarks of a file ([] when it cannot be opened: the tool then says there are none). */
export async function readOutline(source: Blob, password?: string): Promise<OutlineEntry[]> {
  const opened = await openPdf(new Uint8Array(await source.arrayBuffer()), password);
  if (!opened.ok) return [];
  try {
    return await outlineEntries(opened.pdf.doc as unknown as OutlineDoc);
  } finally {
    await opened.pdf.task.destroy();
  }
}

/** The deepest level the bookmarks reach (0 when there are none). */
export const outlineDepth = (entries: readonly OutlineEntry[]) => entries.reduce((d, e) => Math.max(d, e.level), 0);

export type OutlineParts = {
  /** 0-based page lists, in page order; together they hold every page once. */
  parts: number[][];
  /** The bookmark that starts each part; undefined for pages before the first one. */
  titles: (string | undefined)[];
};

/**
 * A new part starts at each page a bookmark of `level` opens (and whose title contains `contains`,
 * when given). Pages before the first such bookmark form a part of their own. Two bookmarks on one
 * page make one part, named after the first.
 */
export function partsFromOutline(entries: readonly OutlineEntry[], level: number, pageCount: number, contains = ""): OutlineParts {
  const needle = contains.trim().toLocaleLowerCase();
  const starts = new Map<number, string>();
  for (const e of entries) {
    if (e.level !== level || e.page <= -1 || e.page >= pageCount) continue;
    if (needle && !e.title.toLocaleLowerCase().includes(needle)) continue;
    if (!starts.has(e.page)) starts.set(e.page, e.title);
  }
  const cuts = [...starts.keys()].filter((p) => p > 0).sort((a, b) => a - b);
  const bounds = [0, ...cuts, pageCount];
  const parts: number[][] = [];
  const titles: (string | undefined)[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    if (bounds[i + 1] <= bounds[i]) continue;
    parts.push(Array.from({ length: bounds[i + 1] - bounds[i] }, (_, k) => bounds[i] + k));
    titles.push(starts.get(bounds[i]));
  }
  return { parts, titles };
}

/** A bookmark title as a file name: no path or reserved characters, at most 80 characters. */
export function titleAsName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 80)
    .trim();
}
