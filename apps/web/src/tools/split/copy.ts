/** Split copy (spec F4/F5 UI P-13). Our own wording. */
import { formatCount as n } from "@/components/page-select/copy";

export const splitCopy = {
  mode: "Split",
  every: "Every page",
  everyN: "Every N pages",
  everyNShort: "Every N",
  /** everyNShort + everyNRest = everyN (the bar hides the rest visually). */
  everyNRest: " pages",
  spreads: "Spreads",
  spreadsTip: "Page 1 alone, then pairs: 2-3, 4-5…",
  custom: "Custom",
  perFile: "Pages per file",
  fewer: "Fewer pages per file",
  more: "More pages per file",
  parts: "Parts",
  placeholder: "1-4, 5-10",
  mark: (page: number) => `Split after page ${n(page)}`,
  tile: (page: number, part: number, total: number) => `Page ${n(page)}, part ${n(part)} of ${n(total)}`,
  tileLeftOut: (page: number) => `Page ${n(page)}, not in any part`,
  primary: (files: number) => (files === 1 ? "Split into 1 file" : `Split into ${n(files)} files`),
  status: (pages: number, files: number) => `${n(pages)} ${pages === 1 ? "page" : "pages"} · ${n(files)} ${files === 1 ? "file" : "files"}`,
  statusLeftOut: (used: number, total: number, files: number) => `${n(used)} of ${n(total)} pages in ${n(files)} ${files === 1 ? "file" : "files"}`,
  statusPages: (pages: number) => `${n(pages)} ${pages === 1 ? "page" : "pages"}`,
  live: (files: number) => (files === 1 ? "1 file" : `${n(files)} files`),
  // Split by bookmarks (spec F7 §2).
  level: "Bookmark level",
  levelOption: (level: number, count: number) => `Level ${n(level)} · ${n(count)} ${count === 1 ? "bookmark" : "bookmarks"}`,
  contains: "Title contains",
  containsPlaceholder: "Any title (optional)",
  reading: "Reading bookmarks…",
  noBookmarks: (files: number) => (files === 1 ? "This PDF has no bookmarks" : "These PDFs have no bookmarks"),
  noMatch: "No bookmark matches",
};

/** Split by size copy (spec F7 §3). */
export const splitSizeCopy = {
  size: "Largest file size",
  smaller: "Smaller files",
  larger: "Larger files",
  unit: "Unit",
  error: "Use a whole number, at least 20 KB",
  needs: "Enter a size",
  status: (pages: number, text: string, unit: string) => `${n(pages)} ${pages === 1 ? "page" : "pages"} · files up to ${text} ${unit}`,
};

/** Split in half copy (spec F7 §4). */
export const splitHalfCopy = {
  direction: "Cut",
  auto: "Auto",
  sideBySide: "Left / right",
  topBottom: "Top / bottom",
  rightToLeft: "Right page first",
  booklet: "Booklet scan (reorder pages)",
  gridHint: "Click pages to cut only those. With none picked, every page is cut.",
  primary: (pages: number) => `Split ${n(pages)} ${pages === 1 ? "page" : "pages"} in half`,
};
