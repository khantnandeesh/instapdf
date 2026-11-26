/**
 * Alternate & mix's plan (spec F4/F5 §3g, §6e): the interleave rule. Re-exported by page-plans.ts;
 * Alternate's page imports it from here so its first load carries no other planner.
 */
import type { PlannedPage } from "./page-plans";
import { allPages, countOf, page, pagesIn } from "./plan-counts";
import { mixedName } from "./pdf/naming";

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
