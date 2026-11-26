/** Shared F4 page-tool copy (spec F4/F5 UI P-13). Our own wording. The dialog's is in dialog-copy.ts and the range errors in range-errors.ts (both out of the first load). */

const n = (v: number) => v.toLocaleString("en");

export const selectCopy = {
  placeholderDiffers: "Differs per file",
  hintBubble: "Also: odd, even, last",
  hintSr: "For example 1-3, 5, 8-last. You can also type odd, even or last.",
  clearSelection: "Clear selection",
  clearParts: "Clear parts",
  more: "More options",
  moreChanged: (count: number) => `${count} changed`,
  statusEmpty: "Add a PDF to start",
  keepOne: (file?: string) => (file ? `Keep at least one page of ${file}` : "Keep at least one page"),
  skipped: (file: string) => `${file} has none of these pages, so it's skipped.`,
  stepperError: "Use a whole number from 1",
};

/** "1 page" / "12 pages", "1 file" / "3 files". */
export const pagesWord = (v: number) => (v === 1 ? "1 page" : `${n(v)} pages`);
export const filesWord = (v: number) => (v === 1 ? "1 file" : `${n(v)} files`);
export { n as formatCount };
