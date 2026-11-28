import { describe, expect, it } from "vitest";
import { JpegImage } from "pdfjs-dist/image_decoders/pdf.image_decoders.mjs";
import { encodeGrayJpeg } from "./gray-encode";
import { encodeColourJpeg, JPEG_TABLES } from "./jpeg";

/** A soft colour picture with an edge in it: what a photo is to a JPEG. */
function picture(w: number, h: number) {
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      px[i] = Math.round(127 + 100 * Math.sin(x / 9));
      px[i + 1] = Math.round(127 + 100 * Math.cos(y / 7));
      px[i + 2] = x > w / 2 ? 220 : 40;
    }
  }
  return px;
}
function decode(jpeg: Uint8Array, w: number, h: number) {
  const image = new JpegImage();
  image.parse(jpeg);
  return { image, data: image.getData({ width: w, height: h, forceRGB: true, isSourcePDF: false }) as Uint8ClampedArray };
}
const meanError = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};

describe("JPEG writer (F6 Compress, F13 Grayscale)", () => {
  it("AC-1600: the Huffman tables hold every code a block can need", () => {
    for (const t of JPEG_TABLES) {
      expect(t.dc.bits.reduce((a, b) => a + b)).toBe(t.dc.vals.length);
      expect(t.ac.bits.reduce((a, b) => a + b)).toBe(t.ac.vals.length);
      expect(new Set(t.ac.vals).size).toBe(162);
      for (let n = 0; n <= 11; n++) expect(t.dc.size[n], `dc ${n}`).toBeGreaterThan(0);
      for (let run = 0; run < 16; run++) for (let n = 1; n <= 10; n++) expect(t.ac.size[(run << 4) | n], `ac ${run}/${n}`).toBeGreaterThan(0);
      expect(t.ac.size[0x00]).toBeGreaterThan(0);
      expect(t.ac.size[0xf0]).toBeGreaterThan(0);
    }
  });

  it("AC-1601: a colour picture comes back as it went in, at sizes that do not fill whole blocks too", () => {
    for (const [w, h] of [[64, 48], [37, 53], [16, 16], [1, 1], [17, 8]] as const) {
      const px = picture(w, h);
      const jpeg = encodeColourJpeg(px, w, h, 90);
      expect([jpeg[0], jpeg[1], jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
      const { image, data } = decode(jpeg, w, h);
      expect([image.width, image.height, image.numComponents]).toEqual([w, h, 3]);
      expect(data.length).toBe(w * h * 3);
      // Half-size colour blurs the sharp blue edge a little; the picture as a whole is close.
      expect(meanError(px, data), `${w}x${h}`).toBeLessThan(w > 8 ? 9 : 30);
    }
  });

  it("AC-1602: lower quality gives a smaller picture, and pure noise survives every quality", () => {
    const px = picture(96, 96);
    const sizes = [92, 80, 65, 45].map((q) => encodeColourJpeg(px, 96, 96, q).length);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    let seed = 7;
    const noise = Uint8Array.from({ length: 40 * 40 * 3 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255);
    for (const q of [5, 45, 65, 100]) {
      const { data } = decode(encodeColourJpeg(noise, 40, 40, q), 40, 40);
      expect(data.length).toBe(40 * 40 * 3);
    }
  });

  it("AC-1603: a grey picture is still written exactly as before the writer was shared", () => {
    const px = Uint8Array.from({ length: 20 * 12 }, (_, i) => (i * 7) & 255);
    const jpeg = encodeGrayJpeg(px, 20, 12, 70);
    const { image, data } = decode(jpeg, 20, 12);
    expect(image.numComponents).toBe(1);
    expect(data.length).toBe(20 * 12 * 3);
    // One quantisation table, two Huffman tables, one component: 20 + 69 + 13 + 33 + 183 + 10 bytes before the data.
    expect(jpeg.indexOf(0xda, 300)).toBe(20 + 69 + 13 + 33 + 183 + 1);
  });
});
