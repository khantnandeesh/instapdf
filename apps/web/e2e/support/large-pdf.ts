/**
 * Test-time fixtures that are too big to commit:
 * - a >= 40 MB, 3-page PDF (page 1 carries a large uncompressed image of random
 *   bytes, so the size cannot shrink by recompression);
 * - a > 100 MB sparse file for the size cap (never parsed, so its content does not matter).
 */
import { randomBytes } from "node:crypto";
import { open, stat, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";

export const LARGE_MIN_BYTES = 40 * 1024 * 1024;

export async function makeLargePdf(path: string): Promise<number> {
  try {
    const s = await stat(path);
    if (s.size >= LARGE_MIN_BYTES) return s.size;
  } catch {}
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const side = 3800; // 3800 x 3800 x 3 bytes ~= 43 MB of image data
  const image = doc.context.stream(randomBytes(side * side * 3), {
    Type: "XObject",
    Subtype: "Image",
    Width: side,
    Height: side,
    ColorSpace: "DeviceRGB",
    BitsPerComponent: 8,
  });
  const imageRef = doc.context.register(image);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i}`, { x: 72, y: 760, size: 36, font });
    if (i === 1) {
      const name = page.node.newXObject("Im", imageRef);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(300, 0, 0, 300, 150, 300), drawObject(name), popGraphicsState());
    }
  }
  const bytes = await doc.save({ useObjectStreams: false });
  await writeFile(path, bytes);
  return bytes.length;
}

/** A sparse file of `bytes` size (instant to create, uses no disk). */
export async function makeSparseFile(path: string, bytes: number) {
  const fh = await open(path, "w");
  await fh.truncate(bytes);
  await fh.close();
}
