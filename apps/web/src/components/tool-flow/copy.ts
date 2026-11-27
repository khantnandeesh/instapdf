/** Shared-flow copy (our own wording; spec U-5). Tool-specific labels come from the registry. */
import type { Permission, ToolFlowConfig } from "@/tools/registry";
import { formatCount } from "@/lib/format-count";

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

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
  limits: (f: ToolFlowConfig) => (f.multiFile ? `PDFs, up to ${plural(f.maxFiles, "file")}, ${Math.round(f.maxFileBytes / 1024 / 1024)} MB each` : `One PDF, up to ${Math.round(f.maxFileBytes / 1024 / 1024)} MB`),
  limitsFull: (f: ToolFlowConfig) =>
    `PDF only · up to ${f.multiFile ? plural(f.maxFiles, "file") : "1 file"}, ${Math.round(f.maxFileBytes / 1024 / 1024)} MB each, ${Math.round(f.maxTotalBytes / 1024 / 1024)} MB and ${formatCount(f.maxTotalPages)} pages in total`,
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
  errorPages: (name: string, max: number) => `${name} would take this task past ${formatCount(max)} pages, so it was skipped.`,
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
  /** By the output's MIME type: a ZIP holds several files; an image or a text file is named as such. */
  resultTitle: (type: string) =>
    type === "application/zip" ? "Your files are ready" : type.startsWith("image/") ? "Your image is ready" : type === "text/plain" ? "Your text is ready" : "Your PDF is ready",
  resultUnencrypted: "This copy has no password. Anyone who has the file can open it.",
  resultContinue: "Keep going with this file",
  resultContinueMore: (n: number) => `+${n} more`,
  reading: (name: string) => `Reading ${name}…`,
  readingCount: (n: number) => `Reading ${plural(n, "file")}`,
  fileReady: (name: string, pages: number) => `${name} ready, ${plural(pages, "page")}`,
  pages: (n: number) => plural(n, "page"),
  files: (n: number) => plural(n, "file"),
  /** ZIP result (spec F4/F5 UI P-13). */
  showAll: (n: number) => `Show all ${formatCount(n)}`,
  download: "Download",
  downloadEntry: (name: string) => `Download ${name}`,
  downloadedEntry: (name: string) => `Downloaded ${name}`,
  errorImage: (name: string) => `${name} couldn't be read as an image.`,
  errorPixels: (name: string) => `${name} is larger than 50 megapixels, the limit for images.`,
  preparingFonts: "Preparing fonts…",
  /** F25 §6: what the flow says when a run is cancelled or done (the pill's own words: slot-copy.ts). */
  cancelled: "Cancelled",
  cancelledBrowser: "Cancelled. Your file is unchanged.",
  cancelledServer: "Cancelled. Your upload was deleted.",
  cancelledServerLater: "Cancelled. Your upload will be deleted within 2 hours.",
  done: "Done",
  startOver: "Start over",
};

export const permissionLabels: Record<Permission, string> = {
  copy: "Copy text and images",
  modify: "Edit content",
  assemble: "Organize pages",
  fillForms: "Fill in forms",
  print: "Print",
  annotate: "Add comments and sign",
};

export { plural };
