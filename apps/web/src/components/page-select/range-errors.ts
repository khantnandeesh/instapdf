/** The range field's error text (spec F4/F5 UI P-13). Loaded with the selection model, not in the first load. */
import type { RangeError } from "@/lib/page-ranges";

const n = (v: number) => v.toLocaleString("en");

/**
 * The inline error for a bad range (P-13): it names the item and the reason. "Past the end"
 * names the file's length with one file, and says "every file" with several.
 */
export function rangeErrorText(error: RangeError, pageCounts: readonly number[]): string {
  const item = `“${error.item}”`;
  switch (error.reason) {
    case "not-a-number":
      return `${item}: not a page number`;
    case "page-zero":
      return `${item}: pages start at 1`;
    case "start-after-end":
      return `${item}: start is after end`;
    case "past-end":
      return pageCounts.length <= 1 ? `${item}: this file has ${n(pageCounts[0] ?? 0)} pages` : `${item}: past the last page of every file`;
  }
}

