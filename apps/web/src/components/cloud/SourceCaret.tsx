"use client";
import "./cloud.css";
import { useRef } from "react";
import { providerName, type CloudProvider } from "@/lib/cloud/providers";
import { MenuButton, type MenuButtonHandle, type MenuEntry } from "../ui/Menu";
import { ChevronDownIcon, ShieldIcon } from "../ui/icons";
import { cx } from "../ui/cx";
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

/**
 * The caret half of a split button (spec U-2 E1/E2), filling FilePicker's `sources` slot.
 * Menu-button pattern (U-7); a popover from 640 px, a sheet above the dock below it.
 * The provider window opens inside the item's click handler (user activation).
 */
export function SourceCaret({
  providers,
  label,
  look,
  onOpen,
  disabled,
  className,
}: {
  providers: readonly CloudProvider[];
  label: string;
  look: "primary" | "tool";
  className?: string;
  onOpen: (p: CloudProvider, trigger: HTMLElement | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<MenuButtonHandle>(null);
  return (
    <MenuButton
      ref={ref}
      label={label}
      title={label}
      placement="bottom-end"
      presentation="auto"
      popupClassName="ip-menu-wide"
      disabled={disabled}
      className={cx("mp-btn ip-split__caret", look === "primary" ? "mp-btn--lg" : "mp-btn--tool", className)}
      items={providerItems(providers, (p) => onOpen(p, ref.current?.element ?? null))}
      footnote={cloudFootnote()}
      data-testid={look === "primary" ? "cloud-caret" : "cloud-caret-toolbar"}
    >
      <ChevronDownIcon size={look === "primary" ? 20 : 16} />
    </MenuButton>
  );
}
