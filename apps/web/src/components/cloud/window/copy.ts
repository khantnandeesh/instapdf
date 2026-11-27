/** Copy for the /cloud/<provider> window only (F23 spec U-6), kept out of the tool pages' bundle. */
import { providerName, providerShort, type CloudProvider } from "@/lib/cloud/providers";
import { formatCount } from "@/lib/format-count";

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

export const windowCopy = {
  windowTitle: (p: CloudProvider) => `${providerName[p]} · BerryPDF`,
  open: (p: CloudProvider) => `Open ${providerName[p]}`,
  connecting: "Connecting…",
  signingIn: "Signing in…",
  finishInGoogle: "Finish in the Google window.",
  windowPrivacy: (p: CloudProvider) => `Files go from ${providerName[p]} straight to this browser. We never see them or your sign‑in.`,
  getting: (n: number) => `Getting ${plural(n, "file")}`,
  done: "Done",
  overSize: (maxMb: number) => `Over ${maxMb} MB, skipped`,
  wrongType: "Wrong type, skipped",
  cantOpen: "Can't open, skipped",
  tooBigToExport: "Too large to export, skipped",
  stopped: "Stopped",
  keepOpen: "Keep this window open until it closes by itself.",
  addedTo: (tool: string) => `Added to ${tool}`,
  closesItself: "This window closes by itself.",
  canClose: "You can close this window.",
  deniedTitle: "Access wasn't given",
  deniedWindowBody: "We can only open the files you pick and allow.",
  unreachableTitle: (p: CloudProvider) => `Couldn't reach ${providerName[p]}`,
  unreachableWindowBody: "Check your connection and try again.",
  blockedTitle: (p: CloudProvider) => (p === "google" ? "Google couldn't open Drive here" : `${providerName[p]} couldn't open here`),
  blockedGoogle: "Cookies for google.com may be blocked in this browser, or another Google account is active.",
  blockedOther: "Its sign-in didn't work in this window.",
  blockedHelp: "How to fix it",
  blockedHelpUrl: "https://support.google.com/drive/answer/13812413",
  lostTitle: "This window lost its tool",
  lostBanner: "Lost touch with the BerryPDF tab. Keep it open: this picks up again when it answers.",
  lostBody: "The BerryPDF tab that opened it was closed or reloaded. Close this window and start again from the tool.",
  closeWindow: "Close window",
  closeAria: "Cancel and close",
  savingTitle: (p: CloudProvider) => `Saving to ${providerName[p]}`,
  savingPrivacy: (p: CloudProvider) => `Goes from this browser straight to your ${providerShort[p]}. We never see it.`,
  savedTitle: (p: CloudProvider) => `Saved to ${providerName[p]}`,
  waitingFile: "Waiting for the file…",
};
