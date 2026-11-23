import { describe, expect, it } from "vitest";
import { baseName, mergedName, fileNameOnly, formatBytes, pdfOutputName, uniqueNames, zipName } from "./naming";

describe("pdfOutputName", () => {
  it("AC-41: keeps the original name", () => {
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
  it("AC-42: names the ZIP after the tool", () => {
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

describe("mergedName (F3 §6, AC-66)", () => {
  it("names the merge after the first file", () => {
    expect(mergedName("alpha.pdf")).toBe("alpha-merged.pdf");
    expect(mergedName("charlie.png")).toBe("charlie-merged.pdf");
    expect(mergedName("résumé-日本.pdf")).toBe("résumé-日本-merged.pdf");
  });
  it("replaces characters file systems do not allow", () => {
    expect(mergedName('a:b*c?"d<e>f|g.pdf')).toBe("a-b-c--d-e-f-g-merged.pdf");
    expect(mergedName("folder/x.pdf")).toBe("x-merged.pdf");
    expect(mergedName(undefined)).toBe("instapdf-merged.pdf");
    expect(mergedName("....pdf")).toBe("instapdf-merged.pdf");
  });
});
