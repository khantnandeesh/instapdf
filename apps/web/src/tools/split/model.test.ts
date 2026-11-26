import { describe, expect, it } from "vitest";
import { blurParts, clearParts, initialSplit, markAfter, pageParts, pagesUsed, partsOf, setKind, setN, splitPlan, splitProblem, toggleMark, typeParts } from "./model";

const twelve = { id: "a", name: "twelve.pdf", pageCount: 12 };
const three = { id: "b", name: "three-pages.pdf", pageCount: 3 };
const one = [twelve];
const date = new Date(2026, 0, 2);
const names = (s: ReturnType<typeof initialSplit>, files = one, extra = {}) => splitPlan(s, files, { date, ...extra })!.documents.map((d) => d.name);
const count = (s: ReturnType<typeof initialSplit>, files = one) => splitPlan(s, files)?.documents.length ?? null;

describe("modes (AC-420, AC-421, AC-423, AC-439)", () => {
  it("every page by default: 12 parts named twelve-1 … twelve-12", () => {
    expect(names(initialSplit())).toEqual(Array.from({ length: 12 }, (_, i) => `twelve-${i + 1}.pdf`));
    expect(splitPlan(initialSplit(), one)!.download).toEqual({ kind: "zip", name: "twelve-split.zip" });
  });
  it("counts 12, 6, 7, 1 across the modes and keeps the file", () => {
    let s = initialSplit();
    expect(count(s)).toBe(12);
    s = setKind(s, "everyN");
    expect(count(s)).toBe(6);
    s = setKind(s, "spreads");
    expect(count(s)).toBe(7);
    s = setKind(s, "custom");
    expect(count(s)).toBe(1);
  });
  it("Every N = 5: 1-5, 6-10, 11-12", () => {
    expect(names(setN(setKind(initialSplit(), "everyN"), "5"))).toEqual(["twelve-1-5.pdf", "twelve-6-10.pdf", "twelve-11-12.pdf"]);
  });
  it("spreads give [1, 2, 2, 2, 2, 2, 1]", () => {
    expect(splitPlan(setKind(initialSplit(), "spreads"), one)!.documents.map((d) => d.pages.length)).toEqual([1, 2, 2, 2, 2, 2, 1]);
  });
});

describe("N (AC-422)", () => {
  it("rejects 0, -1, 2.5, x and empty; 12 and 20 give one part", () => {
    for (const bad of ["0", "-1", "2.5", "x", ""]) {
      const s = setN(setKind(initialSplit(), "everyN"), bad);
      expect(splitProblem(s, one), bad).toEqual({ n: true });
      expect(splitPlan(s, one), bad).toBeNull();
    }
    expect(count(setN(setKind(initialSplit(), "everyN"), "12"))).toBe(1);
    expect(count(setN(setKind(initialSplit(), "everyN"), "20"))).toBe(1);
  });
});

describe("marks (AC-424, AC-425, AC-428)", () => {
  it("in Custom, marks after 4 and 10 give 1-4, 5-10, 11-12", () => {
    let s = setKind(initialSplit(), "custom");
    s = toggleMark(s, one, "a", 3);
    s = toggleMark(s, one, "a", 9);
    expect(s.text).toBe("1-4, 5-10, 11-12");
    expect(names(s)).toEqual(["twelve-1-4.pdf", "twelve-5-10.pdf", "twelve-11-12.pdf"]);
    const parts = partsOf(s, twelve, one);
    expect(pageParts(parts, 12).map((p) => p?.part)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3]);
    expect(markAfter(parts, 3)).toBe("on");
    expect(markAfter(parts, 4)).toBe("off");
    s = toggleMark(s, one, "a", 3);
    expect(s.text).toBe("1-10, 11-12");
  });
  it("a mark in Every N switches to Custom with the current parts", () => {
    let s = setN(setKind(initialSplit(), "everyN"), "4");
    s = toggleMark(s, one, "a", 5);
    expect(s.kind).toBe("custom");
    expect(s.text).toBe("1-4, 5-6, 7-8, 9-12");
  });
  it("marks change only their file; the field says when the files differ", () => {
    const two = [twelve, three];
    const s = toggleMark(setKind(initialSplit(), "custom"), two, "b", 0);
    expect(partsOf(s, three, two)).toEqual([[0], [1, 2]]);
    expect(partsOf(s, twelve, two)).toEqual([[...Array(12).keys()]]);
    expect(s).toMatchObject({ text: "", differs: true });
  });
  it("Custom keeps its own field when another mode is chosen and back", () => {
    let s = typeParts(initialSplit(), "1-6");
    s = setKind(s, "every");
    expect(count(s)).toBe(12);
    s = setKind(s, "custom");
    expect(s.text).toBe("1-6");
  });
});

describe("typed parts (AC-426, AC-427, AC-436, AC-437)", () => {
  it("one part per range; pages in no range are left out and their marks hidden", () => {
    const s = typeParts(initialSplit(), "1-3, 8-9, 12");
    const plan = splitPlan(s, one)!;
    expect(plan.documents.map((d) => d.pages.map((p) => p.sourceIndex + 1))).toEqual([[1, 2, 3], [8, 9], [12]]);
    const parts = partsOf(s, twelve, one);
    const left = pageParts(parts, 12).flatMap((p, i) => (p ? [] : [i + 1]));
    expect(left).toEqual([4, 5, 6, 7, 10, 11]);
    expect(markAfter(parts, 2)).toBe("hidden");
    expect(markAfter(parts, 9)).toBe("hidden");
    expect(markAfter(parts, 7)).toBe("off");
    expect(pagesUsed(plan)).toBe(6);
  });
  it("overlaps are kept", () => {
    const plan = splitPlan(typeParts(initialSplit(), "1-4, 3-6"), one)!;
    expect(plan.documents.map((d) => d.pages.map((p) => p.sourceIndex + 1))).toEqual([[1, 2, 3, 4], [3, 4, 5, 6]]);
    expect(pageParts(partsOf(typeParts(initialSplit(), "1-4, 3-6"), twelve, one), 12)[2]).toEqual({ part: 2, first: true });
  });
  it("one part downloads as one PDF", () => {
    expect(splitPlan(typeParts(initialSplit(), "2-5"), one)!.download).toEqual({ kind: "pdf", name: "twelve-2-5.pdf" });
  });
  it("two files, Every N = 2: one flat ZIP", () => {
    const plan = splitPlan(setKind(initialSplit(), "everyN"), [twelve, three])!;
    expect(plan.download.name).toBe("berrypdf-split.zip");
    expect(plan.documents.map((d) => d.name)).toEqual([
      "twelve-1-2.pdf",
      "twelve-3-4.pdf",
      "twelve-5-6.pdf",
      "twelve-7-8.pdf",
      "twelve-9-10.pdf",
      "twelve-11-12.pdf",
      "three-pages-1-2.pdf",
      "three-pages-3.pdf",
    ]);
  });
  it("an invalid field is a problem; blur closes open ranges with one file", () => {
    expect(splitProblem(typeParts(initialSplit(), "1-4, 13"), one)).toMatchObject({ field: { item: "13" } });
    expect(splitPlan(typeParts(initialSplit(), "1-4, 13"), one)).toBeNull();
    expect(blurParts(typeParts(initialSplit(), "1 - 4, 10-"), one).text).toBe("1-4, 10-12");
    expect(clearParts(typeParts(initialSplit(), "1-4")).text).toBe("");
  });
});

describe("names (AC-430, AC-431, AC-432)", () => {
  it("renames and patterns", () => {
    const s = setN(setKind(initialSplit(), "everyN"), "4");
    const key = splitPlan(s, one)!.documents[0].key;
    expect(names(s, one, { renames: { [key]: "intro" } })[0]).toBe("intro.pdf");
    expect(names(s, one, { renames: { [key]: "a/b" } })[0]).toBe("a-b.pdf");
    expect(names(s, one, { pattern: "{name}_part{n}" })).toEqual(["twelve_part1.pdf", "twelve_part2.pdf", "twelve_part3.pdf"]);
    expect(names(s, one, { pattern: "{name}" })).toEqual(["twelve.pdf", "twelve (2).pdf", "twelve (3).pdf"]);
  });
});
