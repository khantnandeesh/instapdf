// Generates the small fixture PDFs used by unit and e2e tests.
// Run from apps/web:  node tests/fixtures/generate.mjs
// Output is deterministic apart from encryption salts (AES needs random bytes).
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
  PDFString,
  StandardFonts,
  degrees,
} from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

async function makeDoc(pageCount, { rotate = {} } = {}) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer("InstaPDF fixtures");
  doc.setTitle("InstaPDF test fixture");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595, 842]); // A4 portrait
    page.drawText(`Page ${i}`, { x: 72, y: 760, size: 36, font });
    // A marker in the top-left corner makes the orientation visible in thumbnails.
    page.drawRectangle({ x: 24, y: 794, width: 24, height: 24 });
    if (rotate[i]) page.setRotation(degrees(rotate[i]));
  }
  return doc;
}

async function save(name, doc, opts) {
  const bytes = await doc.save(opts);
  await writeFile(join(here, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}

await save("three-pages.pdf", await makeDoc(3));
await save("sixty-pages.pdf", await makeDoc(60));
await save("pre-rotated.pdf", await makeDoc(3, { rotate: { 2: 90 } }));
await save("too-many-pages.pdf", await makeDoc(1001));

for (const name of ["user-pw.pdf", "user-pw-2.pdf"]) {
  const doc = await makeDoc(3);
  doc.encrypt({ userPassword: "test", ownerPassword: "test-owner", algorithm: "AES-256" });
  await save(name, doc, { useObjectStreams: false });
}

{
  const doc = await makeDoc(3);
  doc.encrypt({
    userPassword: "",
    ownerPassword: "owner123",
    algorithm: "AES-256",
    permissions: {
      printing: false,
      modifying: false,
      documentAssembly: false,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
    },
  });
  await save("owner-restricted.pdf", doc, { useObjectStreams: false });
}

// ---- corpus fixtures (QA): scanned image, form, bookmarks, mixed sizes, non-Latin text ----

/** Minimal grayscale PNG encoder, so the "scan" needs no image dependency. */
function grayPng(width, height, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = pixel(x, y);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

{
  // Image-only pages, like a scanner makes: no text layer at all.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  for (let i = 1; i <= 2; i++) {
    const png = grayPng(298, 421, (x, y) => (y > 30 && y < 50 && x > 30 && x < 30 + 60 * i ? 20 : 235 + ((x * 7 + y * 13 + i) % 17)));
    const img = await doc.embedPng(png);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  }
  await save("scanned.pdf", doc);
}

{
  // AcroForm with a text field and a checkbox on page 1.
  const doc = await makeDoc(2);
  const form = doc.getForm();
  const name = form.createTextField("full_name");
  name.setText("Ada Lovelace");
  name.addToPage(doc.getPage(0), { x: 72, y: 600, width: 300, height: 28 });
  const agree = form.createCheckBox("agree");
  agree.check();
  agree.addToPage(doc.getPage(0), { x: 72, y: 550, width: 20, height: 20 });
  await save("form.pdf", doc);
}

{
  // Outline (bookmarks) with one entry per page.
  const doc = await makeDoc(3);
  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const itemRefs = doc.getPages().map(() => ctx.nextRef());
  doc.getPages().forEach((page, i) => {
    const item = ctx.obj({
      Title: PDFString.of(`Chapter ${i + 1}`),
      Parent: outlinesRef,
      Dest: [page.ref, "Fit"],
    });
    if (i > 0) item.set(PDFName.of("Prev"), itemRefs[i - 1]);
    if (i < itemRefs.length - 1) item.set(PDFName.of("Next"), itemRefs[i + 1]);
    ctx.assign(itemRefs[i], item);
  });
  ctx.assign(outlinesRef, ctx.obj({ Type: "Outlines", First: itemRefs[0], Last: itemRefs.at(-1), Count: PDFNumber.of(itemRefs.length) }));
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  await save("bookmarks.pdf", doc);
}

{
  // A4 portrait, US Letter landscape, A5 portrait.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  [[595, 842], [792, 612], [420, 595]].forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: h - 60, size: 24, font });
  });
  await save("mixed-sizes.pdf", doc);
}

{
  // Non-Latin text (Cyrillic, Greek, CJK, Arabic) through a Type0 font with a
  // ToUnicode map, so text extraction is exact. The font is not embedded (no
  // font file or dependency needed); viewers substitute a font for display.
  const text = "Привет мир · Γειά σου · 你好世界 · مرحبا";
  const chars = Array.from(text);
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const ctx = doc.context;
  const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, "0");
  const utf16 = (ch) => Array.from(Buffer.from(ch, "utf16le").swap16()).map((b) => hex(b, 2)).join("");
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /InstaPDF-Fixture-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange <0000> <FFFF> endcodespacerange",
    `${chars.length} beginbfchar`,
    ...chars.map((ch, i) => `<${hex(i + 1)}> <${utf16(ch)}>`),
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  const toUnicode = ctx.register(ctx.flateStream(cmap));
  const descriptor = ctx.register(
    ctx.obj({ Type: "FontDescriptor", FontName: "NotoSans", Flags: 4, FontBBox: [-500, -300, 1500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: -300, CapHeight: 700, StemV: 80 }),
  );
  const cidFont = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "NotoSans",
      CIDSystemInfo: { Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 },
      FontDescriptor: descriptor,
      DW: 1000,
    }),
  );
  const font = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type0", BaseFont: "NotoSans", Encoding: "Identity-H", DescendantFonts: [cidFont], ToUnicode: toUnicode }));
  for (let p = 1; p <= 2; p++) {
    const page = doc.addPage([595, 842]);
    const key = page.node.newFontDictionary("F1", font);
    page.pushOperators(
      PDFOperator.of(Ops.BeginText),
      PDFOperator.of(Ops.SetFontAndSize, [key, PDFNumber.of(12)]),
      PDFOperator.of(Ops.MoveText, [PDFNumber.of(72), PDFNumber.of(760)]),
      PDFOperator.of(Ops.ShowText, [PDFHexString.of(chars.map((_, i) => hex(i + 1)).join(""))]),
      PDFOperator.of(Ops.EndText),
    );
  }
  await save("non-latin.pdf", doc);
}

// ---- F3 Merge fixtures (spec F3 §7) ----

/** Writes a (nested) outline: items are { title, page (0-based), children? }. */
function addOutline(doc, items) {
  const ctx = doc.context;
  const pages = doc.getPages();
  const rootRef = ctx.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef());
    let count = 0;
    list.forEach((item, i) => {
      const dict = ctx.obj({ Title: PDFHexString.fromText(item.title), Parent: parentRef, Dest: [pages[item.page].ref, "XYZ", null, null, null] });
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
      if (item.children?.length) {
        const kids = build(item.children, refs[i]);
        dict.set(PDFName.of("First"), kids.refs[0]);
        dict.set(PDFName.of("Last"), kids.refs.at(-1));
        dict.set(PDFName.of("Count"), PDFNumber.of(kids.count));
        count += kids.count;
      }
      ctx.assign(refs[i], dict);
      count++;
    });
    return { refs, count };
  };
  const top = build(items, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: top.refs[0], Last: top.refs.at(-1), Count: PDFNumber.of(top.count) }));
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
}

/** One text line per page, e.g. "Alpha 1"; `title` null leaves the Info /Title out. */
async function textDoc(size, lines, title) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer("InstaPDF fixtures");
  if (title) doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = doc.addPage(size);
    page.drawText(line, { x: 72, y: size[1] - 100, size: 36, font });
  }
  return doc;
}

{
  const alpha = await textDoc([595, 842], ["Alpha 1", "Alpha 2", "Alpha 3"], "Alpha Report");
  addOutline(alpha, [
    { title: "Alpha intro", page: 0, children: [{ title: "Alpha detail", page: 1 }] },
    { title: "Alpha end", page: 2 },
  ]);
  await save("alpha.pdf", alpha);
  const bravo = await textDoc([792, 612], ["Bravo 1", "Bravo 2"], "Bravo Brief");
  addOutline(bravo, [{ title: "Bravo start", page: 0 }]);
  await save("bravo.pdf", bravo);
  await save("echo.pdf", await textDoc([595, 842], ["Echo 1"], null));
  await save("file2.pdf", await textDoc([595, 842], ["File 2"], null));
  await save("File10.pdf", await textDoc([595, 842], ["File 10"], null));
  await save("résumé-日本.pdf", await textDoc([595, 842], ["Unicode 1"], null));
  for (const [file, value, withCheck] of [["form-a.pdf", "Ann", true], ["form-b.pdf", "Ben", false]]) {
    const doc = await textDoc([595, 842], [file === "form-a.pdf" ? "Form A" : "Form B"], null);
    const form = doc.getForm();
    const name = form.createTextField("name");
    name.setText(value);
    name.addToPage(doc.getPage(0), { x: 72, y: 600, width: 300, height: 28 });
    if (withCheck) {
      const agree = form.createCheckBox("agree");
      agree.check();
      agree.addToPage(doc.getPage(0), { x: 72, y: 550, width: 20, height: 20 });
    }
    await save(file, doc);
  }
}
// ---- PR #7 expert-review fixtures ----
{
  // MediaBox as an indirect array of indirect numbers (US Letter landscape).
  const doc = await textDoc([792, 612], ["Indirect 1"], null);
  const ctx = doc.context;
  const w = ctx.register(PDFNumber.of(792));
  const h = ctx.register(PDFNumber.of(612));
  doc.getPage(0).node.set(PDFName.of("MediaBox"), ctx.register(ctx.obj([0, 0, w, h])));
  await save("indirect-box.pdf", doc);
}
{
  // Document language and page labels: i, ii, then 1.
  const doc = await textDoc([595, 842], ["Label 1", "Label 2", "Label 3"], null);
  const ctx = doc.context;
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("de-DE"));
  doc.catalog.set(PDFName.of("PageLabels"), ctx.obj({ Nums: [0, { S: "r" }, 2, { S: "D", P: PDFString.of("A-"), St: 1 }] }));
  await save("lang-labels.pdf", doc);
}
{
  // Properties a merge cannot keep: tags, PDF/A, layers, an attachment and a signature.
  const doc = await textDoc([595, 842], ["Features 1"], null);
  const ctx = doc.context;
  doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
  doc.catalog.set(PDFName.of("StructTreeRoot"), ctx.register(ctx.obj({ Type: "StructTreeRoot" })));
  doc.getPage(0).node.set(PDFName.of("StructParents"), PDFNumber.of(0));
  const xmp = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(ctx.stream(xmp, { Type: "Metadata", Subtype: "XML" })));
  const ocg = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("Layer 1") }));
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: [ocg], D: { ON: [ocg] } }));
  await doc.attach(new TextEncoder().encode("attached"), "note.txt", { mimeType: "text/plain" });
  const sig = ctx.register(ctx.obj({ Type: "Sig", Filter: "Adobe.PPKLite", ByteRange: [0, 0, 0, 0], Contents: PDFHexString.of("00") }));
  const widget = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("Signature1"), V: sig, Rect: [0, 0, 0, 0], P: doc.getPage(0).ref }));
  doc.getPage(0).node.addAnnot(widget);
  doc.catalog.set(PDFName.of("AcroForm"), ctx.obj({ Fields: [widget], SigFlags: 3 }));
  await save("tagged-features.pdf", doc, { useObjectStreams: false });
}
{
  // A text field (flattens) and a signature field without an appearance stream (cannot be flattened).
  const doc = await textDoc([595, 842], ["Sig form"], null);
  const form = doc.getForm();
  const name = form.createTextField("name");
  name.setText("Ann");
  name.addToPage(doc.getPage(0), { x: 72, y: 600, width: 300, height: 28 });
  const ctx = doc.context;
  const widget = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("approval"), Rect: [72, 500, 272, 540], P: doc.getPage(0).ref }));
  doc.getPage(0).node.addAnnot(widget);
  form.acroForm.addField(widget);
  await save("sig-no-ap.pdf", doc);
}

// A 26-byte TIFF whose only IFD points back at itself (review fix: must be refused, never loop).
{
  const b = Buffer.alloc(26);
  b.write("II", 0, "ascii");
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4); // first IFD at 8
  b.writeUInt16LE(1, 8); // one entry
  b.writeUInt16LE(256, 10); // ImageWidth
  b.writeUInt16LE(3, 12); // SHORT
  b.writeUInt32LE(1, 14);
  b.writeUInt16LE(10, 18);
  b.writeUInt32LE(8, 22); // next IFD = itself
  await writeFile(join(here, "cyclic-ifd.tiff"), b);
}
await writeFile(join(here, "broken.png"), "These are text bytes with a .png name, not an image.\n");
// Raster fixtures (charlie.png, delta.jpg, fox.tiff ...) come from gen-images.py.

// The large fixture (>= 40 MB) is generated at test time by e2e/support/large-pdf.ts, never committed.

await writeFile(join(here, "corrupt.pdf"), "This is not a PDF file, only plain text with a .pdf extension.\n");
await writeFile(join(here, "empty.pdf"), new Uint8Array(0));
await writeFile(join(here, "notes.txt"), "Plain text notes. Not a PDF.\n");
console.log("corrupt.pdf, empty.pdf, notes.txt written");
