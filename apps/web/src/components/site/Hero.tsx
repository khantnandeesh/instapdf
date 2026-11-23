import Link from "next/link";
import { featured, isUsable, toolBySlug } from "@/tools/registry";
import { Floaties, Sticker } from "../berry/Berry";
import { buttonClasses } from "../ui/Button";
import { SearchIcon, ShieldIcon } from "../ui/icons";
import { siteCopy } from "./copy";

/**
 * Home hero (spec F2 §3a), BerryPDF Hero: centred on the grid paper, 120px of air above the title
 * (60px on phones), the headline in ink-black (28-44px), one short berry line, one berry button and
 * one small privacy note (owner 2026-11-23: minimal text; the see-all link and seed list are gone,
 * the button already leads to the catalogue). Each piece rises in, staggered (mp-hero).
 * Small pale berries and blossoms float behind the text layer, and two die-cut stickers sit in the
 * margins at >= 1024px (never over text). No photo, no large hero berry.
 *
 * The primary CTA opens the featured tool once it is usable; until then it is a jump to the
 * catalogue that the Catalogue island upgrades to "scroll + focus the search" (data-focus-search, AC-3).
 */
export function Hero() {
  const feature = toolBySlug(featured);
  const live = feature && isUsable(feature) ? feature : null;
  return (
    <div className="relative overflow-x-clip">
      <Floaties set="hero" />
      <div className="mp-hero mx-auto max-w-[1170px] px-[15px] pt-(--space-8) pb-(--space-7) md:pt-(--space-9)">
        <Sticker kind="berry" size={56} className="mp-sticker--tilt-l absolute top-[150px] left-[60px] hidden xl:inline-block" />
        <Sticker kind="leaf" size={40} className="mp-sticker--tilt-r absolute top-[170px] right-[90px] hidden xl:inline-block" />
        <h1 className="text-balance">{siteCopy.heroTitle}</h1>
        {/* BerryPDF Hero subtitle in brand-strong (6.68:1), as the component bundle sets it. */}
        <p className="mp-hero__sub max-w-[780px] text-balance">{siteCopy.heroPitch}</p>
        <div>
          {live ? (
            <Link href={`/${live.slug}`} className={buttonClasses("primary", "md", "max-sm:w-full")} data-testid="hero-cta">
              {live.flow?.actionLabel ?? live.name}
            </Link>
          ) : (
            <a href="#tools" data-focus-search="" className={buttonClasses("primary", "md", "max-sm:w-full")} data-testid="hero-cta">
              <SearchIcon size={22} />
              {siteCopy.heroCta}
            </a>
          )}
        </div>
        <p className="mp-hero__note mt-5 inline-flex items-center gap-1.5 text-sm text-muted">
          <ShieldIcon size={16} className="shrink-0 text-brand-strong" />
          {siteCopy.trustUpload}
        </p>
      </div>
    </div>
  );
}
