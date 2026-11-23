/**
 * TIFF input (one page per frame) through UTIF.js (MIT). Always imported
 * lazily: on the main thread for the first TIFF thumbnail, in the processing
 * worker for a run with a TIFF in it. Never part of a route's first load.
 */
import type { IFD } from "utif";
import { exceedsPixelCap } from "./images";

type Utif = (typeof import("utif"))["default"];

let utif: Promise<Utif> | null = null;
const loadUtif = () => (utif ??= import("utif").then((m) => (m.default ?? m) as Utif));

const num = (ifd: IFD, tag: string) => (Array.isArray(ifd[tag]) ? Number((ifd[tag] as unknown[])[0]) : 0);

/** Image frames only: reduced-resolution previews (NewSubfileType bit 0) are skipped. */
function frames(ifds: IFD[]): IFD[] {
  return ifds.filter((ifd) => num(ifd, "t256") > 0 && num(ifd, "t257") > 0 && !(num(ifd, "t254") & 1));
}

export type TiffFrameSize = { width: number; height: number };

/** Frame sizes, read from the IFDs without decoding pixels. Null if the bytes are not a TIFF it can read. */
export async function tiffFrameSizes(bytes: Uint8Array): Promise<TiffFrameSize[] | null> {
  const UTIF = await loadUtif();
  try {
    const list = frames(UTIF.decode(bytes));
    return list.length ? list.map((ifd) => ({ width: num(ifd, "t256"), height: num(ifd, "t257") })) : null;
  } catch {
    return null;
  }
}

/** Decodes frame `index` to 8-bit RGBA. Throws for frames over the pixel cap or that cannot be decoded. */
export async function decodeTiffFrame(bytes: Uint8Array, index: number): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const UTIF = await loadUtif();
  const all = UTIF.decode(bytes);
  const ifd = frames(all)[index];
  if (!ifd) throw new Error("TIFF frame not found");
  const width = num(ifd, "t256");
  const height = num(ifd, "t257");
  if (exceedsPixelCap(width, height)) throw new Error("TIFF frame too large");
  UTIF.decodeImage(bytes, ifd, all);
  const rgba = UTIF.toRGBA8(ifd);
  if (rgba.length < width * height * 4) throw new Error("TIFF frame could not be decoded");
  return { rgba: new Uint8Array(rgba.buffer, rgba.byteOffset, width * height * 4), width, height };
}
