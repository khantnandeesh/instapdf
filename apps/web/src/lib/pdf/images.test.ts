import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { exceedsPixelCap, imageFormatOfName, imagePageSize, imagePlacement, probeImage, sniffFormat } from "./images";
import { encodePng } from "./png";
import { decodeTiffFrame, tiffFrameSizes } from "./tiff";

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
  it("encodes RGBA as a PNG the header reader understands", () => {
    const rgba = new Uint8Array(3 * 2 * 4).fill(255);
    const png = encodePng(rgba, 3, 2);
    expect(probeImage(png)).toEqual({ format: "png", width: 3, height: 2 });
    rgba[3] = 0;
    expect(encodePng(rgba, 3, 2)[25]).toBe(6); // RGBA color type when not opaque
  });
  it("reads TIFF frames and decodes them (AC-8)", async () => {
    const bytes = await fx("fox.tiff");
    expect(await tiffFrameSizes(bytes)).toEqual([
      { width: 200, height: 200 },
      { width: 200, height: 200 },
    ]);
    const frame = await decodeTiffFrame(bytes, 1);
    expect(frame.rgba.length).toBe(200 * 200 * 4);
    expect(await tiffFrameSizes(await fx("broken.png"))).toBeNull();
  });
});
