"use client";
/**
 * Images on this device: picked, pasted or dropped files become PNG or JPEG assets (other formats
 * are redrawn to PNG through a canvas), kept in memory with a blob URL for the canvas. Nothing is
 * uploaded.
 */
import type { Asset } from "@/lib/editor/build";
import { newId } from "@/lib/editor/model";
import { removeBackground } from "@/lib/editor/markup";
import type { Runtime, RuntimeAsset } from "./controller";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
/** Images are placed at 96 px per inch: 1 px = 0.75 pt. */
const PX_TO_PT = 0.75;
const MAX_SIDE = 4096;

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

/** Adds an asset whose bytes are PNG or JPEG. */
export async function addAsset(rt: Runtime, asset: Asset, id = newId("img")): Promise<string> {
  const url = URL.createObjectURL(new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime }));
  const img = await loadImage(url);
  rt.assets[id] = { ...asset, url, w: img.naturalWidth * PX_TO_PT, h: img.naturalHeight * PX_TO_PT };
  return id;
}

/** Turns any supported image file into an asset. `clean` makes a near-white background transparent. */
export async function imageFromFile(rt: Runtime, file: File, clean = false): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("too-big");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (mime && !clean) return addAsset(rt, { bytes, mime });
  const src = URL.createObjectURL(new Blob([bytes], { type: file.type || "image/png" }));
  try {
    const img = await loadImage(src);
    let w = img.naturalWidth || 300;
    let h = img.naturalHeight || 150;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    if (clean) {
      const data = ctx.getImageData(0, 0, w, h);
      removeBackground(data.data);
      ctx.putImageData(data, 0, 0);
    }
    return addAsset(rt, { bytes: await canvasPng(c), mime: "image/png" });
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function releaseAssets(assets: Record<string, RuntimeAsset>) {
  for (const a of Object.values(assets)) URL.revokeObjectURL(a.url);
}

/** Bytes and type only (for the build worker and the device store). */
export const plainAssets = (assets: Record<string, RuntimeAsset>): Record<string, Asset> =>
  Object.fromEntries(Object.entries(assets).map(([k, a]) => [k, { bytes: a.bytes, mime: a.mime }]));
