import { describe, expect, it } from "vitest";
import { screenDeltaToFrame, screenToFrame, toScreen, userRectToFrame } from "./geometry";
import { averageHex, dominantHex, nearestWord, removeBackground, selectWords, type FrameWord } from "./markup";

const words: FrameWord[] = [
  { line: 0, text: "Quarterly", box: { x: 50, y: 100, w: 60, h: 12 } },
  { line: 0, text: "total", box: { x: 115, y: 100, w: 30, h: 12 } },
  { line: 0, text: "due", box: { x: 150, y: 100, w: 20, h: 12 } },
  { line: 1, text: "next", box: { x: 50, y: 116, w: 30, h: 12 } },
  { line: 1, text: "week", box: { x: 85, y: 116, w: 35, h: 12 } },
];

describe("markup selection (AC-27, AC-71)", () => {
  it("finds the word under or nearest a point", () => {
    expect(nearestWord(words, [120, 105])).toBe(1);
    expect(nearestWord(words, [500, 500], 24)).toBe(-1);
  });

  it("selects words in reading order, one box per line, either drag direction", () => {
    const s = selectWords(words, [120, 104], [90, 120])!;
    expect(s.text).toBe("total due next week");
    expect(s.rects).toEqual([
      { x: 115, y: 100, w: 55, h: 12 },
      { x: 50, y: 116, w: 70, h: 12 },
    ]);
    expect(selectWords(words, [90, 120], [120, 104])!.text).toBe("total due next week");
    expect(selectWords(words, [900, 900], [950, 950])).toBeNull();
  });

  it("a drag that starts in the gap between words doesn't take in the word past the gap", () => {
    // Gap between "Quarterly" (ends 110) and "total" (starts 115); 113 is nearer "total".
    expect(selectWords(words, [113, 106], [55, 106])!.text).toBe("Quarterly");
    expect(selectWords(words, [112, 106], [165, 106])!.text).toBe("total due");
    // Ending in a gap stops at the last word crossed.
    expect(selectWords(words, [55, 106], [113, 106])!.text).toBe("Quarterly");
    expect(selectWords(words, [160, 106], [113, 106])!.text).toBe("total due");
    // A drag inside one gap marks no word.
    expect(selectWords(words, [111, 106], [113, 106])).toBeNull();
  });
});

describe("page frame mapping", () => {
  it("inverts the screen mapping for every rotation", () => {
    const box = [0, 0, 600, 800] as const;
    for (const rot of [0, 90, 180, 270]) {
      const [sx, sy] = toScreen(120, 300, box, rot, 1);
      expect(screenToFrame(sx, sy, 600, 800, rot)).toEqual([120, 500]);
    }
    expect(screenDeltaToFrame(10, 0, 90)).toEqual([0, -10]);
    expect(screenDeltaToFrame(10, 0, 270)).toEqual([-0, 10]);
  });

  it("maps user-space rects to frame boxes", () => {
    expect(userRectToFrame({ x0: 10, y0: 700, x1: 50, y1: 712 }, [0, 0, 600, 800])).toEqual({ x: 10, y: 88, w: 40, h: 12 });
  });
});

describe("pixels", () => {
  it("averages colours and treats transparency as white paper (AC-97)", () => {
    expect(averageHex(new Uint8Array([255, 0, 0, 255, 255, 0, 0, 0]))).toBe("#ff8080");
  });

  it("finds the dominant page colour under text", () => {
    const px = new Uint8Array(40);
    for (let i = 0; i < 10; i++) px.set(i < 8 ? [250, 240, 200, 255] : [0, 0, 0, 255], i * 4);
    expect(dominantHex(px)).toBe("#faf0c8");
  });

  it("makes paper transparent and keeps ink", () => {
    const px = new Uint8Array([255, 255, 255, 255, 10, 10, 10, 255, 180, 180, 180, 255]);
    removeBackground(px);
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(255);
    expect(px[11]).toBeGreaterThan(0);
    expect(px[11]).toBeLessThan(255);
  });
});
