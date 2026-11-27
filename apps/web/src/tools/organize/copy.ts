/** Organize copy (spec F4/F5 P-13). Our own wording; Merge's strings cover tiles, picker, move and remove. */
import { formatCount } from "@/lib/format-count";
const n = formatCount;
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

export const organizeCopy = {
  select: "Select",
  sort: "Sort",
  remove: "Remove",
  pageTools: "Page tools",
  selectAll: "Select all",
  selectNone: "Select none",
  invert: "Invert selection",
  odd: "1st, 3rd, 5th…",
  even: "2nd, 4th, 6th…",
  oddName: "Odd positions: 1st, 3rd, 5th…",
  evenName: "Even positions: 2nd, 4th, 6th…",
  twoSided: "Two-sided scan order",
  twoSidedHint: "For a scan of all fronts, then all backs in reverse",
  twoSidedDone: "Put in two-sided scan order",
  needsTwoPages: "Add more pages to reorder",
  reverseSelectionNeedsTwo: "Select two or more pages to reverse, or none for all",
  twoSidedSelectionNeedsTwo: "Select two or more pages to put in scan order, or none for all",
  removeSelected: "Remove selected",
  keepOnly: (name: string) => `Keep only ${name}`,
  removeAll: "Remove all",
  fromLoaded: "From a loaded file",
  fromLoadedName: (name: string) => `From a loaded file: ${name}`,
  status: (pages: number, files: number) => `${plural(pages, "page")} · ${plural(files, "file")}`,
  pagesLabel: "Pages in order",
  filesLabel: "Files in order",
};
