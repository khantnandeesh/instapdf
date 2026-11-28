/** Flatten to pictures (spec F10 §2b), the worker's half: one picture per page, each filling its page. */
import { PDFDocument } from "@cantoo/pdf-lib";

export type PicturePage = { jpg: Blob; width: number; height: number };

export async function picturesPdf(pages: readonly PicturePage[], title: string | undefined, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const image = await doc.embedJpg(new Uint8Array(await p.jpg.arrayBuffer()));
    doc.addPage([p.width, p.height]).drawImage(image, { x: 0, y: 0, width: p.width, height: p.height });
    onProgress?.((i + 1) / pages.length);
  }
  return doc.save();
}
