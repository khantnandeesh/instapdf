import { describe, expect, it } from "vitest";
import {
  blankSizeAt,
  describeSourcePages,
  duplicatePages,
  gapToIndex,
  insertPages,
  moveBlock,
  moveSegment,
  naturalCompare,
  pageLabel,
  removePages,
  reverseSegments,
  rotatePages,
  segmentsOf,
  sortByName,
  sortPages,
  sourceLetter,
  stepIndex,
  type PageRef,
  type SourceInfo,
} from "./page-list";

const A4 = { width: 595, height: 842 };
const LETTER_L = { width: 792, height: 612 };

const sources: Record<string, SourceInfo> = {
  a: { id: "a", letter: "A", name: "alpha.pdf", size: 1, lastModified: 3, kind: "pdf", pageCount: 3 },
  b: { id: "b", letter: "B", name: "bravo.pdf", size: 1, lastModified: 1, kind: "pdf", pageCount: 2 },
  e: { id: "e", letter: "C", name: "echo.pdf", size: 1, lastModified: 2, kind: "pdf", pageCount: 1 },
};

const page = (sourceId: string, i: number): PageRef => ({ uid: `${sourceId}${i + 1}`, sourceId, sourceIndex: i, rotation: 0, size: sourceId === "b" ? LETTER_L : A4 });
const blank = (uid: string, size = A4): PageRef => ({ uid, sourceId: null, sourceIndex: -1, rotation: 0, size });
const ab = () => [page("a", 0), page("a", 1), page("a", 2), page("b", 0), page("b", 1)];
const labels = (pages: PageRef[]) => pages.map((p) => pageLabel(p, sources));
const set = (...uids: string[]) => new Set(uids);

describe("names and letters", () => {
  it("sorts naturally and case-insensitively (AC-3)", () => {
    expect(sortByName([{ name: "File10.pdf" }, { name: "file2.pdf" }, { name: "bravo.pdf" }, { name: "alpha.pdf" }]).map((f) => f.name)).toEqual([
      "alpha.pdf",
      "bravo.pdf",
      "file2.pdf",
      "File10.pdf",
    ]);
    expect(naturalCompare("a.pdf", "A.pdf")).toBe(0);
  });
  it("continues letters past Z with AA, AB (M-11 #6)", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(sourceLetter)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
  it("labels pages with letter + number and blanks as Blank", () => {
    expect(labels([page("a", 0), blank("x"), page("b", 1)])).toEqual(["A1", "Blank", "B2"]);
  });
});

describe("segments", () => {
  it("has one segment per file before any page editing", () => {
    expect(segmentsOf(ab()).map((s) => [s.sourceId, s.pages.length, s.start])).toEqual([
      ["a", 3, 0],
      ["b", 2, 3],
    ]);
  });
  it("splits a file into segments after a page moved between its pages (AC-36)", () => {
    const moved = moveBlock(ab(), set("b1"), 1);
    expect(labels(moved)).toEqual(["A1", "B1", "A2", "A3", "B2"]);
    expect(segmentsOf(moved).map((s) => `${s.sourceId}:${s.pages.length}`)).toEqual(["a:1", "b:1", "a:2", "b:1"]);
  });
  it("attaches a blank page to the segment in front of it, or the next one at the start", () => {
    const withBlank = insertPages(ab(), 3, [blank("x")]);
    expect(segmentsOf(withBlank).map((s) => s.pages.map((p) => p.uid))).toEqual([["a1", "a2", "a3", "x"], ["b1", "b2"]]);
    const atStart = insertPages(ab(), 0, [blank("y")]);
    expect(segmentsOf(atStart)[0].pages.map((p) => p.uid)).toEqual(["y", "a1", "a2", "a3"]);
    expect(segmentsOf([blank("z")]).map((s) => s.sourceId)).toEqual([null]);
  });
  it("joins two segments of the same source when they become neighbours", () => {
    const split = moveBlock(ab(), set("b1"), 1); // a1 b1 a2 a3 b2
    const joined = moveSegment(split, 1, 3); // a1 a2 a3 b1 b2
    expect(segmentsOf(joined)).toHaveLength(2);
  });
});

describe("moves", () => {
  it("drags B1 between A1 and A2 (AC-19)", () => {
    const pages = ab();
    const uids = set("b1");
    expect(labels(moveBlock(pages, uids, gapToIndex(pages, uids, 1)))).toEqual(["A1", "B1", "A2", "A3", "B2"]);
  });
  it("moves a multi-selection together, keeping its order (AC-23)", () => {
    const pages = ab();
    const uids = set("a1", "a3");
    expect(labels(moveBlock(pages, uids, gapToIndex(pages, uids, 5)))).toEqual(["A2", "B1", "B2", "A1", "A3"]);
  });
  it("moves one step and to the ends (AC-10, AC-20)", () => {
    const pages = ab();
    expect(labels(moveBlock(pages, set("b2"), stepIndex(pages, set("b2"), "first")))[0]).toBe("B2");
    expect(labels(moveBlock(pages, set("a1"), stepIndex(pages, set("a1"), "later")))).toEqual(["A2", "A1", "A3", "B1", "B2"]);
    expect(labels(moveBlock(pages, set("a1"), stepIndex(pages, set("a1"), "earlier")))[0]).toBe("A1");
    expect(labels(moveBlock(pages, set("a1"), stepIndex(pages, set("a1"), "last"))).at(-1)).toBe("A1");
  });
  it("clamps out-of-range targets", () => {
    expect(labels(moveBlock(ab(), set("a1"), 99)).at(-1)).toBe("A1");
    expect(labels(moveBlock(ab(), set("b2"), -3))[0]).toBe("B2");
    expect(moveBlock(ab(), set("nope"), 0)).toEqual(ab());
  });
  it("moves whole segments in the files view (AC-9)", () => {
    expect(labels(moveSegment(ab(), 1, 0))).toEqual(["B1", "B2", "A1", "A2", "A3"]);
  });
});

describe("edits", () => {
  it("removes pages (AC-25)", () => {
    expect(labels(removePages(ab(), set("a2")))).toEqual(["A1", "A3", "B1", "B2"]);
  });
  it("duplicates a page right after it with the same rotation (AC-27)", () => {
    let n = 0;
    const rotated = rotatePages(ab(), set("a1"), 90);
    const { pages, added } = duplicatePages(rotated, set("a1"), () => `copy${++n}`);
    expect(labels(pages)).toEqual(["A1", "A1", "A2", "A3", "B1", "B2"]);
    expect(added).toEqual(["copy1"]);
    expect(pages[1].rotation).toBe(90);
  });
  it("rotates only the given pages, cumulatively (AC-28)", () => {
    const r = rotatePages(rotatePages(ab(), set("b1"), 90), set("b1"), 90);
    expect(r.map((p) => p.rotation)).toEqual([0, 0, 0, 180, 0]);
  });
  it("sizes a blank page like the page in front of it (AC-29, AC-30)", () => {
    expect(blankSizeAt(ab(), 3)).toEqual(A4);
    expect(blankSizeAt(ab(), 5)).toEqual(LETTER_L);
    expect(blankSizeAt(ab(), 0)).toEqual(A4);
    expect(blankSizeAt(rotatePages(ab(), set("b2"), 90), 5)).toEqual({ width: 612, height: 792 });
    expect(blankSizeAt([], 0)).toEqual(A4);
  });
});

describe("sort and reverse", () => {
  const bae = () => [page("b", 0), page("b", 1), page("a", 0), page("a", 1), page("a", 2), page("e", 0)];
  it("sorts by name both ways (AC-12)", () => {
    expect(labels(sortPages(bae(), sources, "name-desc"))).toEqual(["C1", "B1", "B2", "A1", "A2", "A3"]);
    expect(labels(sortPages(bae(), sources, "name-asc"))).toEqual(["A1", "A2", "A3", "B1", "B2", "C1"]);
  });
  it("sorts by last modified (AC-13)", () => {
    expect(labels(sortPages(bae(), sources, "date-asc"))).toEqual(["B1", "B2", "C1", "A1", "A2", "A3"]);
    expect(labels(sortPages(bae(), sources, "date-desc"))).toEqual(["A1", "A2", "A3", "C1", "B1", "B2"]);
  });
  it("groups pages by file in the pages view, keeping page order (AC-35)", () => {
    const moved = moveBlock(ab(), set("b1"), 0);
    expect(labels(sortPages(moved, sources, "name-asc"))).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  });
  it("keeps a blank page with the page in front of it", () => {
    const pages = insertPages([page("b", 0), page("a", 0)], 1, [blank("x")]);
    expect(labels(sortPages(pages, sources, "name-asc"))).toEqual(["A1", "B1", "Blank"]);
  });
  it("reverses segments, not pages, and twice restores (AC-78)", () => {
    const split = moveBlock(ab(), set("b1"), 1); // A1 B1 A2 A3 B2
    expect(labels(reverseSegments(split))).toEqual(["B2", "A2", "A3", "B1", "A1"]);
    const files = [page("a", 0), page("b", 0), page("e", 0)];
    expect(reverseSegments(reverseSegments(files))).toEqual(files);
  });
});

describe("describeSourcePages", () => {
  it("names partial segments", () => {
    expect(describeSourcePages([0, 1, 2], 3)).toBe("");
    expect(describeSourcePages([1, 2], 3)).toBe("pages 2–3");
    expect(describeSourcePages([0], 3)).toBe("page 1");
    expect(describeSourcePages([2, 0], 3)).toBe("pages 3, 1");
  });
});
