// Writes the F15 Deskew fixture: tilted.pdf, four pages of text as a scanner might hand them over.
//  page 1  tilted 3° clockwise   page 2  1.5° anticlockwise   page 3  straight   page 4  0.6° clockwise (a slight tilt)
// Run from apps/web:  node tests/fixtures/generate-tilted.mjs
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, concatTransformationMatrix, popGraphicsState, pushGraphicsState } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const WORDS = "the quick brown fox jumps over a lazy dog while seven wizards quietly judge boxes of mixed plum jam".split(" ");
const doc = await PDFDocument.create();
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const font = await doc.embedFont(StandardFonts.Helvetica);
let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
[3, -1.5, 0, 0.6].forEach((tilt, p) => {
  const page = doc.addPage([420, 594]);
  // Clockwise as seen is a negative angle in PDF space; about the middle of the page.
  const t = (-tilt * Math.PI) / 180;
  const [cos, sin, cx, cy] = [Math.cos(t), Math.sin(t), 210, 297];
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy));
  page.drawText(`Scanned page ${p + 1}`, { x: 50, y: 520, size: 18, font });
  for (let line = 0; line < 26; line++) {
    let text = "";
    while (font.widthOfTextAtSize(text, 10) < 280) text += WORDS[Math.floor(rnd() * WORDS.length)] + " ";
    page.drawText(text.trim(), { x: 50, y: 490 - line * 16, size: 10, font });
  }
  page.pushOperators(popGraphicsState());
});
await writeFile(join(here, "tilted.pdf"), await doc.save({ useObjectStreams: false }));
console.log("wrote tilted.pdf");
