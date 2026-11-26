/** Shared-flow copy (our own wording; spec U-5). Tool-specific labels come from the registry. */
import type { Permission, ToolFlowConfig } from "@/tools/registry";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export const copy = {
  /** F25 §2: the picker names what it takes; its label never changes while a file opens. */
  pickerButton: (multi: boolean) => (multi ? "Choose files" : "Choose PDF"),
  pickerHint: "or drop them here",
  pickerHintOne: "or drop a PDF here",
  privacyIntro: "Your files stay on this device.",
  privacyResult: "Done on this device. Never uploaded.",
  /** Server tools (F25 AC-603): honest about the upload (CLAUDE.md rule 4). */
  privacyIntroServer: "Uploaded securely, deleted after 2 hours.",
  privacyResultServer: "Deleted from our server in 2 hours.",
  limits: (f: ToolFlowConfig) => `PDF. ${f.multiFile ? `Up to ${plural(f.maxFiles, "file")}` : "1 file"}, ${Math.round(f.maxFileBytes / 1024 / 1024)} MB each.`,
  limitsFull: (f: ToolFlowConfig) =>
    `PDF only · up to ${f.multiFile ? plural(f.maxFiles, "file") : "1 file"}, ${Math.round(f.maxFileBytes / 1024 / 1024)} MB each, ${Math.round(f.maxTotalBytes / 1024 / 1024)} MB and ${f.maxTotalPages.toLocaleString("en-US")} pages in total`,
  statusEmpty: "Add a PDF to start",
  statusLoading: "Reading files…",
  statusPassword: "Waiting for a password",
  statusOwner: "This file needs its owner password for this tool",
  statusReady: (pages: number, files: number) => `${plural(pages, "page")} · ${plural(files, "file")}`,
  progress: (label: string, pct: number) => `${label}… ${pct}%`,
  errorType: (name: string) => `${name} isn't a PDF, so it was skipped. This tool accepts PDF files.`,
  errorCorrupt: (name: string) => `${name} couldn't be opened. It may be damaged or not really a PDF.`,
  errorSize: (name: string, mb: number) => `${name} is larger than ${mb} MB, the limit for this tool.`,
  errorTotal: (name: string, mb: number) => `${name} would take this task past ${mb} MB in total, so it was skipped.`,
  errorPages: (name: string, max: number) => `${name} would take this task past ${max.toLocaleString("en-US")} pages, so it was skipped.`,
  errorCount: (max: number) => `This tool takes up to ${max} files at a time. We loaded the first ${max}.`,
  errorProcess: (label: string) => `Something went wrong while ${label.toLowerCase()}. Your files and settings are still here.`,
  problemsTitle: (n: number) => (n === 1 ? "A file was skipped" : `${n} files were skipped`),
  pwTitle: (name: string) => `${name} is locked`,
  pwBody: "Enter its password to open it here. The password stays on this device.",
  pwWrong: "That password didn't work. Check it and try again.",
  pwApplyAll: "Try this password on the other locked files",
  pwQueue: (i: number, n: number) => `Locked file ${i} of ${n}`,
  pwUnlock: "Unlock",
  pwSkip: "Skip this file",
  resultTitle: (multi: boolean) => (multi ? "Your files are ready" : "Your PDF is ready"),
  resultUnencrypted: "This copy has no password. Anyone who has the file can open it.",
  resultContinue: "Keep going with this file",
  reading: (name: string) => `Reading ${name}…`,
  readingCount: (n: number) => `Reading ${plural(n, "file")}`,
  fileReady: (name: string, pages: number) => `${name} ready, ${plural(pages, "page")}`,
  pages: (n: number) => plural(n, "page"),
  files: (n: number) => plural(n, "file"),
  /** ZIP result (spec F4/F5 UI P-13). */
  showAll: (n: number) => `Show all ${n.toLocaleString("en")}`,
  downloadEntry: (name: string) => `Download ${name}`,
  downloadedEntry: (name: string) => `Downloaded ${name}`,
  errorImage: (name: string) => `${name} couldn't be read as an image.`,
  errorPixels: (name: string) => `${name} is larger than 50 megapixels, the limit for images.`,
  preparingFonts: "Preparing fonts…",
  /** F25 §6: the action pill and the slot. */
  cancel: "Cancel",
  cancelled: "Cancelled",
  cancelledBrowser: "Cancelled. Your file is unchanged.",
  cancelledServer: "Cancelled. Your upload was deleted.",
  cancelledServerLater: "Cancelled. Your upload will be deleted within 2 hours.",
  keepTabOpen: "Keep this tab open.",
  queueEta: (minutes: number) => `About ${minutes} min. Keep this tab open.`,
  inLine: "in line",
  uploading: "Uploading",
  done: "Done",
  tryAgain: "Try again",
  startOver: "Start over",
  errorShort: "That didn't work.",
  backToEditing: "Back to editing",
  pillGroup: (action: string) => `${action} progress`,
  queueText: (n: number, minutes?: number) => `${ordinal(n)} in line${minutes ? `, about ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : ""}`,
  partsCounter: (n: number) => `1 / ${n.toLocaleString("en-US")} files`,
};

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st... */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${n % 10 > 3 ? "th" : s}`;
}

export const permissionLabels: Record<Permission, string> = {
  copy: "Copy text and images",
  modify: "Edit content",
  assemble: "Organize pages",
  fillForms: "Fill in forms",
  print: "Print",
  annotate: "Add comments and sign",
};

export { plural };
