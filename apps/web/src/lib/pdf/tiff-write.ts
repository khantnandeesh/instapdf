/**
 * A small baseline TIFF writer for PDF to image (spec F12): 8-bit grey or RGB pages, one strip
 * each, Deflate-compressed (compression 8, read by every current viewer), several pages per file.
 * Little-endian. Pure: no DOM, unit tested by decoding its output with UTIF.
 */
import { zlibSync } from "fflate";

export type TiffPage = {
  width: number;
  height: number;
  /** 1 = grey, 3 = RGB; `data` holds width * height * channels bytes, rows top to bottom. */
  channels: 1 | 3;
  data: Uint8Array;
  /** Pixels per inch, written as the resolution tags. */
  dpi: number;
};

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

/** Drops the alpha of RGBA canvas pixels: RGB, or one grey byte per pixel (Rec. 601 luma). */
export function packPixels(rgba: Uint8ClampedArray | Uint8Array, grey: boolean): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(grey ? n : n * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    if (grey) out[j++] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29 + 128) >> 8;
    else {
      out[j++] = rgba[i];
      out[j++] = rgba[i + 1];
      out[j++] = rgba[i + 2];
    }
  }
  return out;
}

export function encodeTiff(pages: readonly TiffPage[]): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw new Error("A TIFF needs at least one page");
  const even = (n: number) => n + (n & 1);
  const strips = pages.map((p) => zlibSync(p.data, { level: 6 }));
  // Layout per page: strip, [bits per sample ×3], x resolution, y resolution, IFD.
  const ENTRIES = 12;
  const ifdSize = 2 + ENTRIES * 12 + 4;
  let at = 8;
  const plan = pages.map((p, i) => {
    const strip = at;
    at = even(at + strips[i].length);
    const bits = at;
    if (p.channels === 3) at += 6;
    const res = at;
    at += 16;
    const ifd = at;
    at += ifdSize;
    return { strip, bits, res, ifd };
  });
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, plan[0].ifd, true);
  pages.forEach((p, i) => {
    const { strip, bits, res, ifd } = plan[i];
    out.set(strips[i], strip);
    if (p.channels === 3) for (let k = 0; k < 3; k++) view.setUint16(bits + k * 2, 8, true);
    for (let k = 0; k < 2; k++) {
      view.setUint32(res + k * 8, Math.round(p.dpi), true);
      view.setUint32(res + k * 8 + 4, 1, true);
    }
    let e = ifd;
    view.setUint16(e, ENTRIES, true);
    e += 2;
    const entry = (tag: number, type: number, count: number, value: number) => {
      view.setUint16(e, tag, true);
      view.setUint16(e + 2, type, true);
      view.setUint32(e + 4, count, true);
      if (type === SHORT && count === 1) view.setUint16(e + 8, value, true);
      else view.setUint32(e + 8, value, true);
      e += 12;
    };
    entry(256, LONG, 1, p.width);
    entry(257, LONG, 1, p.height);
    if (p.channels === 3) entry(258, SHORT, 3, bits);
    else entry(258, SHORT, 1, 8);
    entry(259, SHORT, 1, 8); // Deflate
    entry(262, SHORT, 1, p.channels === 3 ? 2 : 1); // RGB, or grey with 0 = black
    entry(273, LONG, 1, strip);
    entry(277, SHORT, 1, p.channels);
    entry(278, LONG, 1, p.height);
    entry(279, LONG, 1, strips[i].length);
    entry(282, RATIONAL, 1, res);
    entry(283, RATIONAL, 1, res + 8);
    entry(296, SHORT, 1, 2); // inches
    view.setUint32(e, plan[i + 1]?.ifd ?? 0, true);
  });
  return out;
}
