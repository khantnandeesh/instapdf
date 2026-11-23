import { describe, expect, it } from "vitest";
import { baseName, fileNameOnly, formatBytes, pdfOutputName, uniqueNames, zipName } from "./naming";

describe("pdfOutputName", () => {
  it("keeps the original name (AC-41)", () => {
    expect(pdfOutputName("three-pages.pdf")).toBe("three-pages.pdf");
    expect(pdfOutputName("Report.PDF")).toBe("Report.PDF");
  });
  it("adds .pdf when missing and drops directories", () => {
    expect(pdfOutputName("scan")).toBe("scan.pdf");
    expect(pdfOutputName("C:\\docs\\a.pdf")).toBe("a.pdf");
    expect(fileNameOnly("dir/sub/b.pdf")).toBe("b.pdf");
  });
  it("finds the base name", () => {
    expect(baseName("archive.tar.pdf")).toBe("archive.tar");
    expect(baseName(".hidden")).toBe(".hidden");
  });
});

describe("zipName", () => {
  it("names the ZIP after the tool (AC-42)", () => {
    expect(zipName("rotate-pdf")).toBe("instapdf-rotate.zip");
    expect(zipName("merge-pdf")).toBe("instapdf-merge.zip");
    expect(zipName("n-up")).toBe("instapdf-n-up.zip");
  });
});

describe("uniqueNames", () => {
  it("keeps distinct names", () => {
    expect(uniqueNames(["three-pages.pdf", "sixty-pages.pdf"])).toEqual(["three-pages.pdf", "sixty-pages.pdf"]);
  });
  it("numbers duplicates from (2)", () => {
    expect(uniqueNames(["a.pdf", "a.pdf", "a.pdf"])).toEqual(["a.pdf", "a (2).pdf", "a (3).pdf"]);
  });
  it("is case-insensitive and avoids clashing with an existing (2)", () => {
    expect(uniqueNames(["a.pdf", "a (2).pdf", "A.pdf"])).toEqual(["a.pdf", "a (2).pdf", "A (3).pdf"]);
  });
  it("handles names without an extension", () => {
    expect(uniqueNames(["x", "x"])).toEqual(["x", "x (2)"]);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(4300)).toBe("4.2 KB");
    expect(formatBytes(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
  });
});
