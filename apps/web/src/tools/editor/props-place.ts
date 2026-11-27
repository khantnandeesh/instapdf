/**
 * Where the floating properties card goes so it never covers the selection (F25 §5, eval G-9).
 * Pure geometry in screen pixels, so it is unit-tested; EditorShell measures and applies it as a
 * transform from the card's own spot (top right of the canvas).
 */
export type Box = { l: number; t: number; w: number; h: number };
export type Span = { l: number; r: number; t: number; b: number };
/** The card's offset from its own spot, and a max height when it has to be shorter to fit. */
export type PropsPlace = { side: "right" | "left" | "below" | "above"; x: number; y: number; maxH?: number };

/** The shortest the card gets when it moves above or below the selection. */
export const MIN_CARD_H = 160;
const GAP = 12;

const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/**
 * @param card the card at its own spot, with its full content height
 * @param sel  the selection's bounds (with its handles)
 * @param room where the card may go: `l` its left edge on the canvas's left (beside the page strip),
 *             `t` the top it may start at (under the bar), `b` the bottom it may reach (above the view pill)
 */
export function placeCard(card: Box, sel: Span, room: { l: number; t: number; b: number }): PropsPlace | null {
  const h = Math.min(card.h, room.b - card.t);
  const options: (PropsPlace & { box: Span })[] = [];
  const sides = [
    ["right", 0],
    ["left", Math.min(0, room.l - card.l)],
  ] as const;
  // Beside first (its own spot, then the canvas's left), then under or above the selection.
  for (const [side, x] of sides) options.push({ side, x, y: 0, box: { l: card.l + x, r: card.l + x + card.w, t: card.t, b: card.t + h } });
  for (const [, x] of sides) {
    const l = card.l + x;
    const r = l + card.w;
    // Under the selection, as tall as fits down to the bottom.
    const below = sel.b + GAP;
    const roomBelow = room.b - below;
    if (roomBelow >= MIN_CARD_H) {
      const ch = Math.min(card.h, roomBelow);
      options.push({ side: "below", x, y: below - card.t, maxH: ch < card.h ? Math.floor(ch) : undefined, box: { l, r, t: below, b: below + ch } });
    }
    // Ending above it, from the top it may start at.
    const roomAbove = sel.t - GAP - room.t;
    if (roomAbove >= MIN_CARD_H) {
      const ch = Math.min(card.h, roomAbove);
      options.push({ side: "above", x, y: room.t - card.t, maxH: ch < card.h ? Math.floor(ch) : undefined, box: { l, r, t: room.t, b: room.t + ch } });
    }
  }
  let best = options[0];
  let least = Infinity;
  for (const o of options) {
    const a = overlap(o.box, sel);
    if (a === 0) {
      best = o;
      break;
    }
    if (a < least) {
      least = a;
      best = o;
    }
  }
  const { side, x, y, maxH } = best;
  return side === "right" && !maxH ? null : { side, x, y, maxH };
}
