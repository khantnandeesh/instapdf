/**
 * The pictures pdf.js decodes while it reads a page: every packing a PDF can hold (Flate, JPEG,
 * JPEG 2000, CCITT, JBIG2) in every colour space, handed over as plain pixels. No PDF library here.
 */

/** pdf.js image kinds (shared/util ImageKind). */
export const GRAY_1BPP = 1;
export const RGB_24BPP = 2;

export type DecodedImage = { width: number; height: number; kind?: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: ImageBitmap; ref?: unknown };

/** pdf.js pixel data as RGBA (1 bit per pixel, RGB or RGBA in). */
export function toRgba(img: { width: number; height: number; kind?: number; data: Uint8Array | Uint8ClampedArray }): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(width * height * 4);
  if (img.kind === GRAY_1BPP) {
    const stride = (width + 7) >> 3;
    for (let y = 0, o = 0; y < height; y++) {
      for (let x = 0; x < width; x++, o += 4) {
        const v = data[y * stride + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
  } else if (img.kind === RGB_24BPP) {
    for (let i = 0, o = 0; o < out.length; i += 3, o += 4) {
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
      out[o + 3] = 255;
    }
  } else out.set(data.subarray(0, out.length));
  return out;
}

export type Objs = { get(id: string, callback: (value: unknown) => void): unknown };

/** The decoded image behind an operator's id (page-local, or "g_…" when several pages share it). */
export function resolveImage(page: { objs: Objs; commonObjs: Objs }, id: string, signal: AbortSignal): Promise<DecodedImage | null> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    const done = (value: unknown) => {
      signal.removeEventListener("abort", stop);
      resolve(value && typeof value === "object" ? (value as DecodedImage) : null);
    };
    try {
      (id.startsWith("g_") ? page.commonObjs : page.objs).get(id, done);
    } catch {
      done(null);
    }
  });
}
