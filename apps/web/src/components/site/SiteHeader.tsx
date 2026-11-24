import Link from "next/link";
import { shortcutTools } from "@/tools/registry";
import { Wordmark } from "./BrandMark";
import { siteCopy } from "./copy";
import { HeaderShortcuts } from "./HeaderShortcuts";
import { ToolMenu } from "./ToolMenu";

/**
 * Site header on every page (spec F2 §3c, H-4), BerryPDF Header: a floating glass pill (owner 2026-11-24)
 * (pages.md). Logo (the berry mark + "BerryPDF" in Fredoka 600), the "All tools" pill chip
 * (cream with a sand outline), then up to 5 plain shortcuts (3 below 1024 px, none below 768 px).
 * Sticky, so the menu opens without scrolling back up (F2 AC-32/AC-38).
 */
export function SiteHeader() {
  const links = shortcutTools(5).map((t) => ({ slug: t.slug, name: t.name }));
  return (
    <header className="ip-site-header mp-header sticky top-0 z-(--ip-z-header) h-(--ip-header-h) data-[menu-open]:z-(--ip-z-header-open)">
      <div className="mx-auto flex h-full max-w-[1170px] items-center gap-1 px-[15px]">
        <Link href="/" aria-label={siteCopy.logoLabel} className="me-6 inline-flex items-center rounded-sm max-sm:me-2">
          <Wordmark />
        </Link>
        <ToolMenu />
        <HeaderShortcuts links={links} />
      </div>
    </header>
  );
}
