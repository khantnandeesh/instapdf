"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { setHandoff } from "@/lib/pdf/handoff";
import { formatBytes } from "@/lib/pdf/naming";
import { isUsable, toolBySlug } from "@/tools/registry";
import { useCtl } from "./context";
import { CloseBold } from "./icons";
import { useStore } from "./store";

/** Keep going after a download (F25 §7): the downloaded bytes go to the next tool. */
const KEEP_GOING = ["compress-pdf", "sign-pdf", "merge-pdf"] as const;

/**
 * The small card under Download after a download (F25 §7, AC-650): name and size, the privacy line, the
 * notes that apply and Keep going chips. It never takes focus; × or Escape closes it, and the next edit.
 */
export function DownloadCard() {
  const ctl = useCtl();
  const router = useRouter();
  const d = useStore(ctl.store, (s) => s.downloaded);
  useEffect(() => {
    if (!d) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.("dialog[open], [role=menu], [data-popover]")) return;
      ctl.store.set({ downloaded: null });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [d, ctl]);
  if (!d) return null;
  return (
    <div role="region" aria-label="Download" className="ed-dlcard" data-testid="download-card">
      <button type="button" className="ed-dlcard__close" aria-label="Close" onClick={() => ctl.store.set({ downloaded: null })}>
        <CloseBold size={14} />
      </button>
      <p className="ed-dlcard__name">
        {d.name}, {formatBytes(d.size)}
      </p>
      <p className="ed-dlcard__muted">Done on this device.</p>
      {d.noPassword && <p className="ed-dlcard__muted">The downloaded copy has no password.</p>}
      {d.empty > 0 && <p className="ed-dlcard__muted">{`${d.empty} required ${d.empty === 1 ? "field is" : "fields are"} empty.`}</p>}
      <div className="ed-dlcard__chips">
        {KEEP_GOING.map((slug) => {
          const t = toolBySlug(slug);
          if (!t) return null;
          return (
            <Button
              key={slug}
              variant="soft"
              size="sm"
              onClick={() => {
                if (isUsable(t)) setHandoff(slug, [new File([d.blob], d.name, { type: "application/pdf" })]);
                ctl.store.set({ downloaded: null });
                router.push(`/${slug}`);
              }}
            >
              {t.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

