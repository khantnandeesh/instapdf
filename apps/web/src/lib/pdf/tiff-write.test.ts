import UTIF from "utif";
import { describe, expect, it } from "vitest";
import { encodeTiff, packPixels } from "./tiff-write";

const rgba = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      a.set([r, g, b, 255], (y * w + x) * 4);
    }
  return a;
};

describe("encodeTiff", () => {
  it("writes RGB pages that UTIF reads back pixel for pixel, with size and resolution", () => {
    const src = rgba(7, 5, (x, y) => [x * 30, y * 50, (x + y) * 10]);
    const bytes = encodeTiff([{ width: 7, height: 5, channels: 3, data: packPixels(src, false), dpi: 150 }]);
    const ifds = UTIF.decode(bytes.buffer);
    expect(ifds).toHaveLength(1);
    UTIF.decodeImage(bytes.buffer, ifds[0]);
    expect([ifds[0].width, ifds[0].height]).toEqual([7, 5]);
    expect((ifds[0] as unknown as Record<string, number[]>).t282[0]).toBe(150);
    expect(Array.from(UTIF.toRGBA8(ifds[0]))).toEqual(Array.from(src));
  });

  it("writes several pages into one file, grey pages as one byte per pixel", () => {
    const a = rgba(3, 2, () => [255, 0, 0]);
    const b = rgba(4, 4, (x) => [x * 60, x * 60, x * 60]);
    const bytes = encodeTiff([
      { width: 3, height: 2, channels: 1, data: packPixels(a, true), dpi: 75 },
      { width: 4, height: 4, channels: 1, data: packPixels(b, true), dpi: 75 },
    ]);
    const ifds = UTIF.decode(bytes.buffer);
    for (const ifd of ifds) UTIF.decodeImage(bytes.buffer, ifd);
    expect(ifds.map((i) => [i.width, i.height])).toEqual([[3, 2], [4, 4]]);
    const back = UTIF.toRGBA8(ifds[1]);
    expect(Array.from(back.slice(0, 16))).toEqual([0, 0, 0, 255, 60, 60, 60, 255, 120, 120, 120, 255, 180, 180, 180, 255]);
    expect(UTIF.toRGBA8(ifds[0])[0]).toBe(77); // pure red as Rec. 601 luma
  });

  it("refuses an empty file", () => {
    expect(() => encodeTiff([])).toThrow();
  });
});
