import { formatCount } from "@/lib/format-count";
/**
 * The action slot's and the progress pill's words (F25 §6, §7). Their own module so they ship with the
 * loaded chrome (loaded-chrome.ts), the result and the editor, never in a tool's first load.
 */
export const slotCopy = {
  cancel: "Cancel",
  keepTabOpen: "Keep this tab open.",
  queueEta: (minutes: number) => `About ${minutes} min. Keep this tab open.`,
  inLine: "in line",
  uploading: "Uploading",
  done: "Done",
  tryAgain: "Try again",
  errorShort: "That didn't work.",
  backToEditing: "Back to editing",
  startOver: "Start over",
  pillGroup: (action: string) => `${action} progress`,
  queueText: (n: number, minutes?: number) => `${ordinal(n)} in line${minutes ? `, about ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : ""}`,
  partsCounter: (n: number) => `1 / ${formatCount(n)} files`,
  progress: (verb: string, percent: number) => `${verb}… ${percent}%`,
};

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st... */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${n % 10 > 3 ? "th" : s}`;
}
