/**
 * F23 cloud sources copy for what a tool page draws before the cloud chunk (our own words; spec U-6):
 * the caret, the row, and "You're offline" (the cloud chunk may not be here then). The menus' words are in menu-copy.ts, and the window, download and save
 * strings in transfer-copy.ts, loaded with that code.
 */
import { buildNames } from "@/lib/cloud/names";

/** The carets' names; the toolbar's lists this build's providers ("Google Drive, Dropbox or OneDrive"). */
export const cloudCopy = {
  /** The empty state's caret: it opens the source menu, so it is not named like a row button ("Choose from Google Drive"). */
  caret: () => "More ways to add files",
  caretToolbar: (replace: boolean) => `${replace ? "Replace" : "Add files"} from ${buildNames()}`,
  rowLabel: "Cloud storage",
  lastUsed: " (last used)",
  offline: "You're offline.",
  /** `name`: a provider's name, or this build's list of them (the caret). */
  offlineBody: (name: string) => `${name} needs a connection. Files on this device still work.`,
};
