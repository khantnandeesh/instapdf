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
 * "More options" with a "{n} changed" chip; in the bar below 1440 px and below 1024 px it is a 44px
 * icon button with a tooltip, and on phones a bare 44px icon beside the primary.
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
        className="ip-more-trigger group/more relative h-11 dock-bar:max-[1439px]:size-11 dock-bar:max-[1439px]:px-0 max-sm:size-11! max-sm:px-0"
        iconStart={<SlidersIcon size={18} />}
      >
        <span aria-hidden="true" className="dock-bar:max-[1439px]:hidden">
          {selectCopy.more}
        </span>
        {changed > 0 && (
          <>
            <span
              aria-hidden="true"
              className="mp-tag mp-tag--sm dock-bar:max-[1439px]:hidden"
            >
              {selectCopy.moreChanged(changed)}
            </span>
            {/* Icon-only: a small berry dot says something is changed. */}
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 hidden size-2 rounded-full bg-brand ring-2 ring-white dock-bar:max-[1439px]:block"
            />
          </>
        )}
        <span
          aria-hidden="true"
          className="ip-tooltip pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 font-ui text-help whitespace-nowrap text-on-inverse dock-bar:max-[1439px]:group-hover/more:block dock-bar:max-[1439px]:group-focus-visible/more:block [@media(hover:none)]:!hidden"
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
