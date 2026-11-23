import Link from "next/link";
import { shortcutTools } from "@/tools/registry";
import { Wordmark } from "./BrandMark";
import { siteCopy } from "./copy";
import { HeaderShortcuts } from "./HeaderShortcuts";
import { ToolMenu } from "./ToolMenu";

/**
 * Site header on every page (spec F2 §3c, H-4), Mint Paper Header: quiet and borderless (no
 * border, no shadow), 15px top padding. Logo (30px mark + name in mint), the "All tools" chip,
 * then up to 5 plain shortcuts (3 below 1024 px, none below 768 px).
 * Deviation: Mint Paper's header is not sticky and has no background. F2 needs the menu reachable
 * without scrolling back up (AC-32, AC-38), so it stays sticky, on a plain white ground.
 */
export function SiteHeader() {
  const links = shortcutTools(5).map((t) => ({ slug: t.slug, name: t.name }));
  return (
    <header className="ip-site-header sticky top-0 z-(--ip-z-header) h-(--ip-header-h) bg-surface-raised data-[menu-open]:z-(--ip-z-header-open)">
      <div className="mx-auto flex min-h-[41px] max-w-[1170px] items-center gap-1 px-[15px] pt-[15px] pb-px">
        <Link href="/" aria-label={siteCopy.logoLabel} className="group me-[35px] inline-flex items-center rounded-sm max-sm:me-3">
          <Wordmark />
        </Link>
        <ToolMenu />
        <HeaderShortcuts links={links} />
      </div>
    </header>
  );
}
