import { describe, expect, it } from "vitest";
import { canonicalPageSet, canonicalPartList, formatPages, parsePageRanges, resolveItem, runsOf, selectedPages, validatePageRanges, type RangeItem } from "./page-ranges";

const items = (text: string): RangeItem[] => {
  const r = parsePageRanges(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.items;
};
/** 1-based pages a text selects in a file of `count` pages. */
const pick = (text: string, count = 12) => selectedPages(items(text), count).map((i) => i + 1);
const errorOf = (text: string, counts = [12]) => {
  const r = validatePageRanges(text, counts);
  return r.ok ? null : r.error;
};

describe("parsing (§0a)", () => {
  it("AC-402: `1-3, 5, 10-` selects 1, 2, 3, 5, 10, 11, 12; `-2` selects 1 and 2", () => {
    expect(pick("1-3, 5, 10-")).toEqual([1, 2, 3, 5, 10, 11, 12]);
    expect(pick("-2")).toEqual([1, 2]);
  });

  it("accepts commas, spaces, spaces around dashes and en dashes", () => {
    expect(pick("1 3,5")).toEqual([1, 3, 5]);
    expect(pick("1 - 3 ,  7")).toEqual([1, 2, 3, 7]);
    expect(pick("2–4")).toEqual([2, 3, 4]);
    expect(pick("2 — 4")).toEqual([2, 3, 4]);
    expect(pick("")).toEqual([]);
    expect(pick(" , ")).toEqual([]);
  });

  it("AC-455: document order without repeats (`9, 2-3` gives 2, 3, 9)", () => {
    expect(pick("9, 2-3, 3")).toEqual([2, 3, 9]);
  });

  it("AC-403: `abc`, `0`, `13`, `5-3` and `2-x` each fail and name the item", () => {
    const cases: [string, string][] = [
      ["abc", "not-a-number"],
      ["0", "page-zero"],
      ["13", "past-end"],
      ["5-3", "start-after-end"],
      ["2-x", "not-a-number"],
    ];
    for (const [text, reason] of cases) {
      const e = errorOf(text);
      expect(e, text).not.toBeNull();
      expect(e!.item).toBe(text);
      expect(e!.reason).toBe(reason);
      expect(e!.message).toContain(text);
    }
    expect(errorOf("2")).toBeNull();
  });

  it("names the bad item inside a longer list, as typed", () => {
    expect(errorOf("1-3, 5 - 3, 8")?.item).toBe("5-3");
    expect(errorOf("1, 2, ABC")?.item).toBe("ABC");
    expect(errorOf("10-14")?.reason).toBe("past-end");
    expect(errorOf("13-")?.reason).toBe("past-end");
    expect(errorOf("0-3")?.reason).toBe("page-zero");
    expect(errorOf("-")?.reason).toBe("not-a-number");
    expect(errorOf("1-2-3")?.reason).toBe("not-a-number");
    expect(errorOf("2.5")?.reason).toBe("not-a-number");
    expect(errorOf("+3")?.reason).toBe("not-a-number");
  });

  it("a huge number is past the end, not a crash", () => {
    expect(errorOf("99999999999999999999")?.reason).toBe("past-end");
  });
});

describe("keywords (I-6)", () => {
  it("AC-544: `even`, `odd, 12`, `10-last`, `EVEN`; `lst` fails naming it", () => {
    expect(pick("even")).toEqual([2, 4, 6, 8, 10, 12]);
    expect(pick("odd, 12")).toEqual([1, 3, 5, 7, 9, 11, 12]);
    expect(pick("10-last")).toEqual([10, 11, 12]);
    expect(pick("EVEN")).toEqual([2, 4, 6, 8, 10, 12]);
    const e = errorOf("lst");
    expect(e?.item).toBe("lst");
    expect(e?.message).toContain("lst");
  });

  it("`last` is each file's own last page (AC-543)", () => {
    const it = items("last");
    expect(selectedPages(it, 12)).toEqual([11]);
    expect(selectedPages(it, 3)).toEqual([2]);
    expect(selectedPages(it, 0)).toEqual([]);
  });

  it("`5-last` reads each file's length; past every file's end it fails", () => {
    expect(selectedPages(items("5-last"), 3)).toEqual([]);
    expect(errorOf("5-last", [12, 3])).toBeNull();
    expect(errorOf("13-last", [12, 3])?.reason).toBe("past-end");
  });
});

describe("several files (§3a, AC-402, AC-408)", () => {
  it("a number past one file's end is ignored there; an error only past every file's end", () => {
    expect(errorOf("10-12", [12, 3])).toBeNull();
    expect(selectedPages(items("10-12"), 3)).toEqual([]);
    expect(selectedPages(items("1-2"), 3)).toEqual([0, 1]);
    expect(errorOf("13", [12, 3])?.message).toContain("(12)");
  });

  it("canonical text: one file closes and merges; two or more keep open ranges and keywords as typed", () => {
    expect(canonicalPageSet("1-3, 5, 10-", [12])).toBe("1-3, 5, 10-12");
    expect(canonicalPageSet("9, 2-3", [12])).toBe("2-3, 9");
    expect(canonicalPageSet("odd", [12])).toBe("1, 3, 5, 7, 9, 11");
    expect(canonicalPageSet("last", [12])).toBe("12");
    expect(canonicalPageSet("1-3, 5, 10-", [12, 3])).toBe("1-3, 5, 10-");
    expect(canonicalPageSet("last", [12, 3])).toBe("last");
    expect(canonicalPageSet("EVEN, 4 - 6, 1-2, 3", [12, 3])).toBe("1-6, even");
    expect(canonicalPageSet("5-LAST, 1", [12, 3])).toBe("1, 5-last");
    expect(canonicalPageSet("1-999999", [12, 3])).toBe("1-999999");
    expect(canonicalPageSet("abc", [12])).toBe("abc");
    expect(canonicalPageSet("", [12])).toBe("");
  });

  it("Split's part list keeps the typed order and overlaps, closing open ranges for one file", () => {
    expect(canonicalPartList("8-9 , 1-3, 12", [12])).toBe("8-9, 1-3, 12");
    expect(canonicalPartList("1-4, 3-6", [12])).toBe("1-4, 3-6");
    expect(canonicalPartList("10-, last, odd", [12])).toBe("10-12, 12, odd");
    expect(canonicalPartList("10-, last", [12, 3])).toBe("10-, last");
    expect(canonicalPartList("x", [12])).toBe("x");
  });
});

describe("formatting", () => {
  it("formatPages: ascending, merged runs, closed ranges", () => {
    expect(formatPages([0, 1, 2, 4, 9, 10, 11])).toBe("1-3, 5, 10-12");
    expect(formatPages([5, 3, 1, 3])).toBe("2, 4, 6");
    expect(formatPages([])).toBe("");
  });
  it("runsOf and resolveItem", () => {
    expect(runsOf([0, 1, 2, 4])).toEqual([[0, 2], [4, 4]]);
    expect(resolveItem({ kind: "span", from: 3, to: 20, text: "3-20" }, 5)).toEqual([2, 3, 4]);
    expect(resolveItem({ kind: "odd", text: "odd" }, 5)).toEqual([0, 2, 4]);
    expect(resolveItem({ kind: "even", text: "even" }, 1)).toEqual([]);
  });
});
