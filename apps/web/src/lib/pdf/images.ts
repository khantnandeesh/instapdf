/**
 * Images as Merge input (spec F3 §2, §6). Pure functions, unit tested:
 * header sniffing (format and pixel size without decoding), the A4 page an
 * image becomes and where the image sits on it.
 * Kept free of heavy imports: the shared flow reads headers on the main thread.
 */
import type { PageSize } from "../page-list";
import type { ImageFormat } from "./image-names";

// The name check is its own tiny module: the flow needs it on every pick, the rest only for pictures.
export { imageFormatOfName, type ImageFormat } from "./image-names";

/** Decode cap per image (memory): 50 megapixels. */
export const MAX_IMAGE_PIXELS = 50_000_000;
/** Margin around an image on its page, in points. */
export const IMAGE_MARGIN = 36;

export type ImageProbe = { format: ImageFormat; width: number; height: number };

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const i32le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

/** Format from the first bytes (the content decides, not the name). */
export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
  if (b.length >= 2 && ascii(b, 0, 2) === "BM") return "bmp";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42))) return "tiff";
  return null;
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    o += 2 + len;
  }
  return null;
}

/**
 * Pixel size from the header, without decoding. Null when the bytes are not
 * an image we can read. TIFF needs its decoder (multi-frame): see `tiff.ts`.
 */
export function probeImage(b: Uint8Array): ImageProbe | null {
  const format = sniffFormat(b);
  let size: { width: number; height: number } | null = null;
  switch (format) {
    case "png":
      if (b.length >= 24 && ascii(b, 12, 4) === "IHDR") size = { width: u32be(b, 16), height: u32be(b, 20) };
      break;
    case "jpeg":
      size = jpegSize(b);
      break;
    case "gif":
      if (b.length >= 10) size = { width: u16le(b, 6), height: u16le(b, 8) };
      break;
    case "bmp":
      if (b.length >= 26) {
        const header = b[14] | (b[15] << 8);
        size = header === 12 ? { width: u16le(b, 18), height: u16le(b, 20) } : { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
      }
      break;
    case "webp": {
      const chunk = b.length >= 16 ? ascii(b, 12, 4) : "";
      if (chunk === "VP8 " && b.length >= 30) size = { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
      else if (chunk === "VP8L" && b.length >= 25) {
        const b1 = b[22], b2 = b[23], b3 = b[24];
        size = { width: 1 + (b[21] | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
      } else if (chunk === "VP8X" && b.length >= 30) size = { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
      break;
    }
    default:
      return null;
  }
  if (!format || !size || size.width < 1 || size.height < 1) return null;
  return { format, ...size };
}

export const exceedsPixelCap = (width: number, height: number) => width * height > MAX_IMAGE_PIXELS;

/** The A4 page an image becomes: portrait for portrait or square images, landscape for landscape ones. */
export function imagePageSize(width: number, height: number): PageSize {
  return width > height ? { width: 842, height: 595 } : { width: 595, height: 842 };
}

/**
 * Where the image is drawn on its page: centered, inside the margin, aspect
 * ratio kept, and never larger than its size at 72 dpi (1 px = 1 pt).
 */
export function imagePlacement(width: number, height: number): { page: PageSize; x: number; y: number; width: number; height: number } {
  const page = imagePageSize(width, height);
  const scale = Math.min(1, (page.width - 2 * IMAGE_MARGIN) / width, (page.height - 2 * IMAGE_MARGIN) / height);
  const w = width * scale;
  const h = height * scale;
  return { page, width: w, height: h, x: (page.width - w) / 2, y: (page.height - h) / 2 };
}
