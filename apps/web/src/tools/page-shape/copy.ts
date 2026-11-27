import { formatCount as n } from "@/components/page-select/copy";

const pages = (k: number) => `${n(k)} ${k === 1 ? "page" : "pages"}`;

/** Flip copy (spec F8 §1). */
export const flipCopy = {
  direction: "Flip",
  horizontal: "Left to right",
  vertical: "Top to bottom",
  gridHint: "Click pages to flip only those. With none picked, every page is flipped.",
  primary: (k: number) => `Flip ${pages(k)}`,
};

/** Resize copy (spec F8 §2). */
export const resizeCopy = {
  mode: "Change",
  size: "Page size",
  margins: "Margins",
  paper: "Paper",
  margin: "Margin on every side",
  unit: "Unit",
  sides: "Or set each side",
  side: { top: "Top", right: "Right", bottom: "Bottom", left: "Left" },
  same: "Same",
  needs: "Enter a margin",
  gridHint: "Click pages to change only those. With none picked, every page is changed.",
  primary: (k: number) => `Resize ${pages(k)}`,
};

/** N-up copy (spec F8 §4). */
export const nupCopy = {
  perSheet: "Pages per sheet",
  columns: "Fill down, then across",
  rightToLeft: "Start from the right",
  keepSize: "Keep the paper size (pages shrink)",
  status: (k: number, sheets: number) => `${pages(k)} · ${n(sheets)} ${sheets === 1 ? "sheet" : "sheets"}`,
};

/** Crop copy (spec F8 §3). */
export const cropCopy = {
  mode: "Crop",
  auto: "Trim margins",
  area: "Choose area",
  choose: "Set area",
  change: "Edit area",
  sameSize: "Same crop on every page",
  measuring: (done: number, total: number) => `Measuring margins… ${n(done)} of ${n(total)}`,
  nothing: "No white margins to trim",
  needsArea: "Set the crop area",
  status: (k: number) => `${pages(k)} will be cropped`,
  dialogTitle: "What should stay?",
  dialogHelp: "Drag a box around the part of the page to keep. The same box is used on every page.",
  areaLabel: "Crop area. Arrow keys move it, Shift with arrow keys resizes it.",
  result: (w: number, h: number) => `Result: ${n(w)} × ${n(h)} mm`,
  fit: "Fit to content",
};
