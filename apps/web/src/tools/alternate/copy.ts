/**
 * Alternate & mix copy (spec F4/F5 P-13). Our own wording. The page's own: a card's settings and the
 * one-file hint and the Sort menu have theirs in copy-card.ts, which loads with them once a file is in (first-load budget).
 */
import { formatCount } from "@/lib/format-count";
const n = formatCount;
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

export const alternateCopy = {
  /** Also the card stepper's field error (copy-card.ts). */
  perTurnError: "Use a whole number from 1",
  resultLabel: "Result order",
  resultHint: "Arrow keys move between pages. Enter shows the page larger.",
  filesLabel: "Files in mix order",
  filesHint: "Use arrow keys to move between files. Alt with an arrow key moves the file.",
  status: (pages: number, files: number) => `${plural(pages, "page")} · ${plural(files, "file")}`,
  needsAnother: "Add one more file to mix",
};
