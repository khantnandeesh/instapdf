import { describe, expect, it } from "vitest";
import {
  blurText,
  clearSelection,
  emptySelection,
  extendTo,
  fieldError,
  quickPick,
  selectAll,
  selectedCount,
  syncFiles,
  textForSets,
  togglePage,
  typeText,
  type SelFile,
} from "./selection";

const twelve: SelFile = { id: "a", name: "twelve.pdf", pageCount: 12 };
const three: SelFile = { id: "b", name: "three-pages.pdf", pageCount: 3 };
const one = [twelve];
const two = [twelve, three];

describe("typing (AC-402, AC-544)", () => {
  it("selects the typed pages and writes the canonical form on blur", () => {
    let s = typeText(emptySelection(), "1-3, 5, 10-", one);
    expect(s.sets.a).toEqual([0, 1, 2, 4, 9, 10, 11]);
    s = blurText(s, one);
    expect(s.text).toBe("1-3, 5, 10-12");
    expect(typeText(emptySelection(), "-2", one).sets.a).toEqual([0, 1]);
  });
  it("keeps open ranges and keywords as typed with several files", () => {
    const s = blurText(typeText(emptySelection(), "10-, last", two), two);
    expect(s.text).toBe("10-, last");
    expect(s.sets).toEqual({ a: [9, 10, 11], b: [2] });
  });
  it("reads keywords in any case", () => {
    expect(typeText(emptySelection(), "EVEN", one).sets.a).toEqual([1, 3, 5, 7, 9, 11]);
    expect(typeText(emptySelection(), "odd, 12", one).sets.a).toEqual([0, 2, 4, 6, 8, 10, 11]);
    expect(typeText(emptySelection(), "10-last", one).sets.a).toEqual([9, 10, 11]);
  });
  it("keeps document order without repeats (AC-455)", () => {
    const s = blurText(typeText(emptySelection(), "9, 2-3", one), one);
    expect(s.sets.a).toEqual([1, 2, 8]);
    expect(s.text).toBe("2-3, 9");
  });
  it("names the bad item (AC-403) and keeps the tiles while the text is invalid", () => {
    for (const bad of ["abc", "0", "13", "5-3", "2-x", "lst"]) expect(fieldError(bad, one)?.item, bad).toBeTruthy();
    expect(fieldError("2-x", one)?.reason).toBe("not-a-number");
    expect(fieldError("13", one)?.reason).toBe("past-end");
    expect(fieldError("2", one)).toBeNull();
    const s = typeText(typeText(emptySelection(), "2", one), "2-x", one);
    expect(s.sets.a).toEqual([1]);
    expect(blurText(s, one).text).toBe("2-x");
  });
  it("an item past one file's end is fine while it fits another (§3a)", () => {
    expect(fieldError("10-12", two)).toBeNull();
    expect(typeText(emptySelection(), "10-12", two).sets).toEqual({ a: [9, 10, 11], b: [] });
    expect(fieldError("13", two)?.reason).toBe("past-end");
  });
});

describe("grid clicks (AC-404, AC-405, AC-408)", () => {
  it("toggles pages and writes them into the field", () => {
    let s = togglePage(emptySelection(), one, "a", 1);
    s = togglePage(s, one, "a", 3);
    expect(s.sets.a).toEqual([1, 3]);
    s = togglePage(s, one, "a", 3);
    expect(s.sets.a).toEqual([1]);
    expect(s.text).toBe("2");
  });
  it("Shift extends from the last clicked page to this one", () => {
    let s = togglePage(emptySelection(), one, "a", 1);
    s = extendTo(s, one, "a", 4);
    s = togglePage(s, one, "a", 8);
    expect(s.text).toBe("2-5, 9");
    s = togglePage(clearSelection(s), one, "a", 5);
    s = extendTo(s, one, "a", 8);
    expect(s.sets.a).toEqual([5, 6, 7, 8]);
  });
  it("a range from an unpicked anchor unpicks", () => {
    let s = selectAll(emptySelection(), one);
    s = togglePage(s, one, "a", 2);
    s = extendTo(s, one, "a", 5);
    expect(s.sets.a).toEqual([0, 1, 6, 7, 8, 9, 10, 11]);
  });
  it("Shift on another file is a plain toggle", () => {
    const s = extendTo(togglePage(emptySelection(), two, "a", 1), two, "b", 2);
    expect(s.sets).toEqual({ a: [1], b: [2] });
  });
  it("a click changes one file; the field empties when the files differ; typing applies to all again", () => {
    let s = typeText(emptySelection(), "1-2", two);
    expect(s.sets).toEqual({ a: [0, 1], b: [0, 1] });
    s = togglePage(s, two, "b", 2);
    expect(s.sets).toEqual({ a: [0, 1], b: [0, 1, 2] });
    expect(s).toMatchObject({ text: "", differs: true });
    s = typeText(s, "1", two);
    expect(s.sets).toEqual({ a: [0], b: [0] });
    expect(s.differs).toBe(false);
  });
  it("finds one list for several files when there is one", () => {
    expect(textForSets({ a: [0, 1], b: [0, 1] }, two)).toEqual({ text: "1-2", differs: false });
    expect(textForSets({ a: [9, 10, 11], b: [] }, two)).toEqual({ text: "10-12", differs: false });
    expect(textForSets({ a: [], b: [] }, two)).toEqual({ text: "", differs: false });
    expect(textForSets({ a: [...Array(12).keys()], b: [0, 1, 2] }, two)).toEqual({ text: "1-12", differs: false });
  });
});

describe("clear, select all, quick pick", () => {
  it("Clear empties tiles and field (AC-406)", () => {
    const s = clearSelection(typeText(emptySelection(), "1-4", one));
    expect(selectedCount(s, one)).toBe(0);
    expect(s.text).toBe("");
  });
  it("Odd and Even select and write the pages (AC-452, AC-453, AC-454)", () => {
    let s = quickPick(emptySelection(), one, "odd");
    expect(s.sets.a).toEqual([0, 2, 4, 6, 8, 10]);
    expect(s.text).toBe("1, 3, 5, 7, 9, 11");
    expect(s.pick).toBe("odd");
    s = togglePage(s, one, "a", 1);
    expect(s.pick).toBe("custom");
    expect(s.sets.a).toContain(1);
    expect(quickPick(emptySelection(), one, "even").text).toBe("2, 4, 6, 8, 10, 12");
    expect(quickPick(emptySelection(), two, "even").text).toBe("even");
  });
  it("select all picks every page (AC-456)", () => {
    expect(selectedCount(selectAll(emptySelection(), two), two)).toBe(15);
  });
});

describe("files changing", () => {
  it("drops removed files and gives new ones the field's list", () => {
    let s = typeText(emptySelection(), "1", one);
    s = syncFiles(s, two);
    expect(s.sets).toEqual({ a: [0], b: [0] });
    s = syncFiles(s, [three]);
    expect(s.sets).toEqual({ b: [0] });
  });
  it("returns the same state when nothing changed", () => {
    const s = typeText(emptySelection(), "1", one);
    expect(syncFiles(s, one)).toBe(s);
  });
});
