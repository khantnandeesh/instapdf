"use client";
import { useRouter } from "next/navigation";
import type { LoadedFile } from "@/components/tool-flow/types";
import { CloseIcon, LeafIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { setHandoff } from "@/lib/pdf/handoff";
import { cardCopy as a } from "./copy-card";

/**
 * "All fronts, then all backs in one file? Open in Organize": one compact line (two at most on a phone),
 * the question then an inline link-style button (visual gate round 2: the boxed button made it about
 * 135px tall at 320). It shows only once a file is in, so it loads apart from the route (first-load budget),
 * and so does the hand-off of the file to Organize.
 */
export function OneFileHint({ file, onClose }: { file: LoadedFile | undefined; onClose: () => void }) {
  const router = useRouter();
  const onOpen = () => {
    if (!file) return;
    setHandoff("organize-pdf", [file.source instanceof File ? file.source : new File([file.source], file.name, { type: file.source.type })]);
    router.push("/organize-pdf");
  };
  return (
    <div className="mp-callout mt-1 mb-3 items-center px-3 py-2 text-sm" role="status" data-testid="one-file-hint">
      <LeafIcon size={20} className="ip-hint-leaf" />
      <p className="min-w-0 flex-1">
        {a.oneFile}{" "}
        <LinkButton kind="inline" className="whitespace-nowrap" onClick={onOpen}>
          {a.openOrganize}
        </LinkButton>
      </p>
      <IconButton label={`Dismiss: ${a.oneFile}`} size="sm" icon={<CloseIcon size={16} />} tooltip={false} className="-my-1 -me-1.5 shrink-0" onClick={onClose} />
    </div>
  );
}
