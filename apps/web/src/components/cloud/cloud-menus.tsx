"use client";
/**
 * F23 menus for tools with their own Add menus (Merge, spec U-2 E3/E4; merge-menus.tsx).
 */
import type { CloudProvider } from "@/lib/cloud/providers";
import type { MenuEntry } from "./CloudMenu";
import { DeviceIcon } from "./cloud-icons";
import { cloudCopy } from "./copy";
import { providerItems } from "./items";

type Act = () => void;

/** ≥ 640 px "Add pages": group "From a file" (This device + providers), separator, Blank page. */
export function addPagesEntries(providers: readonly CloudProvider[], own: { fromFile: { label: string; onSelect: Act }; blank: { label: string; onSelect: Act } }, pages: (p: CloudProvider) => void): MenuEntry[] {
  return [
    { group: cloudCopy.groupFromFile, items: [{ id: "from-file", label: cloudCopy.thisDevice, icon: <DeviceIcon size={20} />, onSelect: own.fromFile.onSelect }, ...providerItems(providers, pages, "pages")] },
    { separator: true },
    { id: "blank", label: own.blank.label, onSelect: own.blank.onSelect },
  ];
}

/** < 640 px one "+ Add" sheet: Files (This device + providers), Pages ("Pages from a file ›" in place, Blank page). */
export function phoneAddEntries(
  providers: readonly CloudProvider[],
  own: { files: { label: string; onSelect: Act }; fromFile: { label: string; onSelect: Act }; blank: { label: string; onSelect: Act } },
  files: (p: CloudProvider) => void,
  pages: (p: CloudProvider) => void,
): MenuEntry[] {
  return [
    { group: cloudCopy.groupFiles, items: [{ id: "files", label: cloudCopy.thisDevice, icon: <DeviceIcon size={20} />, onSelect: own.files.onSelect }, ...providerItems(providers, files, "files")] },
    {
      group: cloudCopy.groupPages,
      items: [
        {
          id: "from-file",
          label: cloudCopy.pagesFromFile,
          onSelect: () => {},
          submenu: [{ id: "pages-device", label: cloudCopy.thisDevice, icon: <DeviceIcon size={20} />, onSelect: own.fromFile.onSelect }, ...providerItems(providers, pages, "pages")],
        },
        { id: "blank", label: own.blank.label, onSelect: own.blank.onSelect },
      ],
    },
  ];
}
