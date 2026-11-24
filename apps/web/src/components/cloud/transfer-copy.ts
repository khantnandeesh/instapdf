/** F23 copy for the cloud windows, download cards, notices and saves (our own words; spec U-6). Intake problems reuse the F1 strings. */
import { formatBytes } from "@/lib/pdf/naming";
import { providerName, providerShort, type CloudProvider } from "@/lib/cloud/providers";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export const transferCopy = {
  status: (n: number, p: CloudProvider) => `Getting ${plural(n, "file")} from ${providerName[p]}…`,
  resultPrivacy: (p: CloudProvider) => `Done on this device, straight from ${providerName[p]}. Never uploaded.`,
  /** The result privacy line once a copy went to the cloud: still true (spec D-5). */
  resultPrivacySaved: (p: CloudProvider) => `Done on this device. A copy was sent from this browser to your ${providerName[p]}; we never saw it.`,
  saveFootnote: "Goes from this device to your cloud.",
  waiting: (p: CloudProvider) => `Waiting for ${providerName[p]}…`,
  cancel: "Cancel",
  tryAgain: "Try again",
  blocked: (p: CloudProvider) => `Your browser blocked the ${providerName[p]} window.`,
  blockedBody: "Allow pop-ups for this site.",
  unreachable: (p: CloudProvider) => `Couldn't reach ${providerName[p]}.`,
  unreachableBody: "Files on this device still work.",
  denied: (p: CloudProvider) => `${providerName[p]} access wasn't given.`,
  deniedBody: "We can only open files you allow.",
  exportTooBig: (name: string, p: CloudProvider) => `${name} is too large for ${providerName[p]} to turn into a PDF. Download it there as a PDF and add that file.`,
  notAccessible: (name: string, p: CloudProvider) => `${name} can't be opened from ${providerName[p]}. Check that you can open it there.`,
  cardBytes: (loaded: number, total: number) => (total > 0 ? `${formatBytes(loaded)} of ${formatBytes(total)}` : formatBytes(loaded)),
  cardPercent: (pct: number) => `${pct}%`,
  cardStopped: "Download stopped",
  retry: "Retry",
  stop: (name: string) => `Stop downloading ${name}`,
  remove: (name: string) => `Remove ${name}`,
  downloadingLabel: (name: string) => `Downloading ${name}`,
  liveOpening: (p: CloudProvider) => `Opening ${providerName[p]} in a new window`,
  liveDownloading: (name: string, p: CloudProvider) => `Downloading ${name} from ${providerName[p]}`,
  liveStopped: (name: string) => `Download of ${name} stopped`,
  saveTo: (p: CloudProvider) => `Save to ${providerShort[p]}`,
  saveToAny: "Save to…",
  saveAnother: "Save to another cloud",
  saving: (pct: number) => `Saving… ${pct}%`,
  saved: "Saved",
  savedAlert: (p: CloudProvider, name: string) => `Saved to ${providerName[p]} as ${name}.`,
  openIn: (p: CloudProvider) => `Open in ${providerShort[p]}`,
  saveFailed: (p: CloudProvider) => `Couldn't save to ${providerName[p]}.`,
  saveFailedBody: "Download still works.",
};
