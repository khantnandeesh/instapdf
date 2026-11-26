/**
 * Counts and page guards shared by the page-tool planners (page-plans.ts, mix-plan.ts), in a module
 * of their own so a page that needs only these does not load every planner.
 */
import type { PlannedPage } from "./page-plans";

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
export const pagesIn = (count: number) => (Number.isSafeInteger(count) && count > 0 ? count : 0);
/** A count setting (Split's N, pages per turn): a whole number of 1 or more, else null. */
export const countOf = (n: number | undefined) => (n !== undefined && Number.isSafeInteger(n) && n >= 1 ? n : null);
/** A page index usable in a file of `pageCount` pages. */
export const isPageIn = (i: number, pageCount: number) => Number.isInteger(i) && i >= 0 && i < pagesIn(pageCount);
export const allPages = (count: number) => Array.from({ length: pagesIn(count) }, (_, i) => i);
export const page = (sourceId: string, sourceIndex: number): PlannedPage => ({ sourceId, sourceIndex, rotation: 0 });
