/**
 * TIFF input (one page per frame). The file structure is read here, by a
 * bounded walker, never by UTIF.decode: that follows IFD, sub-IFD and
 * MakerNote offsets without cycle or size checks, so a 26-byte TIFF whose
 * IFD points at itself loops until the tab runs out of memory.
 *
 * The walker follows the main IFD chain only (visited set, bounds checks,
 * at most 1,000 frames), copies each tag with a bounded count, and checks
 * strip/tile offsets against the file. Only then is a frame handed to
 * UTIF.decodeImage (UTIF.js, MIT), which is imported lazily. Decoding runs
 * in workers (thumbnails: tiff.worker.ts; merge: processing.worker.ts).
 */
import { exceedsPixelCap } from "./images";

/** IFD in UTIF's shape: "t<tag>" -> values. */
export type TiffIfd = Record<string, unknown>;
export type TiffFrame = { width: number; height: number; ifd: TiffIfd };
export type TiffFile = { frames: TiffFrame[] };
export type TiffProblem = "unreadable" | "tooLarge";

export const MAX_TIFF_FRAMES = 1000;
/** Bits per pixel above this are not a picture format we take. */
export const MAX_TIFF_BITS_PER_PIXEL = 64;
/** Estimated memory to decode one frame (raw buffer + RGBA). */
export const MAX_TIFF_DECODE_BYTES = 400 * 1024 * 1024;
const MAX_VALUES_PER_TAG = 4_000_000;
/**
 * Per-file budget: many IFDs can point their tags at one shared block, so
 * per-tag limits alone let a small file expand without bound. All tags
 * together may read at most twice the file (plus a little) and 8M values.
 */
const MAX_TOTAL_VALUES = 8_000_000;
const budgetBytes = (len: number) => 2 * len + 64 * 1024;
/** Tags UTIF.decodeImage reads; everything else is skipped (and costs nothing). */
const KEEP_TAGS = new Set([254, 256, 257, 258, 259, 262, 266, 273, 277, 278, 279, 284, 317, 320, 322, 323, 324, 325, 338, 339, 347, 513, 514, 529, 530, 531, 532]);

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

class Bad extends Error {
  constructor(readonly problem: TiffProblem) {
    super(problem);
  }
}

/** Reads the main IFD chain. Returns the frames, or the reason the file is refused. */
export function readTiff(b: Uint8Array): TiffFile | { problem: TiffProblem } {
  try {
    return walk(b);
  } catch (e) {
    return { problem: e instanceof Bad ? e.problem : "unreadable" };
  }
}

function walk(b: Uint8Array): TiffFile {
  if (b.length < 8) throw new Bad("unreadable");
  const le = b[0] === 0x49 && b[1] === 0x49;
  if (!le && !(b[0] === 0x4d && b[1] === 0x4d)) throw new Bad("unreadable");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  if (u16(2) !== 42) throw new Bad("unreadable");
  const len = b.length;
  const visited = new Set<number>();
  const frames: TiffFrame[] = [];
  let offset = u32(4);
  let ifdCount = 0;
  let spentBytes = 0;
  let spentValues = 0;
  while (offset !== 0) {
    if (visited.has(offset) || offset < 8 || offset + 2 > len) throw new Bad("unreadable");
    visited.add(offset);
    if (++ifdCount > MAX_TIFF_FRAMES) throw new Bad("unreadable");
    const count = u16(offset);
    const end = offset + 2 + count * 12;
    if (end + 4 > len) throw new Bad("unreadable");
    const ifd: TiffIfd = {};
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const num = u32(e + 4);
      const size = TYPE_SIZE[type];
      if (!size || num === 0 || !KEEP_TAGS.has(tag)) continue; // unknown types and tags UTIF does not read are skipped
      if (num > MAX_VALUES_PER_TAG) throw new Bad("unreadable");
      const bytes = size * num;
      spentBytes += bytes;
      spentValues += num;
      if (spentBytes > budgetBytes(len) || spentValues > MAX_TOTAL_VALUES) throw new Bad("unreadable");
      const at = bytes <= 4 ? e + 8 : u32(e + 8);
      if (at + bytes > len) throw new Bad("unreadable");
      let values: unknown;
      if (type === 1 || type === 7 || type === 6) values = b.subarray(at, at + num);
      else if (type === 2) values = [String.fromCharCode(...b.subarray(at, at + Math.min(1024, Math.max(0, num - 1))))];
      else if (type === 3 || type === 4) {
        // Compact typed arrays (UTIF only indexes them and reads .length).
        const arr = type === 3 ? new Uint16Array(num) : new Uint32Array(num);
        for (let k = 0; k < num; k++) arr[k] = type === 3 ? u16(at + k * 2) : u32(at + k * 4);
        values = arr;
      } else {
        const arr: number[] = new Array(num);
        for (let k = 0; k < num; k++) {
          const o = at + k * size;
          arr[k] =
            type === 3
              ? u16(o)
              : type === 4
                ? u32(o)
                : type === 8
                  ? view.getInt16(o, le)
                  : type === 9
                    ? view.getInt32(o, le)
                    : type === 11
                      ? view.getFloat32(o, le)
                      : type === 12
                        ? view.getFloat64(o, le)
                        : u32(o) / (u32(o + 4) || 1);
        }
        values = arr;
      }
      ifd[`t${tag}`] = values;
    }
    offset = u32(end);
    const width = num0(ifd, "t256");
    const height = num0(ifd, "t257");
    const reduced = num0(ifd, "t254") & 1; // reduced-resolution preview
    if (width > 0 && height > 0 && !reduced) {
      check(ifd, width, height, len);
      frames.push({ width, height, ifd });
    }
  }
  if (!frames.length) throw new Bad("unreadable");
  return { frames };
}

type NumList = ArrayLike<number>;
const isList = (v: unknown): v is NumList => Array.isArray(v) || ArrayBuffer.isView(v);
const num0 = (ifd: TiffIfd, tag: string) => (isList(ifd[tag]) ? Number((ifd[tag] as NumList)[0]) || 0 : 0);

/** Size and data checks that keep a hostile frame away from the decoder. */
function check(ifd: TiffIfd, width: number, height: number, len: number) {
  const bps = isList(ifd.t258) ? Array.from(ifd.t258 as NumList) : [1];
  const spp = num0(ifd, "t277") || bps.length || 1;
  const bitsPerPixel = bps.reduce((m, v) => Math.max(m, v), 1) * Math.max(spp, bps.length);
  if (bitsPerPixel > MAX_TIFF_BITS_PER_PIXEL) throw new Bad("unreadable");
  if (exceedsPixelCap(width, height)) throw new Bad("tooLarge");
  if (width * height * (4 + bitsPerPixel / 8) > MAX_TIFF_DECODE_BYTES) throw new Bad("tooLarge");
  const offsets = (ifd.t273 ?? ifd.t324) as NumList | undefined;
  const counts = (ifd.t279 ?? ifd.t325) as NumList | undefined;
  if (!isList(offsets) || !offsets.length) throw new Bad("unreadable");
  if (isList(counts)) {
    if (counts.length < offsets.length) throw new Bad("unreadable");
    for (let i = 0; i < offsets.length; i++) if (offsets[i] + counts[i] > len) throw new Bad("unreadable");
  } else {
    for (let i = 0; i < offsets.length; i++) if (offsets[i] >= len) throw new Bad("unreadable");
  }
  if (ifd.t322 !== undefined) {
    const tw = num0(ifd, "t322");
    const th = num0(ifd, "t323");
    if (tw <= 0 || th <= 0 || Math.ceil(width / tw) * Math.ceil(height / th) > offsets.length) throw new Bad("unreadable");
  }
}

/** Frame sizes, or null when the file is refused (any reason). */
export function tiffFrameSizes(bytes: Uint8Array): { width: number; height: number }[] | null {
  const r = readTiff(bytes);
  return "frames" in r ? r.frames.map(({ width, height }) => ({ width, height })) : null;
}

type Utif = (typeof import("utif"))["default"];
let utif: Promise<Utif> | null = null;
const loadUtif = () => (utif ??= import("utif").then((m) => (m.default ?? m) as Utif));

/** Decodes one frame of an already-walked file to 8-bit RGBA. */
export async function decodeTiffFrame(bytes: Uint8Array, file: TiffFile, index: number): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const frame = file.frames[index];
  if (!frame) throw new Error("TIFF frame not found");
  const UTIF = await loadUtif();
  // A fresh copy of the tag values: decodeImage writes into the IFD object.
  const ifd = { ...frame.ifd } as Parameters<Utif["decodeImage"]>[1];
  UTIF.decodeImage(bytes, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  const n = frame.width * frame.height * 4;
  if (rgba.length < n) throw new Error("TIFF frame could not be decoded");
  return { rgba: new Uint8Array(rgba.buffer, rgba.byteOffset, n), width: frame.width, height: frame.height };
}
