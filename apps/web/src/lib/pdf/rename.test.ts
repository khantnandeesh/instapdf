import { describe, expect, it } from "vitest";
import { MAX_TEXT, nameText, renameAll, renamedName } from "./rename";

describe("Rename by content (spec F10 §5)", () => {
  it("AC-1260: the found text becomes the name, safe for a file system, with .pdf", () => {
    expect(renamedName("{text}", { name: "scan-001.pdf", text: "Invoice 1042" }, 1)).toBe("Invoice 1042.pdf");
    expect(renamedName("{text}", { name: "a.pdf", text: "Report: Q1/Q2" }, 1)).not.toMatch(/[:/]/);
    expect(renamedName("", { name: "a.pdf", text: "Title" }, 1)).toBe("Title.pdf");
  });
  it("AC-1261: the pattern mixes the text with the old name and the file's number; token names ignore case", () => {
    expect(renamedName("{n} - {TEXT} ({name})", { name: "scan.pdf", text: "Acme" }, 3)).toBe("3 - Acme (scan).pdf");
  });
  it("AC-1262: no text where the pattern needs it keeps the old name", () => {
    expect(renamedName("{text}", { name: "scan.pdf", text: "  " }, 1)).toBeNull();
    expect(renamedName("{name}-{n}", { name: "scan.pdf", text: "" }, 2)).toBe("scan-2.pdf");
    expect(renameAll([{ name: "a.pdf", text: "" }, { name: "b.pdf", text: "Bee" }], "{text}")).toEqual({ names: ["a.pdf", "Bee.pdf"], kept: [0] });
  });
  it("AC-1263: two files with the same text get different names", () => {
    const { names } = renameAll([{ name: "a.pdf", text: "Same" }, { name: "b.pdf", text: "Same" }], "{text}");
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe("Same.pdf");
  });
  it("AC-1264: long text is cut at a word, and line breaks become spaces", () => {
    const long = "word ".repeat(60);
    const cut = nameText(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(cut.endsWith("word")).toBe(true);
    expect(nameText("Two\n lines")).toBe("Two lines");
  });
  it("AC-1265: unseen and direction-turning characters are dropped, and a cut never splits a character", () => {
    expect(nameText("In\u200bvoice\u202e 7\u00ad")).toBe("Invoice 7");
    const cut = nameText("😀".repeat(150));
    expect(Array.from(cut).length).toBe(MAX_TEXT);
    expect(cut).toBe("😀".repeat(MAX_TEXT));
  });
});
