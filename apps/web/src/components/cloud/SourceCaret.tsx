"use client";
import { useRef } from "react";
import { configuredProviders } from "@/lib/cloud/providers";
import { MenuButton, type MenuButtonHandle } from "./CloudMenu";
import { ChevronDownIcon } from "../ui/icons";
import { cx } from "../ui/cx";
import { cloudCopy } from "./copy";
import { openCloud } from "./intake-engine";
import { cloudFootnote, providerItems } from "./items";

const providers = configuredProviders();

export type SourceCaretProps = {
  look: "primary" | "tool";
  /** Toolbar of a single-file tool: the clouds replace the file. */
  replace?: boolean;
  className?: string;
  disabled?: boolean;
};

/**
 * The caret half of a split button (spec U-2 E1/E2), filling FilePicker's `sources` slot.
 * Menu-button pattern (U-7); a popover from 640 px, a sheet above the dock below it.
 * The provider window opens inside the item's click handler (user activation).
 */
export function SourceCaret({ look, replace, disabled, className }: SourceCaretProps) {
  const ref = useRef<MenuButtonHandle>(null);
  if (!providers.length) return null;
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
      items={providerItems(providers, (p) => openCloud(p, ref.current?.element ?? null, { replace }))}
      footnote={cloudFootnote()}
      data-testid={look === "primary" ? "cloud-caret" : "cloud-caret-toolbar"}
    >
      <ChevronDownIcon size={look === "primary" ? 20 : 16} />
    </MenuButton>
  );
}
