/** Copy for the /cloud/<provider> window only (F23 spec U-6), kept out of the tool pages' bundle. */
import { providerName, providerShort, type CloudProvider } from "@/lib/cloud/providers";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

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
  stopped: "Stopped",
  keepOpen: "Keep this window open until it closes by itself.",
  addedTo: (tool: string) => `Added to ${tool}`,
  closesItself: "This window closes by itself.",
  canClose: "You can close this window.",
  deniedTitle: "Access wasn't given",
  deniedWindowBody: "We can only open the files you pick and allow.",
  unreachableTitle: (p: CloudProvider) => `Couldn't reach ${providerName[p]}`,
  unreachableWindowBody: "Check your connection and try again.",
  lostTitle: "This window lost its tool",
  lostBody: "The BerryPDF tab that opened it was closed or reloaded. Close this window and start again from the tool.",
  closeWindow: "Close window",
  closeAria: "Cancel and close",
  savingTitle: (p: CloudProvider) => `Saving to ${providerName[p]}`,
  savingPrivacy: (p: CloudProvider) => `Goes from this browser straight to your ${providerShort[p]}. We never see it.`,
  savedTitle: (p: CloudProvider) => `Saved to ${providerName[p]}`,
  waitingFile: "Waiting for the file…",
};
