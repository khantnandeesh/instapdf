/**
 * Split by size (spec F7 §3): cuts a file into the fewest parts of consecutive pages that each stay
 * under a size limit. `partsBySize` is pure (it is told how big a run of pages is) and unit tested;
 * `measureWith` gives it real sizes by saving the pages with pdf-lib.
 */
import { PDFDocument } from "@cantoo/pdf-lib";

/** The saved size, in bytes, of pages [start, end) as one file. */
export type Measure = (start: number, end: number) => Promise<number>;

export type SizeParts = {
  /** 0-based page lists, in page order; together they hold every page once. */
  parts: number[][];
  /** 0-based pages that are larger than the limit on their own (each is a part by itself). */
  oversize: number[];
};

/**
 * Greedy, which gives the fewest parts for consecutive pages: each part takes as many pages as fit.
 * The end of a part is found by doubling steps and then halving, so a part of k pages costs about
 * 2·log2(k) measurements. `guess` is the expected pages per part (it only sets the first step).
 */
export async function partsBySize(pageCount: number, limit: number, measure: Measure, guess = 1, onProgress?: (fraction: number) => void): Promise<SizeParts> {
  const parts: number[][] = [];
  const oversize: number[] = [];
  const fits = async (s: number, e: number) => (await measure(s, e)) <= limit;
  let s = 0;
  while (s < pageCount) {
    let ok = s + 1;
    if (!(await fits(s, ok))) oversize.push(s);
    else {
      let bad = pageCount + 1;
      let step = Math.max(1, Math.floor(guess / 2));
      while (ok < pageCount) {
        const next = Math.min(pageCount, ok + step);
        if (await fits(s, next)) {
          ok = next;
          step *= 2;
        } else {
          bad = next;
          break;
        }
      }
      while (bad <= pageCount && bad - ok > 1) {
        const mid = (ok + bad) >> 1;
        if (await fits(s, mid)) ok = mid;
        else bad = mid;
      }
    }
    parts.push(Array.from({ length: ok - s }, (_, k) => s + k));
    s = ok;
    onProgress?.(s / pageCount);
  }
  return { parts, oversize };
}

/**
 * Real sizes: the pages copied into a new file and saved. The files Split writes also carry the
 * bookmarks and links of those pages, so callers leave a little headroom under the limit.
 */
export function measureWith(source: PDFDocument): Measure {
  const cache = new Map<string, number>();
  return async (start, end) => {
    const key = `${start}-${end}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const out = await PDFDocument.create({ updateMetadata: false });
    const pages = await out.copyPages(source, Array.from({ length: end - start }, (_, k) => start + k));
    pages.forEach((p) => out.addPage(p));
    const size = (await out.save()).length;
    cache.set(key, size);
    return size;
  };
}

/** Headroom for what the written files add to the measured pages (bookmarks, links, document info). */
export const measuredLimit = (limit: number) => Math.max(1, Math.floor(limit * 0.98) - 2048);
