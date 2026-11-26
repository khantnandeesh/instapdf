import { describe, expect, it } from "vitest";
import { baseName, customName, DELETE_ZIP, EXTRACT_ZIP, mergedName, fileNameOnly, formatBytes, mixedName, organizedName, patternName, pdfOutputName, safeFileStem, splitZipName, uniqueNames, zipName } from "./naming";

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
    expect(zipName("rotate-pdf")).toBe("berrypdf-rotate.zip");
    expect(zipName("merge-pdf")).toBe("berrypdf-merge.zip");
    expect(zipName("n-up")).toBe("berrypdf-n-up.zip");
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
    expect(mergedName("alpha.pdf")).toBe("alpha_merged.pdf");
    expect(mergedName("charlie.png")).toBe("charlie_merged.pdf");
    expect(mergedName("résumé-日本.pdf")).toBe("résumé-日本_merged.pdf");
  });
  it("joins with an underscore like the reference (eval G-3) and keeps the base as is", () => {
    expect(mergedName("my-file_v2.pdf")).toBe("my-file_v2_merged.pdf");
    expect(mergedName("alpha.pdf")).not.toContain("-merged");
  });
  it("replaces characters file systems do not allow", () => {
    expect(mergedName('a:b*c?"d<e>f|g.pdf')).toBe("a-b-c--d-e-f-g_merged.pdf");
    expect(mergedName("folder/x.pdf")).toBe("x_merged.pdf");
    expect(mergedName(undefined)).toBe("berrypdf_merged.pdf");
    expect(mergedName("....pdf")).toBe("berrypdf_merged.pdf");
  });
});

describe("page tool names (F4/F5 §6)", () => {
  const t = { input: "twelve.pdf", pages: "1-4", first: 1, last: 4, n: 2, date: new Date(2026, 0, 5) };
  it("§3a: fills {name}, {pages}, {first}, {last}, {n}, {date}, case-insensitively, keeping other text", () => {
    expect(patternName("{name}-{pages}", t)).toBe("twelve-1-4.pdf");
    expect(patternName("{NAME}_p{First}-{last}_{n}_{date}", t)).toBe("twelve_p1-4_2_20260105.pdf");
    expect(patternName("{name} {unknown}", t)).toBe("twelve {unknown}.pdf");
  });
  it("§3a: unsafe characters become '-', '.pdf' is not doubled, an empty result falls back to the input name", () => {
    expect(patternName("{name}/{pages}", t)).toBe("twelve-1-4.pdf");
    expect(patternName("{name}.pdf", t)).toBe("twelve.pdf");
    expect(patternName("  ", t)).toBe("twelve.pdf");
    expect(patternName("{n}", { ...t, n: undefined })).toBe("twelve.pdf");
  });
  it("AC-430: typed part names", () => {
    expect(customName("intro")).toBe("intro.pdf");
    expect(customName("a/b")).toBe("a-b.pdf");
    expect(customName("Report.PDF")).toBe("Report.pdf");
    expect(customName(" .. ")).toBeNull();
    expect(safeFileStem('a<b>:c"d|e?f*g')).toBe("a-b--c-d-e-f-g");
  });
  it("§6a, §6b, §6c: ZIP names", () => {
    expect(splitZipName(["twelve.pdf"])).toBe("twelve-split.zip");
    expect(splitZipName(["twelve.pdf", "three-pages.pdf"])).toBe("berrypdf-split.zip");
    expect(splitZipName(["..."])).toBe("berrypdf-split.zip");
    expect(EXTRACT_ZIP).toBe("berrypdf-extract.zip");
    expect(DELETE_ZIP).toBe("berrypdf-delete.zip");
  });
  it("§6d, §6e: Organize and Alternate names", () => {
    expect(organizedName("twelve.pdf")).toBe("twelve_organized.pdf");
    expect(mixedName("odd.pdf")).toBe("odd_mixed.pdf");
    expect(mixedName(undefined)).toBe("berrypdf_mixed.pdf");
    expect(mergedName("a:b.pdf")).toBe("a-b_merged.pdf");
  });
});
