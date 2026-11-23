// Generates the small fixture PDFs used by unit and e2e tests.
// Run from apps/web:  node tests/fixtures/generate.mjs
// Output is deterministic apart from encryption salts (AES needs random bytes).
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, degrees } from "@cantoo/pdf-lib";

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

await writeFile(join(here, "corrupt.pdf"), "This is not a PDF file, only plain text with a .pdf extension.\n");
await writeFile(join(here, "empty.pdf"), new Uint8Array(0));
await writeFile(join(here, "notes.txt"), "Plain text notes. Not a PDF.\n");
console.log("corrupt.pdf, empty.pdf, notes.txt written");
