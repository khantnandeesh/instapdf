/**
 * Image sizes read from file headers, before anything is decoded. Pure, unit tested.
 *
 * A small PNG or JPEG can declare a huge canvas (a decompression bomb): decoding it would take
 * gigabytes. The size is checked here first, and anything over the pixel limit is refused.
 */

/** Largest image accepted, in pixels (about 160 MB decoded as RGBA). */
export const MAX_DECODE_PIXELS = 40_000_000;
/** Longest side an image keeps; larger ones are redrawn smaller. */
export const MAX_SIDE = 4096;

export type ImageSize = { width: number; height: number };

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

/** PNG: IHDR is the first chunk, width and height at bytes 16 and 20. */
function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  if (String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== "IHDR") return null;
  return { width: u32(b, 16), height: u32(b, 20) };
}

/** JPEG: walks the markers to the first start-of-frame (SOF0..SOF15, not DHT/JPG/DAC). */
function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xff) {
      i++; // fill byte
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    const len = u16(b, i + 2);
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 9 > b.length) return null;
      const width = u16(b, i + 7);
      const height = u16(b, i + 5);
      // Height 0 means "given later" (a DNL marker): the size can't be known before decoding.
      return width && height ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** The declared size of a PNG or JPEG, or null when the header can't be read. */
export function imageSize(b: Uint8Array, mime: "image/png" | "image/jpeg"): ImageSize | null {
  return mime === "image/png" ? pngSize(b) : jpegSize(b);
}

/** True when a size is too large to decode safely. */
export const tooManyPixels = (s: ImageSize) => s.width * s.height > MAX_DECODE_PIXELS || s.width > 65535 || s.height > 65535;

/** The size to redraw to so that the longest side is at most MAX_SIDE (unchanged when it is). */
export function fitSide(w: number, h: number, max = MAX_SIDE): ImageSize {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
