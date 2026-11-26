import { describe, expect, it } from "vitest";
import { parsePageRanges, type RangeItem } from "./page-ranges";
import {
  canMix,
  formatParts,
  interleave,
  isCut,
  isMarkVisible,
  pagesPerFile,
  pagesToken,
  parseCount,
  partsFromCuts,
  planAlternate,
  planDelete,
  planExtract,
  planSplit,
  splitParts,
  toggleCut,
  twoSidedScanOrder,
  type MixCard,
  type PlanFile,
  type PlannedPage,
  type SplitMode,
} from "./page-plans";

const twelve: PlanFile = { id: "t", name: "twelve.pdf", pageCount: 12 };
const three: PlanFile = { id: "p", name: "three-pages.pdf", pageCount: 3 };
const items = (text: string): RangeItem[] => {
  const r = parsePageRanges(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.items;
};
/** 1-based page numbers of each part. */
const nums = (parts: number[][]) => parts.map((p) => p.map((i) => i + 1));
const names = (plan: ReturnType<typeof planSplit>) => plan.documents.map((d) => d.name);
const date = new Date(2026, 10, 26);

describe("Split modes (§3b)", () => {
  it("AC-420: every page gives 12 one-page parts named twelve-1 … twelve-12, in a ZIP named after the input", () => {
    const plan = planSplit([twelve], { mode: { kind: "every" } });
    expect(plan.documents).toHaveLength(12);
    expect(names(plan)).toEqual(Array.from({ length: 12 }, (_, i) => `twelve-${i + 1}.pdf`));
    expect(plan.documents[4].pages).toEqual([{ sourceId: "t", sourceIndex: 4, rotation: 0 }]);
    expect(plan.download).toEqual({ kind: "zip", name: "twelve-split.zip" });
  });

  it("AC-421: every N = 2 gives 6 parts; N = 5 gives 1-5, 6-10, 11-12", () => {
    expect(splitParts(12, { kind: "everyN", n: 2 })).toHaveLength(6);
    const plan = planSplit([twelve], { mode: { kind: "everyN", n: 5 } });
    expect(names(plan)).toEqual(["twelve-1-5.pdf", "twelve-6-10.pdf", "twelve-11-12.pdf"]);
    expect(plan.documents.map((d) => d.pages.length)).toEqual([5, 5, 2]);
    expect(plan.documents.map((d) => d.range)).toEqual(["1-5", "6-10", "11-12"]);
  });

  it("AC-422: N of 12 or 20 gives one part; N fields reject 0, -1, 2.5, x and empty", () => {
    expect(splitParts(12, { kind: "everyN", n: 12 })).toHaveLength(1);
    expect(splitParts(12, { kind: "everyN", n: 20 })).toHaveLength(1);
    for (const bad of ["0", "-1", "2.5", "x", "", " ", "10000"]) expect(parseCount(bad), bad).toBeNull();
    expect(parseCount(" 5 ")).toBe(5);
    expect(parseCount("9999")).toBe(9999);
  });

  it("AC-423: spreads gives [1, 2, 2, 2, 2, 2, 1] starting at pages 1, 2, 4, 6, 8, 10, 12", () => {
    const parts = splitParts(12, { kind: "spreads" });
    expect(parts.map((p) => p.length)).toEqual([1, 2, 2, 2, 2, 2, 1]);
    expect(parts.map((p) => p[0] + 1)).toEqual([1, 2, 4, 6, 8, 10, 12]);
    expect(splitParts(3, { kind: "spreads" }).map((p) => p.length)).toEqual([1, 2]);
    expect(splitParts(1, { kind: "spreads" })).toEqual([[0]]);
    expect(splitParts(0, { kind: "spreads" })).toEqual([]);
  });

  it("AC-439: the counts for the four modes are 12, 6, 7 and 1 (empty Custom field = the whole file)", () => {
    expect([{ kind: "every" }, { kind: "everyN", n: 2 }, { kind: "spreads" }, { kind: "ranges", items: [] }].map((m) => splitParts(12, m as never).length)).toEqual([12, 6, 7, 1]);
  });

  it("AC-426: Custom `1-3, 8-9, 12` gives 3 parts, pages outside every range left out", () => {
    const plan = planSplit([twelve], { mode: { kind: "ranges", items: items("1-3, 8-9, 12") } });
    expect(plan.documents.map((d) => d.pages.map((p) => p.sourceIndex + 1))).toEqual([[1, 2, 3], [8, 9], [12]]);
    expect(names(plan)).toEqual(["twelve-1-3.pdf", "twelve-8-9.pdf", "twelve-12.pdf"]);
  });

  it("AC-427: overlapping ranges each make a part, in the typed order", () => {
    expect(nums(splitParts(12, { kind: "ranges", items: items("3-6, 1-4") }))).toEqual([[3, 4, 5, 6], [1, 2, 3, 4]]);
  });

  it("AC-436: exactly one part downloads as that PDF, not a ZIP", () => {
    const plan = planSplit([twelve], { mode: { kind: "ranges", items: items("2-5") } });
    expect(plan.download).toEqual({ kind: "pdf", name: "twelve-2-5.pdf" });
  });

  it("AC-437: two inputs with every N = 2 give one flat list in berrypdf-split.zip", () => {
    const plan = planSplit([twelve, three], { mode: { kind: "everyN", n: 2 } });
    expect(names(plan)).toEqual([
      "twelve-1-2.pdf",
      "twelve-3-4.pdf",
      "twelve-5-6.pdf",
      "twelve-7-8.pdf",
      "twelve-9-10.pdf",
      "twelve-11-12.pdf",
      "three-pages-1-2.pdf",
      "three-pages-3.pdf",
    ]);
    expect(plan.download).toEqual({ kind: "zip", name: "berrypdf-split.zip" });
  });

  it("Custom ranges read each file's length; a file with no part in range is skipped", () => {
    const plan = planSplit([twelve, three], { mode: { kind: "ranges", items: items("10-") } });
    expect(names(plan)).toEqual(["twelve-10-12.pdf"]);
    expect(plan.skipped).toEqual([{ sourceId: "p", name: "three-pages.pdf" }]);
    expect(plan.download.kind).toBe("pdf");
  });

  it("per-file parts (marks on one file) override the shared mode for that file only", () => {
    const plan = planSplit([twelve, three], { mode: { kind: "everyN", n: 6 }, perFile: { p: { kind: "parts", parts: [[0], [1, 2]] } } });
    expect(names(plan)).toEqual(["twelve-1-6.pdf", "twelve-7-12.pdf", "three-pages-1.pdf", "three-pages-2-3.pdf"]);
  });
});

describe("Split names (§3a, §6a)", () => {
  it("AC-431: `{name}_part{n}` with every N = 4", () => {
    expect(names(planSplit([twelve], { mode: { kind: "everyN", n: 4 }, pattern: "{name}_part{n}" }))).toEqual(["twelve_part1.pdf", "twelve_part2.pdf", "twelve_part3.pdf"]);
  });
  it("AC-432: `{name}` with every N = 4 numbers the duplicates", () => {
    expect(names(planSplit([twelve], { mode: { kind: "everyN", n: 4 }, pattern: "{name}" }))).toEqual(["twelve.pdf", "twelve (2).pdf", "twelve (3).pdf"]);
  });
  it("{first}, {last} and {date} tokens; `{n}` counts within each input", () => {
    const plan = planSplit([twelve, three], { mode: { kind: "everyN", n: 10 }, pattern: "{date}-{name}-{first}to{last}-{n}", date });
    expect(names(plan)).toEqual(["20261126-twelve-1to10-1.pdf", "20261126-twelve-11to12-2.pdf", "20261126-three-pages-1to3-1.pdf"]);
  });
  it("AC-430: a renamed part keeps its name ('intro'), and unsafe characters become '-' ('a/b')", () => {
    const first = planSplit([twelve], { mode: { kind: "everyN", n: 4 } }).documents[0];
    expect(first.key).toBe("t:1-4");
    expect(names(planSplit([twelve], { mode: { kind: "everyN", n: 4 }, renames: { [first.key]: "intro" } }))[0]).toBe("intro.pdf");
    expect(names(planSplit([twelve], { mode: { kind: "everyN", n: 4 }, renames: { [first.key]: "a/b" } }))[0]).toBe("a-b.pdf");
    expect(names(planSplit([twelve], { mode: { kind: "everyN", n: 4 }, renames: { [first.key]: "  " } }))[0]).toBe("twelve-1-4.pdf");
  });
  it("a part that is not one run names its pages with '_' (`odd`)", () => {
    expect(names(planSplit([twelve], { mode: { kind: "ranges", items: items("odd") } }))).toEqual(["twelve-1_3_5_7_9_11.pdf"]);
    expect(pagesToken([0, 1, 2, 5])).toBe("1-3_6");
  });
});

describe("Split marks (§3b, AC-424, AC-425, AC-428)", () => {
  it("AC-424: marks after pages 4 and 10 give 1-4, 5-10, 11-12", () => {
    let parts = splitParts(12, { kind: "ranges", items: [] });
    parts = toggleCut(parts, 3);
    parts = toggleCut(parts, 9);
    expect(formatParts(parts, 12)).toBe("1-4, 5-10, 11-12");
    expect(isCut(parts, 3)).toBe(true);
    expect(isCut(parts, 4)).toBe(false);
    expect(partsFromCuts(12, [3, 9])).toEqual(parts);
  });
  it("AC-425: turning the mark after page 4 off joins the parts again: 1-10, 11-12", () => {
    const parts = toggleCut(partsFromCuts(12, [3, 9]), 3);
    expect(formatParts(parts, 12)).toBe("1-10, 11-12");
  });
  it("AC-428: every N = 4, then the mark after page 6, gives 1-4, 5-6, 7-8, 9-12", () => {
    const parts = toggleCut(splitParts(12, { kind: "everyN", n: 4 }), 5);
    expect(formatParts(parts, 12)).toBe("1-4, 5-6, 7-8, 9-12");
  });
  it("AC-426: marks between pages in no part are hidden", () => {
    const parts = splitParts(12, { kind: "ranges", items: items("1-3, 8-9, 12") });
    expect(isMarkVisible(parts, 2)).toBe(false); // between 3 and 4 (4 is in no part)
    expect(isMarkVisible(parts, 1)).toBe(true);
    expect(isMarkVisible(parts, 10)).toBe(false); // 11 is in no part
    expect(isCut(parts, 8)).toBe(false); // 9 ends a part but 10 is not next
  });
  it("odd/even parts are kept as keywords and never joined", () => {
    const parts = splitParts(12, { kind: "ranges", items: items("odd, even") });
    expect(formatParts(parts, 12)).toBe("odd, even");
    expect(toggleCut(parts, 10)).toEqual(parts);
  });
});

describe("Extract (§3c, §6b)", () => {
  it("AC-451, AC-455: selected pages in document order, one file named like the input", () => {
    const plan = planExtract([twelve], { t: [8, 1, 2, 3, 4, 2] });
    expect(plan.documents[0].pages.map((p) => p.sourceIndex + 1)).toEqual([2, 3, 4, 5, 9]);
    expect(plan.download).toEqual({ kind: "pdf", name: "twelve.pdf" });
  });
  it("AC-452, AC-453: odd and even through the shared field", () => {
    const odd = planExtract([twelve], pagesPerFile(items("odd"), [twelve]));
    expect(odd.documents[0].pages.map((p) => p.sourceIndex + 1)).toEqual([1, 3, 5, 7, 9, 11]);
    const even = planExtract([twelve], pagesPerFile(items("even"), [twelve]));
    expect(even.documents[0].pages.map((p) => p.sourceIndex + 1)).toEqual([2, 4, 6, 8, 10, 12]);
  });
  it("AC-460: two inputs; `1-2` gives a ZIP; `10-12` skips three-pages.pdf and gives one PDF", () => {
    const both = planExtract([twelve, three], pagesPerFile(items("1-2"), [twelve, three]));
    expect(both.download).toEqual({ kind: "zip", name: "berrypdf-extract.zip" });
    expect(both.documents.map((d) => [d.name, d.pages.length])).toEqual([["twelve.pdf", 2], ["three-pages.pdf", 2]]);
    const mixed = planExtract([twelve, three], pagesPerFile(items("3-5"), [twelve, three]));
    expect(mixed.documents.map((d) => d.pages.map((p) => p.sourceIndex + 1))).toEqual([[3, 4, 5], [3]]);
    const one = planExtract([twelve, three], pagesPerFile(items("10-12"), [twelve, three]));
    expect(one.skipped).toEqual([{ sourceId: "p", name: "three-pages.pdf" }]);
    expect(one.download).toEqual({ kind: "pdf", name: "twelve.pdf" });
  });
  it("AC-462: the pattern `{name}-extract`", () => {
    expect(planExtract([twelve], { t: [0] }, { pattern: "{name}-extract" }).download.name).toBe("twelve-extract.pdf");
  });
  it("same-named inputs get unique names", () => {
    const plan = planExtract([twelve, { ...twelve, id: "t2" }], { t: [0], t2: [1] });
    expect(plan.documents.map((d) => d.name)).toEqual(["twelve.pdf", "twelve (2).pdf"]);
  });
});

describe("Delete (§3d, §6c)", () => {
  it("AC-465, AC-467: the marked pages go, order kept, original name", () => {
    const plan = planDelete([twelve], pagesPerFile(items("1-3, 10-"), [twelve]));
    expect(plan.documents[0].pages.map((p) => p.sourceIndex + 1)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(plan.download).toEqual({ kind: "pdf", name: "twelve.pdf" });
    expect(plan.blocked).toEqual([]);
  });
  it("AC-469: every page marked blocks the run and names the file", () => {
    const plan = planDelete([twelve], pagesPerFile(items("1-"), [twelve]));
    expect(plan.documents).toEqual([]);
    expect(plan.blocked).toEqual([{ sourceId: "t", name: "twelve.pdf" }]);
  });
  it("AC-474: two inputs with `1` give berrypdf-delete.zip; `1-3` blocks three-pages.pdf", () => {
    const plan = planDelete([twelve, three], pagesPerFile(items("1"), [twelve, three]));
    expect(plan.download).toEqual({ kind: "zip", name: "berrypdf-delete.zip" });
    expect(plan.documents.map((d) => [d.name, d.pages.length])).toEqual([["twelve.pdf", 11], ["three-pages.pdf", 2]]);
    expect(planDelete([twelve, three], pagesPerFile(items("1-3"), [twelve, three])).blocked).toEqual([{ sourceId: "p", name: "three-pages.pdf" }]);
  });
  it("AC-543: `last` marks each file's own last page", () => {
    const plan = planDelete([twelve, three], pagesPerFile(items("last"), [twelve, three]));
    expect(plan.documents.map((d) => d.pages.map((p) => p.sourceIndex + 1))).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [1, 2]]);
  });
  it("AC-410: one page off a 250-page file leaves 249", () => {
    const big = { id: "b", name: "big-250.pdf", pageCount: 250 };
    expect(planDelete([big], { b: [0] }).documents[0].pages).toHaveLength(249);
  });
});

/** Labels like the result preview: source letter + page number. */
const label = (cards: MixCard[]) => (p: PlannedPage) => `${String.fromCharCode(65 + cards.findIndex((c) => c.sourceId === p.sourceId))}${p.sourceIndex + 1}`;
const card = (sourceId: string, pageCount: number, extra: Partial<MixCard> = {}): MixCard => ({ sourceId, name: `${sourceId}.pdf`, pageCount, ...extra });

describe("Alternate & mix (§3g, §6e)", () => {
  it("AC-521, AC-530: odd + even alternate A1, B1, A2, B2 …; named after the first card", () => {
    const cards = [card("odd", 5), card("even", 5)];
    const plan = planAlternate(cards);
    expect(plan.name).toBe("odd_mixed.pdf");
    expect(plan.pages.map(label(cards))).toEqual(["A1", "B1", "A2", "B2", "A3", "B3", "A4", "B4", "A5", "B5"]);
  });
  it("AC-530: two pages per turn on the first card", () => {
    const cards = [card("odd", 5, { perTurn: 2 }), card("even", 5)];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "A2", "B1", "A3", "A4", "B2", "A5", "B3", "B4", "B5"]);
  });
  it("AC-522: the second card read in reverse", () => {
    const cards = [card("odd", 5), card("rev", 5, { reverse: true })];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "B5", "A2", "B4", "A3", "B3", "A4", "B2", "A5", "B1"]);
  });
  it("AC-523: twelve (3 per turn) + three-pages (1)", () => {
    const cards = [card("t", 12, { perTurn: 3 }), card("p", 3)];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "A2", "A3", "B1", "A4", "A5", "A6", "B2", "A7", "A8", "A9", "B3", "A10", "A11", "A12"]);
  });
  it("AC-524: leftovers of the longer file follow at the end", () => {
    const cards = [card("t", 12), card("s", 2)];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "B1", "A2", "B2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12"]);
  });
  it("AC-525: a one-page card repeats every round, never after the last real page", () => {
    const cards = [card("t", 12, { perTurn: 4 }), card("sep", 1)];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "A2", "A3", "A4", "B1", "A5", "A6", "A7", "A8", "B1", "A9", "A10", "A11", "A12"]);
  });
  it("AC-526: with Repeat off it is used once", () => {
    const cards = [card("t", 12, { perTurn: 4 }), card("sep", 1, { repeat: false })];
    expect(interleave(cards)).toHaveLength(13);
    expect(interleave(cards).map(label(cards)).slice(4, 6)).toEqual(["B1", "A5"]);
  });
  it("AC-527, AC-535: a repeating card first leads every round (15 pages)", () => {
    const cards = [card("sep", 1), card("t", 12, { perTurn: 4 })];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "B1", "B2", "B3", "B4", "A1", "B5", "B6", "B7", "B8", "A1", "B9", "B10", "B11", "B12"]);
  });
  it("AC-528: card order decides who goes first", () => {
    const cards = [card("even", 5), card("odd", 5)];
    expect(interleave(cards).map((p) => p.sourceId).slice(0, 2)).toEqual(["even", "odd"]);
  });
  it("AC-533: three cards", () => {
    const cards = [card("odd", 5), card("even", 5), card("short", 2)];
    expect(interleave(cards).map(label(cards))).toEqual(["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "A4", "B4", "A5", "B5"]);
  });
  it("AC-532: 99 per turn gives everything in one turn", () => {
    const cards = [card("odd", 5, { perTurn: 99 }), card("even", 5)];
    expect(interleave(cards).map(label(cards)).slice(0, 6)).toEqual(["A1", "A2", "A3", "A4", "A5", "B1"]);
  });
  it("AC-531: two cards are needed, and a lone repeating page does not count", () => {
    expect(canMix([card("odd", 5)])).toBe(false);
    expect(canMix([card("odd", 5), card("even", 5)])).toBe(true);
    expect(canMix([card("a", 1), card("b", 1)])).toBe(false);
    expect(canMix([card("a", 1), card("b", 1, { repeat: false })])).toBe(true);
    expect(interleave([card("a", 1), card("b", 1)])).toEqual([]);
  });
});

describe("Two-sided scan order (I-9)", () => {
  it("AC-547: F1 F2 F3 B3 B2 B1 becomes F1 B1 F2 B2 F3 B3", () => {
    expect(twoSidedScanOrder(["F1", "F2", "F3", "B3", "B2", "B1"])).toEqual(["F1", "B1", "F2", "B2", "F3", "B3"]);
  });
  it("AC-548: an odd count keeps the extra front last", () => {
    expect(twoSidedScanOrder(["F1", "F2", "F3", "B2", "B1"])).toEqual(["F1", "B1", "F2", "B2", "F3"]);
    expect(twoSidedScanOrder([])).toEqual([]);
    expect(twoSidedScanOrder(["X"])).toEqual(["X"]);
  });
});

describe("review 10: bad counts never give empty, garbage or endless output", () => {
  const bad = [Number.NaN, 0, -2, 2.5, Number.POSITIVE_INFINITY];

  it("Split every N with a bad N gives no parts and no documents (never `twelve-.pdf`)", () => {
    for (const n of bad) {
      expect(splitParts(12, { kind: "everyN", n }), String(n)).toEqual([]);
      const plan = planSplit([twelve], { mode: { kind: "everyN", n } });
      expect(plan.documents, String(n)).toEqual([]);
      expect(plan.skipped.map((f) => f.sourceId)).toEqual(["t"]);
      expect(plan.download.name).not.toBe("twelve-.pdf");
    }
    expect(splitParts(12, { kind: "everyN", n: 5 }).map((p) => p.length)).toEqual([5, 5, 2]);
  });

  it("a bad page count reads as an empty file in every planner", () => {
    for (const pageCount of [Number.NaN, -1, 2.5, Number.POSITIVE_INFINITY]) {
      const f: PlanFile = { id: "x", name: "x.pdf", pageCount };
      for (const mode of [{ kind: "every" }, { kind: "everyN", n: 2 }, { kind: "spreads" }, { kind: "ranges", items: [] }] satisfies SplitMode[]) {
        expect(splitParts(pageCount, mode), `${pageCount} ${mode.kind}`).toEqual([]);
      }
      expect(partsFromCuts(pageCount, [0])).toEqual([]);
      expect(planSplit([f], { mode: { kind: "every" } }).documents).toEqual([]);
      expect(planExtract([f], pagesPerFile(items("1-3"), [f])).documents).toEqual([]);
      expect(planDelete([f], {}).documents).toEqual([]);
      expect(interleave([{ sourceId: "x", name: "x.pdf", pageCount }, { sourceId: "p", name: "p.pdf", pageCount: 2 }]).map((p) => p.sourceId)).toEqual(["p", "p"]);
    }
  });

  it("page indexes that are not whole numbers are dropped from parts, selections and marks", () => {
    expect(splitParts(12, { kind: "parts", parts: [[0, 1.5, Number.NaN, 2]] })).toEqual([[0, 2]]);
    expect(planExtract([twelve], { t: [1.5, Number.NaN, 3] }).documents[0].pages.map((p) => p.sourceIndex)).toEqual([3]);
    expect(planDelete([three], { p: [0.5, 1] }).documents[0].pages.map((p) => p.sourceIndex)).toEqual([0, 2]);
  });

  it("Alternate with a bad pages-per-turn terminates and cannot start", () => {
    for (const perTurn of bad) {
      const cards: MixCard[] = [
        { sourceId: "a", name: "a.pdf", pageCount: 3, perTurn },
        { sourceId: "b", name: "b.pdf", pageCount: 2 },
      ];
      expect(canMix(cards), String(perTurn)).toBe(false);
      const out = interleave(cards);
      expect(out.length, String(perTurn)).toBe(5);
    }
    expect(canMix([{ sourceId: "a", name: "a.pdf", pageCount: Number.NaN }, { sourceId: "b", name: "b.pdf", pageCount: 1 }])).toBe(false);
  });
});
