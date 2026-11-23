import Link from "next/link";
import { shortcutTools } from "@/tools/registry";
import { siteCopy } from "./copy";
import { HeaderShortcuts } from "./HeaderShortcuts";
import { ToolMenu } from "./ToolMenu";
import { BrandMark } from "./BrandMark";

/** Site header on every page (spec F2 §3c, H-4): logo, All tools menu, usable-tool shortcuts. 56 px at every width. */
export function SiteHeader() {
  const links = shortcutTools(5).map((t) => ({ slug: t.slug, name: t.name }));
  return (
    <header className="ip-site-header sticky top-0 z-20 h-(--ip-header-h) border-b border-border bg-chrome data-[menu-open]:z-50">
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-2 px-4 max-md:justify-between sm:px-6 lg:px-8">
        <Link href="/" aria-label={siteCopy.logoLabel} className="me-2 inline-flex items-center gap-2 rounded-sm text-base font-semibold">
          <BrandMark />
          <span>
            Insta<span className="text-primary-ink">PDF</span>
          </span>
        </Link>
        <ToolMenu />
        <HeaderShortcuts links={links} />
      </div>
    </header>
  );
}
