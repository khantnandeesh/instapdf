/** F23 cloud sources copy for the tool page itself (our own words; spec U-6). The window, download and save strings are in transfer-copy.ts, loaded with that code. */
import { providerList, providerName, type CloudProvider } from "@/lib/cloud/providers";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export const cloudCopy = {
  caret: (list: readonly CloudProvider[]) => `Choose from ${providerList(list)}`,
  caretToolbar: (list: readonly CloudProvider[], replace: boolean) => `${replace ? "Replace" : "Add files"} from ${providerList(list)}`,
  rowLabel: "Cloud storage",
  lastUsed: " (last used)",
  lastUsedTitle: "Last used",
  opensWindow: ", opens a new window",
  thisDevice: "This device",
  pagesFromFile: "Pages from a file",
  groupFromFile: "From a file",
  groupFiles: "Files",
  groupPages: "Pages",
  footnote: "Files come straight to this device.",
  offline: "You're offline.",
  offlineBody: (p: CloudProvider) => `${providerName[p]} needs a connection. Files on this device still work.`,
  status: (n: number, p: CloudProvider) => `Getting ${plural(n, "file")} from ${providerName[p]}…`,
  resultPrivacy: (p: CloudProvider) => `Done on this device, straight from ${providerName[p]}. Never uploaded.`,
  /** The result privacy line once a copy went to the cloud: still true (spec D-5). */
  resultPrivacySaved: (p: CloudProvider) => `Done on this device. A copy was sent from this browser to your ${providerName[p]}; we never saw it.`,
};
