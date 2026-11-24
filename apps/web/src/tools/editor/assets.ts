"use client";
/**
 * Images on this device: picked, pasted or dropped files become PNG or JPEG assets (other formats
 * are redrawn to PNG through a canvas), kept in memory with a blob URL for the canvas. Nothing is
 * uploaded.
 */
import type { Asset } from "@/lib/editor/build";
import { newId } from "@/lib/editor/model";
import { fitSide, imageSize, MAX_DECODE_PIXELS, MAX_SIDE, tooManyPixels } from "@/lib/editor/image-header";
import { removeBackground } from "@/lib/editor/markup";
import type { Runtime, RuntimeAsset } from "./controller";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
/** Images are placed at 96 px per inch: 1 px = 0.75 pt. */
const PX_TO_PT = 0.75;

export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name);

export function sniffMime(b: Uint8Array): Asset["mime"] | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("toBlob"))), "image/png"),
  );
}

/** Adds an asset whose bytes are PNG or JPEG (already checked by `imageFromFile`). */
export async function addAsset(rt: Runtime, asset: Asset, id = newId("img")): Promise<string> {
  const url = URL.createObjectURL(new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime }));
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const old = rt.assets[id];
  if (old) URL.revokeObjectURL(old.url);
  rt.assets[id] = { ...asset, url, w: img.naturalWidth * PX_TO_PT, h: img.naturalHeight * PX_TO_PT };
  return id;
}

/**
 * Turns any supported image file into an asset. `clean` makes a near-white background
 * transparent. PNG and JPEG declaring too many pixels are refused before decoding ("too-large");
 * anything with a side over MAX_SIDE is redrawn smaller.
 */
export async function imageFromFile(rt: Runtime, file: File, clean = false): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("too-big");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (mime) {
    const size = imageSize(bytes, mime);
    if (!size) throw new Error("unreadable");
    if (tooManyPixels(size)) throw new Error("too-large");
    if (!clean && Math.max(size.width, size.height) <= MAX_SIDE) return addAsset(rt, { bytes, mime });
  }
  const src = URL.createObjectURL(new Blob([bytes], { type: mime ?? (file.type || "image/png") }));
  let c: HTMLCanvasElement | null = null;
  try {
    const img = await loadImage(src);
    const nw = img.naturalWidth || 300;
    const nh = img.naturalHeight || 150;
    if (nw * nh > MAX_DECODE_PIXELS) throw new Error("too-large");
    const { width: w, height: h } = fitSide(nw, nh);
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    if (clean) {
      const data = ctx.getImageData(0, 0, w, h);
      removeBackground(data.data);
      ctx.putImageData(data, 0, 0);
    }
    return await addAsset(rt, { bytes: await canvasPng(c), mime: "image/png" });
  } finally {
    URL.revokeObjectURL(src);
    if (c) c.width = c.height = 0;
  }
}

/** The message for an image that couldn't be added. */
export function imageError(e: unknown, short = false): string {
  const m = (e as Error)?.message;
  if (m === "too-big") return short ? "Images up to 25 MB" : "Images up to 25 MB, please.";
  if (m === "too-large") return short ? "That image is too large (over 40 megapixels)" : "That image is too large: up to 40 megapixels, please.";
  return "That image couldn’t be read.";
}

export function releaseAssets(assets: Record<string, RuntimeAsset>) {
  for (const a of Object.values(assets)) URL.revokeObjectURL(a.url);
}

/** Drops one asset and its blob URL. */
export function releaseAsset(rt: Runtime, id: string) {
  const a = rt.assets[id];
  if (!a) return;
  URL.revokeObjectURL(a.url);
  delete rt.assets[id];
}

/** Drops every asset not in `keep`. Returns the ids dropped. */
export function releaseUnused(rt: Runtime, keep: ReadonlySet<string>): string[] {
  const gone = Object.keys(rt.assets).filter((id) => !keep.has(id));
  gone.forEach((id) => releaseAsset(rt, id));
  return gone;
}

/** Bytes and type only (for the build worker and the device store); `only` limits it to those ids. */
export const plainAssets = (assets: Record<string, RuntimeAsset>, only?: ReadonlySet<string>): Record<string, Asset> =>
  Object.fromEntries(Object.entries(assets).filter(([k]) => !only || only.has(k)).map(([k, a]) => [k, { bytes: a.bytes, mime: a.mime }]));
