"use client";
import { CloseIcon, LeafIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { alternateCopy as a } from "./copy";

/**
 * "All fronts, then all backs in one file? Open in Organize": one compact line (two at most on a phone),
 * the question then an inline link-style button (visual gate round 2: the boxed button made it about
 * 135px tall at 320). It shows only once a file is in, so it loads apart from the route (first-load budget).
 */
export function OneFileHint({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  return (
    <div className="mp-callout mt-1 mb-3 items-center px-3 py-2 text-sm" role="status" data-testid="one-file-hint">
      <LeafIcon size={20} className="ip-hint-leaf" />
      <p className="min-w-0 flex-1">
        {a.oneFile}{" "}
        <button type="button" className="font-semibold whitespace-nowrap text-brand-strong underline underline-offset-2 hover:text-brand" onClick={onOpen}>
          {a.openOrganize}
        </button>
      </p>
      <IconButton label={`Dismiss: ${a.oneFile}`} size="sm" icon={<CloseIcon size={16} />} tooltip={false} className="-my-1 -me-1.5 shrink-0" onClick={onClose} />
    </div>
  );
}
