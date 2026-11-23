import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { exceedsPixelCap, imageFormatOfName, imagePageSize, imagePlacement, probeImage, sniffFormat } from "./images";
import { decodeTiffFrame, readTiff, tiffFrameSizes, type TiffFile } from "./tiff";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));

describe("image intake", () => {
  it("maps names to formats, and leaves PDFs alone", () => {
    expect(imageFormatOfName("Charlie.PNG")).toBe("png");
    expect(imageFormatOfName("x.jpeg")).toBe("jpeg");
    expect(imageFormatOfName("scan.TIF")).toBe("tiff");
    expect(imageFormatOfName("alpha.pdf")).toBeNull();
  });
  it("reads pixel sizes from headers without decoding", async () => {
    expect(probeImage(await fx("charlie.png"))).toEqual({ format: "png", width: 400, height: 300 });
    expect(probeImage(await fx("delta.jpg"))).toEqual({ format: "jpeg", width: 300, height: 400 });
    expect(probeImage(await fx("tiny.gif"))).toEqual({ format: "gif", width: 30, height: 20 });
    expect(probeImage(await fx("tiny.bmp"))).toEqual({ format: "bmp", width: 30, height: 20 });
    expect(probeImage(await fx("tiny.webp"))).toEqual({ format: "webp", width: 30, height: 20 });
    expect(sniffFormat(await fx("fox.tiff"))).toBe("tiff");
  });
  it("rejects bytes that are not an image (AC-6)", async () => {
    expect(probeImage(await fx("broken.png"))).toBeNull();
    expect(probeImage(new Uint8Array(0))).toBeNull();
  });
  it("caps images at 50 megapixels (AC-7)", () => {
    expect(exceedsPixelCap(8000, 8000)).toBe(true);
    expect(exceedsPixelCap(7000, 7000)).toBe(false);
  });
  it("puts landscape images on landscape A4 and others on portrait A4 (AC-67)", () => {
    expect(imagePageSize(400, 300)).toEqual({ width: 842, height: 595 });
    expect(imagePageSize(300, 400)).toEqual({ width: 595, height: 842 });
    expect(imagePageSize(200, 200)).toEqual({ width: 595, height: 842 });
  });
  it("centers images inside the 36 pt margin, never above 72 dpi size", () => {
    const small = imagePlacement(400, 300);
    expect(small).toMatchObject({ width: 400, height: 300, x: 221, y: 147.5 });
    const big = imagePlacement(3000, 4000);
    expect(big.width).toBeCloseTo(595 - 72); // width-bound
    expect(big.x).toBeCloseTo(36);
    expect(big.y).toBeGreaterThanOrEqual(36);
    expect(big.height / big.width).toBeCloseTo(4 / 3);
  });
  it("reads TIFF frames and decodes them (AC-8)", async () => {
    const bytes = await fx("fox.tiff");
    expect(await tiffFrameSizes(bytes)).toEqual([
      { width: 200, height: 200 },
      { width: 200, height: 200 },
    ]);
    const frame = await decodeTiffFrame(bytes, readTiff(bytes) as TiffFile, 1);
    expect(frame.rgba.length).toBe(200 * 200 * 4);
    expect(await tiffFrameSizes(await fx("broken.png"))).toBeNull();
  });
});

describe("TIFF structure walker (review fix)", () => {
  const ifdTiff = (entries: [number, number, number, number][], next: number, extra = 0) => {
    const b = new Uint8Array(8 + 2 + entries.length * 12 + 4 + extra);
    const v = new DataView(b.buffer);
    b.set([0x49, 0x49, 42, 0]);
    v.setUint32(4, 8, true);
    v.setUint16(8, entries.length, true);
    entries.forEach(([tag, type, num, value], i) => {
      const e = 10 + i * 12;
      v.setUint16(e, tag, true);
      v.setUint16(e + 2, type, true);
      v.setUint32(e + 4, num, true);
      if (type === 3 && num === 1) v.setUint16(e + 8, value, true);
      else v.setUint32(e + 8, value, true);
    });
    v.setUint32(10 + entries.length * 12, next, true);
    return b;
  };
  const image = (w: number, h: number, more: [number, number, number, number][] = []) => [
    [256, 3, 1, w],
    [257, 3, 1, h],
    [273, 4, 1, 8],
    [279, 4, 1, 4],
    ...more,
  ] as [number, number, number, number][];

  it("refuses an IFD that points at itself, fast", async () => {
    const started = Date.now();
    expect(readTiff(await fx("cyclic-ifd.tiff"))).toEqual({ problem: "unreadable" });
    expect(tiffFrameSizes(ifdTiff(image(10, 10), 8))).toBeNull();
    expect(Date.now() - started).toBeLessThan(200);
  });
  it("refuses offsets past the end of the file", () => {
    expect(readTiff(ifdTiff(image(10, 10), 99_999))).toEqual({ problem: "unreadable" });
    expect(readTiff(ifdTiff([...image(10, 10).slice(0, 2), [273, 4, 1, 5000], [279, 4, 1, 4]], 0))).toEqual({ problem: "unreadable" });
  });
  it("refuses more than 64 bits per pixel and frames over the decode budget", () => {
    expect(readTiff(ifdTiff(image(10, 10, [[277, 3, 1, 3], [258, 3, 1, 32]]), 0))).toEqual({ problem: "unreadable" });
    expect(readTiff(ifdTiff(image(8000, 8000), 0))).toEqual({ problem: "tooLarge" });
    expect(readTiff(ifdTiff(image(7000, 7000, [[277, 3, 1, 4], [258, 3, 1, 16]]), 0))).toEqual({ problem: "tooLarge" });
  });
  it("refuses many IFDs sharing one large block (per-file budget), fast and without blowing memory", async () => {
    const before = process.memoryUsage().heapUsed;
    const t = Date.now();
    expect(readTiff(await fx("shared-region.tiff"))).toEqual({ problem: "unreadable" });
    // The reviewer's 16 MB variant: 200 IFDs x 4M values.
    const N = 200;
    const VALS = 4_000_000;
    const ifd = 2 + 6 * 12 + 4;
    const b = new Uint8Array(8 + VALS * 4 + N * ifd);
    const v = new DataView(b.buffer);
    b.set([0x49, 0x49, 42, 0]);
    let off = 8 + VALS * 4;
    v.setUint32(4, off, true);
    for (let i = 0; i < N; i++) {
      v.setUint16(off, 6, true);
      [[256, 3, 1, 10], [257, 3, 1, 10], [258, 3, 1, 8], [277, 3, 1, 1], [273, 4, VALS, 8], [279, 4, VALS, 8]].forEach(([tag, type, num, val], k) => {
        const p = off + 2 + k * 12;
        v.setUint16(p, tag, true);
        v.setUint16(p + 2, type, true);
        v.setUint32(p + 4, num, true);
        v.setUint32(p + 8, val, true);
      });
      v.setUint32(off + 2 + 72, i < N - 1 ? off + ifd : 0, true);
      off += ifd;
    }
    expect(readTiff(b)).toEqual({ problem: "unreadable" });
    expect(Date.now() - t).toBeLessThan(5000); // before the budget: about 8 s and 3 GB
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(400 * 1024 * 1024);
  });
  it("accepts a plain frame", () => {
    expect(tiffFrameSizes(ifdTiff(image(2, 2), 0, 16))).toEqual([{ width: 2, height: 2 }]);
  });
});
