import { describe, expect, it } from "vitest";
import { fitSide, imageSize, MAX_SIDE, tooManyPixels } from "./image-header";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment, a DHT marker (0xC4, must be skipped), then SOF2.
  const app0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];
  const dht = [0xff, 0xc4, 0x00, 0x04, 0x00, 0x00];
  const sof = [0xff, 0xc2, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03];
  return new Uint8Array([0xff, 0xd8, ...app0, ...dht, ...sof, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

describe("imageSize", () => {
  it("reads PNG and JPEG sizes from the header", () => {
    expect(imageSize(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(imageSize(jpeg(1200, 900), "image/jpeg")).toEqual({ width: 1200, height: 900 });
  });
  it("returns null for a broken header", () => {
    expect(imageSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png")).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]), "image/jpeg")).toBeNull();
  });
  it("flags a decompression bomb before decoding", () => {
    // A tiny PNG that declares 100 000 x 100 000 pixels.
    const bomb = imageSize(png(100_000, 100_000), "image/png")!;
    expect(tooManyPixels(bomb)).toBe(true);
    expect(tooManyPixels(imageSize(jpeg(65_000, 65_000), "image/jpeg")!)).toBe(true);
    expect(tooManyPixels({ width: 4000, height: 3000 })).toBe(false);
  });
});

describe("fitSide", () => {
  it("scales the longest side down to the limit and leaves small images alone", () => {
    expect(fitSide(8192, 4096)).toEqual({ width: MAX_SIDE, height: 2048 });
    expect(fitSide(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
