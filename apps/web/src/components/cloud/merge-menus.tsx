"use client";
/**
 * F23: Merge's Add menus with the cloud sources (spec U-2 E3/E4). In cloud builds Merge loads its
 * menu button from ui.ts, which is this one (MergeTool.tsx loadMenu). It regroups Merge's own Add
 * items (by id: "files", "from-file", "blank") with the providers; any other menu (Sort), and every
 * menu when no provider is configured (AC-120), it shows unchanged.
 */
import type { ComponentProps } from "react";
import { configuredProviders, type CloudProvider } from "@/lib/cloud/providers";
import type { MenuEntry, MenuItem } from "./CloudMenu";
import { MenuButton } from "./CloudMenu";
import { addPagesEntries, phoneAddEntries } from "./cloud-menus";
import { openCloud } from "./intake-engine";
import { cloudFootnote } from "./items";

const providers = configuredProviders();

export type CloudAddMenuProps = ComponentProps<typeof MenuButton>;

/** ui/Menu's entries (what the tools pass) as this menu's: a `{ heading }` titles the items after it, up to the next separator or heading. */
type PlainEntry = MenuEntry | { heading: string };
function fromPlain(plain: PlainEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  let group: { group: string; items: MenuEntry[] } | null = null;
  for (const e of plain) {
    if ("heading" in e) out.push((group = { group: e.heading, items: [] }));
    else if ("separator" in e || !group) {
      group = null;
      out.push(e);
    } else group.items.push(e);
  }
  return out;
}

/** With a "files" item it is the phone "+ Add" menu (files from a provider too); otherwise "Add pages". */
export function CloudAddMenu({ items: plain, ...rest }: CloudAddMenuProps) {
  const items = fromPlain(plain as PlainEntry[]);
  const own = (id: string) => items.find((e): e is MenuItem => "id" in e && e.id === id);
  if (!providers.length || !own("from-file")) return <MenuButton {...rest} items={items} />;
  const files = own("files");
  // The window's "back" focus target: this menu's button.
  const trigger = () => document.querySelector<HTMLElement>(`[data-testid="${rest["data-testid"]}"]`);
  // One file, then Merge's page picker (at the end), as for a local "Pages from a file".
  const pages = (p: CloudProvider) => openCloud(p, trigger(), { tag: { picker: true }, multiple: false });
  const entries: MenuEntry[] = files
    ? phoneAddEntries(providers, { files, fromFile: own("from-file")!, blank: own("blank")! }, (p) => openCloud(p, trigger()), pages)
    : addPagesEntries(providers, { fromFile: own("from-file")!, blank: own("blank")! }, pages);
  // Entries a tool adds of its own (Organize's "From a loaded file" group) follow ours.
  entries.push(...items.filter((e) => !("id" in e) || !["files", "from-file", "blank"].includes(e.id)));
  return <MenuButton {...rest} items={entries} footnote={cloudFootnote()} {...(files ? { presentation: "auto" as const } : { popupClassName: "ip-menu-wide" })} />;
}
