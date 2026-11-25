import { PDFDocument, PDFName, PDFString, StandardFonts } from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BudgetError, MAX_INFLATE, RawPdf, inflateCapped, isDict, isName, isRef, isStream, num, serialize, type PdfDict } from "./raw-pdf";

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

/** Concatenates text and bytes into one file. */
const file = (...parts: (string | Uint8Array)[]) => {
  const bs = parts.map((p) => (typeof p === "string" ? ascii(p) : p));
  const out = new Uint8Array(bs.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bs) {
    out.set(b, at);
    at += b.length;
  }
  return out;
};

/**
 * Hostile input (PR #61 review): the reader runs on the main thread, so each case must finish
 * quickly and either throw or return; nothing may hang or blow up memory.
 */
describe("raw PDF reader on hostile input", () => {
  /** Runs `fn` (load and a few reads), asserting it ends within `ms` whether it throws or not. */
  const bounded = (ms: number, fn: () => unknown) => {
    const t0 = performance.now();
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    const took = performance.now() - t0;
    expect(took, `took ${Math.round(took)} ms`).toBeLessThan(ms);
    return threw;
  };
  const readAll = (bytes: Uint8Array) => {
    const pdf = RawPdf.load(bytes);
    for (let n = 1; n <= 8; n++) pdf.get(n);
    return pdf;
  };

  it("a /Prev cycle", () => {
    const head = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
    const x = head.length;
    const bytes = ascii(`${head}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R /Prev ${x} >>\nstartxref\n${x}\n%%EOF\n`);
    bounded(500, () => expect(readAll(bytes).get(1)).toBeDefined());
  });

  it("nesting deeper than 64", () => {
    const deep = "[".repeat(5000) + "]".repeat(5000);
    const bytes = ascii(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /A ${deep} >>\nendobj\n2 0 obj\n<< /B ${deep} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n`);
    bounded(500, () => {
      const pdf = RawPdf.load(bytes);
      expect(pdf.get(1)).toBeUndefined();
      expect(pdf.get(2)).toBeUndefined();
    });
  });

  it("an xref stream with /W [0 0 0] and a huge /Size", () => {
    const data = zlibSync(ascii("x"));
    const head = "%PDF-1.5\n";
    const bytes = file(head, `1 0 obj\n<< /Type /XRef /W [0 0 0] /Size 50000000 /Root 2 0 R /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, data, `\nendstream\nendobj\nstartxref\n${head.length}\n%%EOF\n`);
    bounded(500, () => readAll(bytes));
    // Fields wider than 8 bytes, and a huge /Size with 1-byte rows: no more rows than the data holds.
    const rows = zlibSync(new Uint8Array(3 * 4).fill(1));
    const wide = file(head, `1 0 obj\n<< /Type /XRef /W [1 1 1] /Size 50000000 /Root 2 0 R /Length ${rows.length} /Filter /FlateDecode >>\nstream\n`, rows, `\nendstream\nendobj\nstartxref\n${head.length}\n%%EOF\n`);
    bounded(500, () => readAll(wide));
    const nine = file(head, `1 0 obj\n<< /Type /XRef /W [9 1 1] /Size 4 /Root 2 0 R /Length ${rows.length} /Filter /FlateDecode >>\nstream\n`, rows, `\nendstream\nendobj\nstartxref\n${head.length}\n%%EOF\n`);
    bounded(500, () => readAll(nine));
  });

  it("a file that starts with \"trailer\"", () => {
    const threw = bounded(500, () => RawPdf.load(ascii("trailer junk\n1 0 obj\n<< /Type /Foo >>\nendobj\n")));
    expect(threw).toBe(true);
    // And one whose only trailer, at 0, is a good one.
    expect(RawPdf.load(ascii("trailer << /Root 1 0 R >>\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")).trailer.get("Root")).toEqual({ num: 1, gen: 0 });
  });

  it("an inflate bomb stops at the cap", () => {
    const bomb = zlibSync(new Uint8Array(64 * 1024 * 1024), { level: 9 }); // ~64 kB that inflates to 64 MB
    const head = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
    const bytes = file(head, `2 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${bomb.length} /Filter /FlateDecode >>\nstream\n`, bomb, "\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n");
    const pdf = RawPdf.load(bytes);
    const s = pdf.get(2);
    expect(isStream(s)).toBe(true);
    expect(bounded(3000, () => pdf.decode(s as never))).toBe(true);
    expect(() => inflateCapped(bomb.subarray(2), MAX_INFLATE)).toThrow();
    // Under the cap it inflates as before.
    expect(inflateCapped(zlibSync(new Uint8Array(1000).fill(7)).subarray(2), MAX_INFLATE)).toEqual(new Uint8Array(1000).fill(7));
  });

  it("20,000 streams with a bad /Length and no endstream", () => {
    let s = "%PDF-1.4\n";
    for (let i = 1; i <= 20000; i++) s += `${i} 0 obj\n<< /Length 999999999 >>\nstream\n${"x".repeat(56)}\n`;
    bounded(3000, () => readAll(ascii(s)));
  });

  it("negative /Length, /Columns and /First", () => {
    const data = zlibSync(ascii("1 0 << /A 1 >>"));
    const head = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
    const bytes = file(
      head,
      "2 0 obj\n<< /Length -5 >>\nstream\nabc\nendstream\nendobj\n",
      `3 0 obj\n<< /Type /ObjStm /N 1 /First -4 /Length ${data.length} /Filter /FlateDecode >>\nstream\n`,
      data,
      `\nendstream\nendobj\n4 0 obj\n<< /Length ${data.length} /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns -3 >> >>\nstream\n`,
      data,
      "\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n",
    );
    bounded(500, () => {
      const pdf = readAll(bytes);
      const two = pdf.get(2);
      expect(isStream(two) && ascii("abc").every((c, i) => (two as { data: Uint8Array }).data[i] === c)).toBe(true);
      expect(() => pdf.decode(pdf.get(4) as never)).toThrow();
    });
  });

  it("gives up once the work budget is spent", () => {
    let s = "%PDF-1.4\n";
    for (let i = 1; i <= 2000; i++) s += `${i} 0 obj\n<< /Type /Page >>\nendobj\n`;
    s += "trailer\n<< /Root 1 0 R >>\n";
    expect(() => {
      const pdf = RawPdf.load(ascii(s), 10_000);
      for (let n = 1; n <= 2000; n++) pdf.get(n);
    }).toThrow(BudgetError);
  });

  it("writes numbers without exponents", () => {
    expect(num(1e21)).toBe("1000000000000000000000");
    expect(num(-1e22)).toBe("-10000000000000000000000");
    expect(num(1e-7)).toBe("0");
    expect(num(-1e-9)).toBe("0");
    expect(num(0.1234567)).toBe("0.123457");
    expect(num(Infinity)).toBe("0");
  });
});
