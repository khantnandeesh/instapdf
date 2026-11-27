import { describe, expect, it } from "vitest";
import { MIN_CARD_H, placeCard } from "./props-place";

// A 1280x632 editor with the navbar gone: canvas 132..1280, bar bottom 56, view pill above 556.
const card = { l: 996, t: 68, w: 272, h: 300 };
const room = { l: 144, t: 68, b: 556 };
const covers = (p: ReturnType<typeof placeCard>, sel: { l: number; r: number; t: number; b: number }) => {
  const x = p?.x ?? 0;
  const y = p?.y ?? 0;
  const h = p?.maxH ?? card.h;
  const l = card.l + x;
  const t = card.t + y;
  return Math.min(l + card.w, sel.r) > Math.max(l, sel.l) && Math.min(t + h, sel.b) > Math.max(t, sel.t);
};

describe("placeCard (eval G-9: the properties card never covers the selection)", () => {
  it("stays in its spot when the selection is elsewhere", () => {
    expect(placeCard(card, { l: 300, r: 500, t: 200, b: 260 }, room)).toBeNull();
  });
  it("moves to the canvas's left, beside the strip, when the selection is under its spot", () => {
    const sel = { l: 1050, r: 1200, t: 150, b: 190 };
    const p = placeCard(card, sel, room);
    expect(p?.side).toBe("left");
    expect(card.l + p!.x).toBe(144);
    expect(covers(p, sel)).toBe(false);
  });
  it("sits below a selection that spans both sides", () => {
    const sel = { l: 160, r: 1260, t: 80, b: 200 };
    const p = placeCard(card, sel, room);
    expect(p?.side).toBe("below");
    expect(card.t + p!.y).toBe(212);
    expect(p!.maxH ?? card.h).toBeGreaterThanOrEqual(MIN_CARD_H);
    expect(covers(p, sel)).toBe(false);
  });
  it("ends above a wide selection low on the screen", () => {
    const sel = { l: 160, r: 1260, t: 300, b: 540 };
    const p = placeCard(card, sel, room);
    expect(p?.side).toBe("above");
    expect(p!.maxH).toBe(300 - 12 - 68);
    expect(covers(p, sel)).toBe(false);
  });
  it("covers as little as it can when the selection fills the canvas", () => {
    const sel = { l: 140, r: 1270, t: 60, b: 600 };
    const p = placeCard(card, sel, room);
    expect(p === null || p.side === "right" || p.side === "left").toBe(true);
    // And of every spot it could take, it takes one that covers the least.
    const h = Math.min(card.h, room.b - card.t);
    const at = (x: number, y: number, hh: number) => Math.max(0, Math.min(card.l + x + card.w, sel.r) - Math.max(card.l + x, sel.l)) * Math.max(0, Math.min(card.t + y + hh, sel.b) - Math.max(card.t + y, sel.t));
    const chosen = at(p?.x ?? 0, p?.y ?? 0, p?.maxH ?? h);
    expect(chosen).toBeLessThanOrEqual(at(0, 0, h));
    expect(chosen).toBeLessThanOrEqual(at(room.l - card.l, 0, h));
  });
  it("picks the spot that covers less when every spot covers some of it", () => {
    // Taller than the canvas and wider than both beside spots, but leaving the left spot's lower part clear.
    const sel = { l: 300, r: 1270, t: 60, b: 600 };
    const p = placeCard(card, sel, room);
    const h = Math.min(card.h, room.b - card.t);
    const at = (x: number) => Math.max(0, Math.min(card.l + x + card.w, sel.r) - Math.max(card.l + x, sel.l)) * Math.max(0, Math.min(card.t + h, sel.b) - Math.max(card.t, sel.t));
    expect(p?.side).toBe("left");
    expect(at(p!.x)).toBeLessThan(at(0));
    expect(at(p!.x)).toBe((300 - 144 > 272 ? 0 : 144 + 272 - 300) * h);
  });
});
