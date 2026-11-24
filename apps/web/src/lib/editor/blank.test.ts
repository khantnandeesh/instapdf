import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { blankPdf, defaultPaper } from "./blank";

describe("blank page", () => {
  it("writes a valid one-page PDF of the paper size", async () => {
    const doc = await PDFDocument.load(blankPdf("letter"), { throwOnInvalidObject: true, updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getProducer()).toBe("BerryPDF");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: blankPdf("a4"), verbosity: 0, stopAtErrors: true }).promise;
    expect(pdf.numPages).toBe(1);
  });

  it("picks Letter for the US and Canada only", () => {
    expect(defaultPaper("en-US")).toBe("letter");
    expect(defaultPaper("fr-CA")).toBe("letter");
    expect(defaultPaper("en-IN")).toBe("a4");
    expect(defaultPaper(undefined)).toBe("a4");
  });
});
