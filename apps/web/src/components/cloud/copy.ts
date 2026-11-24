/** F23 cloud sources copy for the tool page itself (our own words; spec U-6). The window, download and save strings are in transfer-copy.ts, loaded with that code. */
import { providerList, providerName, type CloudProvider } from "@/lib/cloud/providers";

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
};
