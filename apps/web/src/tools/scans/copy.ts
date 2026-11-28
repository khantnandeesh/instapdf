import { formatCount as n } from "@/components/page-select/copy";
import { describeTilt } from "@/lib/pdf/tilt-text";

const pages = (k: number) => `${n(k)} ${k === 1 ? "page" : "pages"}`;

/** Deskew copy (spec F15 §1). */
export const deskewCopy = {
  gridHint: "Tilted pages are shown straightened. Click a page to set its turn by hand.",
  strongOnly: "Skip slight tilts",
  strongOnlyName: "Skip slight tilts: pages tilted by less than 1° are left as they are",
  measuring: (done: number, total: number) => `Checking pages… ${n(done)} of ${n(total)}`,
  nothing: "Every page is straight",
  status: (k: number) => `${pages(k)} to straighten`,
  tile: (page: number, count: number, turn: number) => `Page ${n(page)} of ${n(count)}, ${turn ? `will be turned ${describeTilt(turn)}` : "straight"}. Set the turn by hand`,
  dialogTitle: "Straighten this page",
  dialogHelp: "Turn the page until its lines of text sit level with the guide lines.",
  turn: "Turn",
  turnText: describeTilt,
  found: (turn: number) => (turn ? `Turned ${describeTilt(turn)}` : "Not turned"),
  byHand: "set by hand",
  reset: "Use detected",
};
