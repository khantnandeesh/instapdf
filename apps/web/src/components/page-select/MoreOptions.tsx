"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { SlidersIcon } from "../ui/icons";
import { selectCopy } from "./copy";
import type { MoreOptionsContent } from "./MoreOptionsDialog";

// The dialog and the parts list are not in the first load (spec F4/F5 UI P-12): a lazy chunk,
// fetched when the trigger is hovered or focused.
const loadDialog = () => import("./MoreOptionsDialog");
const MoreOptionsDialog = dynamic(
  () => loadDialog().then((m) => m.MoreOptionsDialog),
  { ssr: false },
);
const prefetch = () => void loadDialog().catch(() => {});

/**
 * The More options trigger and its dialog (spec F4/F5 UI P-4, P-5). The trigger reads
 * "More options"; a count bubble on its corner says how many options changed (the words are in its
 * accessible name); in the row below 1280 px (F25 §3.4) and in the bar it is a
 * 44px icon button with a tooltip, and on phones a bare 44px icon beside the primary.
 */
export function MoreOptions({
  changed,
  disabled,
  content,
}: {
  changed: number;
  disabled?: boolean;
  content: MoreOptionsContent;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = changed
    ? `${selectCopy.more}, ${selectCopy.moreChanged(changed)}`
    : selectCopy.more;
  return (
    // `relative`: from 1024 px the popover hangs under the button, right-aligned to it (F25 §3.3).
    <span className="relative inline-flex">
      <Button
        ref={trigger}
        variant="soft"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={name}
        disabled={disabled}
        data-testid="more-options"
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onClick={() => setOpen((o) => !o)}
        className="ip-more-trigger group/more relative h-11 dock-bar:max-xl:size-11 dock-bar:max-xl:px-0 max-sm:size-11! max-sm:px-0"
        iconStart={<SlidersIcon size={18} />}
      >
        <span aria-hidden="true" className="dock-bar:max-xl:hidden">
          {selectCopy.more}
        </span>
        {/* One count bubble on the corner at every width: it never changes the button's width, so the row
            and the popover under it stay still when an option is toggled (no layout shift). */}
        {changed > 0 && (
          <span
            aria-hidden="true"
            data-testid="more-options-count"
            className="mp-tick-in pointer-events-none absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 font-ui text-[11px] leading-none font-semibold text-white tabular-nums ring-2 ring-white"
          >
            {changed}
          </span>
        )}
        <span
          aria-hidden="true"
          className="ip-tooltip pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 font-ui text-help whitespace-nowrap text-on-inverse dock-bar:max-xl:group-hover/more:block dock-bar:max-xl:group-focus-visible/more:block [@media(hover:none)]:!hidden"
        >
          {selectCopy.more}
        </span>
      </Button>
      <MoreOptionsDialog
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={trigger}
        content={content}
      />
    </span>
  );
}
