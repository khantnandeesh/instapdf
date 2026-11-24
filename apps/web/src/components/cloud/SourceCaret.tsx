"use client";
import "./cloud.css";
import { useRef } from "react";
import type { CloudProvider } from "@/lib/cloud/providers";
import { MenuButton, type MenuButtonHandle } from "../ui/Menu";
import { ChevronDownIcon } from "../ui/icons";
import { cx } from "../ui/cx";
import { cloudCopy } from "./copy";
import { cloudFootnote, providerItems } from "./items";

export type SourceCaretProps = {
  providers: readonly CloudProvider[];
  look: "primary" | "tool";
  /** Toolbar of a single-file tool: the clouds replace the file. */
  replace?: boolean;
  className?: string;
  onOpen: (p: CloudProvider, trigger: HTMLElement | null) => void;
  disabled?: boolean;
};

/**
 * The caret half of a split button (spec U-2 E1/E2), filling FilePicker's `sources` slot.
 * Menu-button pattern (U-7); a popover from 640 px, a sheet above the dock below it.
 * The provider window opens inside the item's click handler (user activation).
 */
export function SourceCaret({ providers, look, replace, onOpen, disabled, className }: SourceCaretProps) {
  const ref = useRef<MenuButtonHandle>(null);
  const label = look === "primary" ? cloudCopy.caret(providers) : cloudCopy.caretToolbar(providers, !!replace);
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
