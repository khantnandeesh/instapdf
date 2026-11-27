import { describe, expect, it } from "vitest";
import { countWords, pageText } from "./page-text";

const at = (str: string, y: number, hasEOL = false, height = 12) => ({ str, hasEOL, height, transform: [1, 0, 0, 1, 72, y] });

describe("pageText", () => {
  it("keeps the page's line ends and joins pieces of one line", () => {
    expect(pageText([at("Hello", 700), at(" ", 700), at("world", 700, true), at("Second line", 686, true)])).toBe("Hello world\nSecond line");
  });
  it("turns a wider vertical gap into one blank line", () => {
    expect(pageText([at("Title", 700, true, 18), at("Body one", 650, true), at("Body two", 636, true)])).toBe("Title\n\nBody one\nBody two");
  });
  it("drops trailing spaces and extra blank lines", () => {
    expect(pageText([at("a  ", 700, true), at("", 690, true), at("", 680, true), at("", 670, true), at("b", 600, true)])).toBe("a\n\nb");
  });
  it("is empty for a page with no text", () => {
    expect(pageText([])).toBe("");
  });
});

describe("countWords", () => {
  it("counts runs of non-space characters", () => {
    expect(countWords("one two\nthree\n\n  four ")).toBe(4);
    expect(countWords("")).toBe(0);
  });
});
