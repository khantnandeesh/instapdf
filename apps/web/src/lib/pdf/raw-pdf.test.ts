import { PDFDocument, PDFName, PDFString, StandardFonts } from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { RawPdf, isDict, isName, isRef, isStream, serialize, type PdfDict } from "./raw-pdf";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const text = (b: Uint8Array) => String.fromCharCode(...b);

/** A file pdf-lib writes, with or without object streams and an xref stream. */
async function libFile(objectStreams: boolean) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([300, 200]);
  page.drawText("Total 450", { x: 20, y: 100, size: 14, font });
  doc.setTitle("Rück (test)");
  const bytes = await doc.save({ useObjectStreams: objectStreams });
  return { bytes, fontNum: font.ref.objectNumber, largest: doc.context.largestObjectNumber };
}

describe("raw PDF reader (twins without pdf-lib, AC-51)", () => {
  for (const objectStreams of [false, true]) {
    it(`finds the catalog and a font ${objectStreams ? "in an object stream (xref stream with predictors)" : "through a plain xref table"}`, async () => {
      const { bytes, fontNum, largest } = await libFile(objectStreams);
      const pdf = RawPdf.load(bytes);
      expect(isRef(pdf.trailer.get("Root"))).toBe(true);
      expect(pdf.largestObjectNumber).toBeGreaterThanOrEqual(largest);
      const catalog = pdf.resolve(pdf.trailer.get("Root"));
      expect(isDict(catalog) && isName(catalog.dict.get("Type"), "Catalog")).toBe(true);
      const font = pdf.get(fontNum) as PdfDict;
      expect(isName(pdf.lookup(font, "BaseFont"), "Times-Roman")).toBe(true);
      expect(isName(pdf.lookup(font, "Encoding"), "WinAnsiEncoding")).toBe(true);
      expect(pdf.get(999)).toBeUndefined();
      // The Info title, a literal string with an escaped parenthesis in it.
      const info = pdf.resolve(pdf.trailer.get("Info")) as PdfDict;
      expect(info).toBeDefined();
      expect(pdf.lookup(info, "Title")).toBeDefined();
    });
  }

  it("reads a file whose offsets are wrong by scanning for object headers", () => {
    const body = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 /A#20B (x\\)y) /H <4142> /N -1.5 /T true /Z null >>\nendobj\n";
    // The table points 7 bytes too early for every object.
    const bytes = ascii(`${body}xref\n0 3\n0000000000 65535 f \n0000000002 00000 n \n0000000040 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`);
    const pdf = RawPdf.load(bytes);
    const pages = pdf.get(2) as PdfDict;
    expect(isName(pages.dict.get("Type"), "Pages")).toBe(true);
    expect(text((pages.dict.get("A B") as { str: Uint8Array }).str)).toBe("x)y");
    expect(serialize(pages)).toBe("<< /Type /Pages /Kids [] /Count 0 /A#20B <782979> /H <4142> /N -1.5 /T true /Z null >>");
  });

  it("reads a file with no cross-reference data at all, and newer sections win over older ones", () => {
    const noXref = RawPdf.load(ascii("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"));
    expect(noXref.trailer.get("Root")).toEqual({ num: 1, gen: 0 });
    // An incremental update replaces object 1.
    const v1 = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /V 1 >>\nendobj\n";
    const x1 = v1.length;
    const s1 = `${v1}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${x1}\n%%EOF\n`;
    const at2 = s1.length;
    const v2 = `${s1}1 0 obj\n<< /Type /Catalog /V 2 >>\nendobj\n`;
    const bytes = ascii(`${v2}xref\n1 1\n${String(at2).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R /Prev ${x1} >>\nstartxref\n${v2.length}\n%%EOF\n`);
    expect((RawPdf.load(bytes).get(1) as PdfDict).dict.get("V")).toBe(2);
  });

  it("decodes a Flate stream and gives up on filters it doesn't know", () => {
    const data = zlibSync(ascii("hello stream"));
    const head = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n";
    const bytes = new Uint8Array([...ascii(`${head}<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), ...data, ...ascii("\nendstream\nendobj\n3 0 obj\n<< /Length 2 /Filter /LZWDecode >>\nstream\nab\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n")]);
    const pdf = RawPdf.load(bytes);
    const s = pdf.get(2);
    expect(isStream(s)).toBe(true);
    expect(text(pdf.decode(s as never))).toBe("hello stream");
    expect(() => pdf.decode(pdf.get(3) as never)).toThrow();
  });

  it("writes objects pdf-lib reads back the same", async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const made = ctx.obj({ Type: "Font", Widths: [1, 2.5, -3], Name: PDFString.of("a(b)") });
    const out = new Uint8Array(made.sizeInBytes());
    made.copyBytesInto(out, 0);
    const bytes = ascii(`%PDF-1.4\n1 0 obj\n${text(out)}\nendobj\ntrailer\n<< /Root 1 0 R >>\n`);
    const again = serialize(RawPdf.load(bytes).get(1)!);
    expect(again).toBe("<< /Type /Font /Widths [1 2.5 -3] /Name <61286229> >>");
    expect(PDFName.of("A B").asString()).toBe(serialize({ name: "A B" }));
  });
});
