import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { fromHeader, repairPdf } from "./repair";
import { saveCompact } from "./write";

const latin = (b: Uint8Array) => Buffer.from(b).toString("latin1");
const cat = (...parts: (Uint8Array | string)[]) => new Uint8Array(Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p)))));

/** `count` pages, each with its number as text; `compact` writes object streams as our own tools do. */
async function sample(count: number, compact = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) doc.addPage([300, 400]).drawText(`Page ${i}`, { x: 40, y: 300, size: 24, font });
  doc.setTitle("Sample");
  return compact ? saveCompact(doc) : doc.save({ useObjectStreams: false });
}
/** The repaired file must open, with this many pages, each still holding content and a font. */
async function sound(bytes: Uint8Array, pages: number) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(pages);
  for (const page of doc.getPages()) {
    expect(page.getSize()).toEqual({ width: 300, height: 400 });
    expect(page.node.Contents()).toBeDefined();
    expect(page.node.Resources()!.has((await import("@cantoo/pdf-lib")).PDFName.of("Font"))).toBe(true);
  }
  // The index is sound: the file ends with one and a reader that trusts it finds the pages.
  expect(latin(bytes.subarray(bytes.length - 40))).toMatch(/startxref\s+\d+\s+%%EOF\s*$/);
  return doc;
}

describe("repair (spec F13 §2)", () => {
  it("AC-1450: text before the header is dropped; a missing header is put on", () => {
    expect(latin(fromHeader(cat("Content-Type: x\r\n\r\n", "%PDF-1.4\nrest")))).toBe("%PDF-1.4\nrest");
    expect(latin(fromHeader(cat("1 0 obj\n")))).toBe("%PDF-1.7\n1 0 obj\n");
    const whole = cat("%PDF-1.4\nrest");
    expect(fromHeader(whole)).toBe(whole);
  });

  it("AC-1451: a file whose end is cut off (no index, no trailer) keeps every page", async () => {
    const file = await sample(5);
    const cut = file.subarray(0, latin(file).lastIndexOf("xref"));
    const out = await repairPdf({ bytes: cut });
    expect(out.warnings).toBeUndefined();
    expect((await sound(out.bytes, 5)).getTitle()).toBe("Sample");
  });

  it("AC-1452: junk in front, a shifted body and a wrong index are all the same to it", async () => {
    const file = await sample(4);
    const at = file.indexOf(10, Math.floor(file.length * 0.3)) + 1;
    const text = latin(file);
    const damaged = [
      cat(new Uint8Array(1000).fill(65), file),
      cat(file.subarray(0, at), "%shifted\n", file.subarray(at)),
      cat(file.subarray(0, text.lastIndexOf("startxref")), "startxref\n1\n%%EOF\n"),
      file.subarray(file.indexOf(10) + 1),
    ];
    for (const bytes of damaged) await sound((await repairPdf({ bytes })).bytes, 4);
  });

  it("AC-1453: a stream with a wrong length is read to its real end", async () => {
    const file = await sample(3);
    const text = latin(file);
    const m = /\/Length (\d{2,})/.exec(text)!;
    const wrong = cat(file.subarray(0, m.index + 8), String(Math.floor(Number(m[1]) / 2)).padStart(m[1].length, "0"), file.subarray(m.index + 8 + m[1].length));
    await sound((await repairPdf({ bytes: wrong })).bytes, 3);
  });

  it("AC-1454: a file cut in the middle gives the pages that are whole, and says how many are gone", async () => {
    const file = await sample(40);
    const out = await repairPdf({ bytes: file.subarray(0, Math.floor(file.length * 0.5)) });
    expect(out.pageCount).toBeGreaterThan(5);
    expect(out.pageCount).toBeLessThan(40);
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(out.pageCount);
    // pdf-lib writes the page tree last, so it is gone here: the pages come from the objects themselves.
    expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  });

  it("AC-1455: a page list that points at missing pages is rebuilt from the ones that exist", async () => {
    const file = await sample(6);
    // Blank out one page object: its entry in the page list now points at nothing.
    const text = latin(file);
    const type = /\/Type\s*\/Page(?!s)/.exec(text)!.index;
    const from = text.lastIndexOf("\n", text.lastIndexOf(" 0 obj", type)) + 1;
    const to = text.indexOf("endobj", type) + 6;
    const holed = cat(file.subarray(0, from), " ".repeat(to - from), file.subarray(to));
    const out = await repairPdf({ bytes: holed });
    expect(out.pageCount).toBe(5);
    expect(out.warnings).toEqual(["5 of 6 pages were recovered. The rest of the file is missing or cannot be read."]);
    await sound(out.bytes, 5);
  });

  it("AC-1456: a sound file comes back sound, with nothing to report", async () => {
    for (const compact of [false, true]) {
      const out = await repairPdf({ bytes: await sample(3, compact) });
      expect(out.warnings).toBeUndefined();
      await sound(out.bytes, 3);
    }
  });

  it("AC-1457: a file with nothing left says so", async () => {
    await expect(repairPdf({ bytes: cat("not a pdf at all"), name: "notes.pdf" })).rejects.toThrow("notes.pdf has too little left to repair");
    const file = await sample(2);
    await expect(repairPdf({ bytes: file.subarray(0, 60) })).rejects.toThrow("too little left to repair");
  });
});
