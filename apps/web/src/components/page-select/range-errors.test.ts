import { describe, expect, it } from "vitest";
import { validatePageRanges } from "@/lib/page-ranges";
import { rangeErrorText } from "./range-errors";

const errorFor = (text: string, counts: number[]) => {
  const r = validatePageRanges(text, counts);
  if (r.ok) throw new Error(`${text} is valid`);
  return rangeErrorText(r.error, counts);
};

describe("rangeErrorText (AC-403, AC-544, UI P-13)", () => {
  it("names the bad item and the reason", () => {
    expect(errorFor("abc", [12])).toBe("“abc”: not a page number");
    expect(errorFor("0", [12])).toBe("“0”: pages start at 1");
    expect(errorFor("13", [12])).toBe("“13”: this file has 12 pages");
    expect(errorFor("5-3", [12])).toBe("“5-3”: start is after end");
    // The engine names the whole item (lib/page-ranges), so "2-x" is quoted as typed.
    expect(errorFor("2-x", [12])).toBe("“2-x”: not a page number");
    expect(errorFor("lst", [12])).toBe("“lst”: not a page number");
  });
  it("says 'every file' with several files", () => {
    expect(errorFor("20", [12, 3])).toBe("“20”: past the last page of every file");
    expect(errorFor("1201", [1200])).toBe("“1201”: this file has 1,200 pages");
  });
});
