/** Extract pages copy (spec F4/F5 UI P-13). Our own wording. */
import { formatCount as n } from "@/components/page-select/copy";

export const extractCopy = {
  /** The default name pattern: lib/page-plans EXTRACT_PATTERN (page-tools.test.ts keeps them equal). */
  defaultPattern: "{name}",
  step: "Pages to keep",
  field: "Pages to keep",
  placeholder: "1-3, 5, 8-last",
  pick: "Pick",
  odd: "Odd",
  even: "Even",
  custom: "Custom",
  tile: (page: number, total: number) => `Page ${n(page)} of ${n(total)}`,
  primary: (pages: number) => (pages === 1 ? "Extract 1 page" : `Extract ${n(pages)} pages`),
  status: (k: number, total: number) => `${n(k)} of ${n(total)} pages`,
  statusEmpty: "Pick pages to keep",
  live: (k: number, total: number) => `${n(k)} of ${n(total)} pages picked`,
  gridHint: "Space picks, Shift+Space picks a range.",
  skippedTitle: "A file is skipped",
};
