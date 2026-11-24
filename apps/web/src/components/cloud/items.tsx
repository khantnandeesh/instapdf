/**
 * Provider menu items and the menu footnote (F23). No CSS import here: Merge's static menus use
 * these, and the bundler can drop them from builds without NEXT_PUBLIC_CLOUD_SOURCES.
 */
import { providerName, type CloudProvider } from "@/lib/cloud/providers";
import type { MenuEntry } from "./CloudMenu";
import { ShieldIcon } from "../ui/icons";
import { cloudCopy } from "./copy";
import { OutIcon, ProviderMark } from "./ProviderMark";

/** Menu items for the configured providers (fixed order), each opening its window. */
export function providerItems(providers: readonly CloudProvider[], choose: (p: CloudProvider) => void, idPrefix = "cloud"): MenuEntry[] {
  return providers.map((p) => ({
    id: `${idPrefix}-${p}`,
    label: providerName[p],
    icon: <ProviderMark provider={p} size={20} />,
    trailing: <OutIcon />,
    srHint: cloudCopy.opensWindow,
    onSelect: () => choose(p),
  }));
}

export const cloudFootnote = (text: string = cloudCopy.footnote) => (
  <>
    <ShieldIcon size={14} />
    {text}
  </>
);
