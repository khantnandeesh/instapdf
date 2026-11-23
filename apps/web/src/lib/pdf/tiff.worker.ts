/// <reference lib="webworker" />
/**
 * TIFF worker: walks a TIFF's structure (probe) and decodes frames to small
 * ImageBitmaps for thumbnails, off the main thread. Each file is walked once
 * and kept while its thumbnails are being drawn (a few files at most).
 */
import { decodeTiffFrame, readTiff, type TiffFile } from "./tiff";

export type TiffRequest =
  | { id: number; op: "probe"; blob: Blob }
  | { id: number; op: "thumb"; key: string; blob: Blob; frame: number; max: number }
  | { id: number; op: "forget"; key: string };
export type TiffResponse =
  | { id: number; ok: true; frames?: { width: number; height: number }[]; bitmap?: ImageBitmap }
  | { id: number; ok: false; problem: "unreadable" | "tooLarge" };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const KEEP = 4;
const files = new Map<string, Promise<{ bytes: Uint8Array; file: TiffFile }>>();

function parsed(key: string, blob: Blob) {
  let p = files.get(key);
  if (!p) {
    p = blob.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      const r = readTiff(bytes);
      if (!("frames" in r)) throw new Error(r.problem);
      return { bytes, file: r };
    });
    files.set(key, p);
    p.catch(() => files.delete(key));
    while (files.size > KEEP) files.delete(files.keys().next().value!);
  }
  return p;
}

scope.onmessage = async (event: MessageEvent<TiffRequest>) => {
  const msg = event.data;
  const post = (r: TiffResponse, transfer: Transferable[] = []) => scope.postMessage(r, transfer);
  try {
    if (msg.op === "forget") {
      files.delete(msg.key);
      return;
    }
    if (msg.op === "probe") {
      const r = readTiff(new Uint8Array(await msg.blob.arrayBuffer()));
      if ("frames" in r) post({ id: msg.id, ok: true, frames: r.frames.map(({ width, height }) => ({ width, height })) });
      else post({ id: msg.id, ok: false, problem: r.problem });
      return;
    }
    const { bytes, file } = await parsed(msg.key, msg.blob);
    const f = await decodeTiffFrame(bytes, file, msg.frame);
    const full = await createImageBitmap(new ImageData(new Uint8ClampedArray(f.rgba.buffer as ArrayBuffer, f.rgba.byteOffset, f.rgba.length), f.width, f.height));
    const k = Math.min(1, msg.max / Math.max(f.width, f.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(f.width * k)), Math.max(1, Math.round(f.height * k)));
    canvas.getContext("2d")!.drawImage(full, 0, 0, canvas.width, canvas.height);
    full.close();
    const bitmap = canvas.transferToImageBitmap();
    post({ id: msg.id, ok: true, bitmap }, [bitmap]);
  } catch {
    post({ id: msg.id, ok: false, problem: "unreadable" });
  }
};
