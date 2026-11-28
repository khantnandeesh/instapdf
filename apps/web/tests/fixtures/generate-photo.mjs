// Writes photo.pdf, the F6 Compress fixture: two pages with text, a photo saved at 300 pixels an
// inch (lossless, so it weighs a lot), the same photo shown small on page 2, a picture with a soft
// see-through edge, and an icon too small to be worth packing. Run from apps/web:
//   node tests/fixtures/generate-photo.mjs
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFArray, PDFDocument, PDFName, StandardFonts, rgb } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const N = PDFName.of;
const doc = await PDFDocument.create();
doc.setTitle("Photo");
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const font = await doc.embedFont(StandardFonts.Helvetica);
const ctx = doc.context;

// A made-up landscape: soft waves of colour with a little grain, like a camera's.
function photo(width, height) {
  const px = new Uint8Array(width * height * 3);
  let s = 11;
  for (let y = 0, o = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grain = ((s = (s * 1103515245 + 12345) >>> 0) >>> 30) - 2;
      const sky = y / height;
      px[o++] = Math.max(0, Math.min(255, 120 + 90 * Math.sin(x / 37) * Math.cos(y / 53) + 40 * sky + grain));
      px[o++] = Math.max(0, Math.min(255, 140 + 70 * Math.sin((x + y) / 61) + grain));
      px[o++] = Math.max(0, Math.min(255, 200 - 120 * sky + 30 * Math.cos(x / 23) + grain));
    }
  }
  return px;
}
const image = (width, height, data, extra = {}) => ctx.register(ctx.flateStream(data, { Type: "XObject", Subtype: "Image", Width: width, Height: height, BitsPerComponent: 8, ColorSpace: "DeviceRGB", ...extra }));
const big = image(480, 360, photo(480, 360));
// A round soft edge for the second picture.
const edge = new Uint8Array(160 * 160);
for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) edge[y * 160 + x] = Math.max(0, Math.min(255, (78 - Math.hypot(x - 80, y - 80)) * 16));
const mask = ctx.register(ctx.flateStream(edge, { Type: "XObject", Subtype: "Image", Width: 160, Height: 160, BitsPerComponent: 8, ColorSpace: "DeviceGray" }));
const round = image(160, 160, photo(160, 160), { SMask: mask });
const icon = image(8, 8, photo(8, 8));

// Adds a content stream after what the page already draws.
const add = (page, ops) => {
  const first = page.node.get(N("Contents"));
  page.node.set(N("Contents"), ctx.obj([...(first instanceof PDFArray ? first.asArray() : [first]), ctx.register(ctx.stream(ops))]));
};
const one = doc.addPage([595, 842]);
one.drawText("A page with a photo", { x: 40, y: 780, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
one.drawText("These words stay words: sharp at any zoom, and still there to select.", { x: 40, y: 752, size: 12, font });
one.drawRectangle({ x: 40, y: 500, width: 200, height: 60, color: rgb(0.85, 0.2, 0.35) });
one.node.Resources().set(N("XObject"), ctx.obj({ Photo: big, Round: round, Icon: icon }));
add(one, "q 115.2 0 0 86.4 40 620 cm /Photo Do Q q 38.4 0 0 38.4 200 640 cm /Round Do Q q 12 0 0 12 260 650 cm /Icon Do Q");
const two = doc.addPage([595, 842]);
two.drawText("The same photo, shown smaller", { x: 40, y: 780, size: 18, font });
two.node.Resources().set(N("XObject"), ctx.obj({ Photo: big }));
add(two, "q 57.6 0 0 43.2 40 700 cm /Photo Do Q");
await writeFile(join(here, "photo.pdf"), await doc.save());
console.log("wrote photo.pdf");
