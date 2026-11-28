// Writes colours.pdf, the F13 Grayscale fixture: one page with every kind of colour the tool converts.
// Coloured text, an RGB and a CMYK fill, a gradient, a tiling pattern, a JPEG photo, a lossless
// picture and a palette picture. Run from apps/web:  node tests/fixtures/generate-colours.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cmyk, PDFDocument, PDFName, rgb, StandardFonts } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const doc = await PDFDocument.create();
doc.setTitle("Colours");
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const font = await doc.embedFont(StandardFonts.HelveticaBold);
const page = doc.addPage([595, 842]);
page.drawText("Red heading", { x: 40, y: 780, size: 28, font, color: rgb(0.85, 0.1, 0.1) });
page.drawText("Blue words under it", { x: 40, y: 750, size: 16, font, color: rgb(0.1, 0.2, 0.8) });
page.drawRectangle({ x: 40, y: 640, width: 150, height: 80, color: rgb(0.1, 0.7, 0.3), borderColor: rgb(0.9, 0.5, 0), borderWidth: 4 });
page.drawRectangle({ x: 210, y: 640, width: 150, height: 80, color: cmyk(0, 0.9, 0.9, 0) });
const photo = await doc.embedJpg(await readFile(join(here, "delta.jpg")));
page.drawImage(photo, { x: 40, y: 400, width: 165, height: 220 });
const drawing = await doc.embedPng(await readFile(join(here, "charlie.png")));
page.drawImage(drawing, { x: 225, y: 440, width: 240, height: 180 });

const ctx = doc.context;
const N = PDFName.of;
const fn = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1, 0.8, 0], C1: [0.5, 0, 0.8], N: 1 }));
const shading = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: "DeviceRGB", Coords: [380, 0, 555, 0], Function: fn, Extend: [true, true] }));
const tile = ctx.register(ctx.stream("0 0.6 0.9 rg 0 0 6 6 re f 1 0.3 0.5 rg 6 6 6 6 re f", { Type: "Pattern", PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 12, 12], XStep: 12, YStep: 12, Resources: {} }));
// Four colours in a palette, sixteen pixels.
const palette = ctx.register(
  ctx.flateStream(Uint8Array.of(0, 1, 2, 3, 1, 2, 3, 0, 2, 3, 0, 1, 3, 0, 1, 2), {
    Type: "XObject",
    Subtype: "Image",
    Width: 4,
    Height: 4,
    BitsPerComponent: 8,
    ColorSpace: ["Indexed", "DeviceRGB", 3, ctx.obj("x")],
  }),
);
const { PDFHexString, PDFArray } = await import("@cantoo/pdf-lib");
ctx.lookup(palette).dict.lookup(N("ColorSpace"), PDFArray).set(3, PDFHexString.of("ff0000" + "00ff00" + "0000ff" + "ffff00"));
const res = page.node.Resources();
res.set(N("Shading"), ctx.obj({ Sh0: shading }));
res.set(N("Pattern"), ctx.obj({ Pt0: tile }));
res.lookup(N("XObject")).set(N("Pal"), palette);
const extra = ctx.register(ctx.stream("q 380 640 175 80 re W n /Sh0 sh Q q /Pattern cs /Pt0 scn 40 280 200 100 re f Q q 100 0 0 100 280 280 cm /Pal Do Q"));
const first = page.node.get(N("Contents"));
page.node.set(N("Contents"), ctx.obj([...(first instanceof PDFArray ? first.asArray() : [first]), extra]));
await writeFile(join(here, "colours.pdf"), await doc.save());
console.log("wrote colours.pdf");
