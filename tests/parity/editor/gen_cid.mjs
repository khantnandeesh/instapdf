// Identity-H CID TrueType subsets (Chrome/Word-style) with pdf-lib (MIT) + fontkit (MIT): a line
// whose last run is a bold subset with no space glyph, a letter-spaced line, rotated text and a
// /Rotate 270 page. Run from apps/web (for its node_modules):
//   cd apps/web && cp ../../tests/parity/editor/gen_cid.mjs .gen.mjs && node .gen.mjs ../../tests/parity/editor/cid-bold-run.pdf; rm .gen.mjs
import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, setCharacterSpacing, setWordSpacing } from "@cantoo/pdf-lib";
import fontkit from "@cantoo/fontkit";
import fs from "node:fs";
const L = "/usr/share/fonts/truetype/liberation/";
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const serif = await doc.embedFont(fs.readFileSync(L + "LiberationSerif-Regular.ttf"), { subset: true });
const sans = await doc.embedFont(fs.readFileSync(L + "LiberationSans-Bold.ttf"), { subset: true });
const p = doc.addPage([612, 792]);
p.drawText("Invoice total for the month of March", { x: 72, y: 720, size: 11, font: serif });
p.drawText("Office ligatures: official affine fluff", { x: 72, y: 698, size: 11, font: serif });
p.drawText("Mixed", { x: 72, y: 676, size: 11, font: serif });
p.drawText("Bold", { x: 72 + serif.widthOfTextAtSize("Mixed ", 11), y: 676, size: 11, font: sans });
p.pushOperators(pushGraphicsState(), setCharacterSpacing(0.8));
p.drawText("Spaced heading text", { x: 72, y: 654, size: 11, font: serif });
p.pushOperators(popGraphicsState());
p.drawText("Rotated label", { x: 400, y: 300, size: 11, font: serif, rotate: degrees(90) });
const p2 = doc.addPage([612, 792]);
p2.setRotation(degrees(270));
p2.drawText("Landscape page line", { x: 72, y: 700, size: 12, font: serif });
fs.writeFileSync(process.argv[2], await doc.save());
