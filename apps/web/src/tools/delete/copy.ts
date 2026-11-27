/** Delete pages copy (spec F4/F5 UI P-13). Our own wording. */
import { formatCount as n } from "@/components/page-select/copy";

export const deleteCopy = {
  step: "Pages to delete",
  field: "Pages to delete",
  placeholder: "2, 5-7, last",
  tile: (page: number) => `Remove page ${n(page)}`,
  primary: (pages: number) => (pages === 1 ? "Delete 1 page" : `Delete ${n(pages)} pages`),
  deleted: (pages: number) => (pages === 1 ? "1 page deleted." : `${n(pages)} pages deleted.`),
  status: (kept: number, total: number) => `${n(kept)} of ${n(total)} pages kept`,
  statusEmpty: "Pick pages to delete",
  liveMarked: (page: number, kept: number, total: number) => `Page ${n(page)} marked. ${n(kept)} of ${n(total)} pages kept`,
  liveKept: (page: number) => `Page ${n(page)} kept`,
  liveCount: (kept: number, total: number) => `${n(kept)} of ${n(total)} pages kept`,
  gridHint: "Space marks, Shift+Space marks a range. Delete or Backspace marks too.",
};
