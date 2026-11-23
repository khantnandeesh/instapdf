import Link from "next/link";
import { featured, isUsable, toolBySlug, tools } from "@/tools/registry";
import { Floaties, Sticker } from "../berry/Berry";
import { buttonClasses } from "../ui/Button";
import { ChevronDownIcon, SearchIcon } from "../ui/icons";
import { siteCopy } from "./copy";

/**
 * Home hero (spec F2 §3a), BerryPDF Hero: centred on the grid paper, 120px of air above the title
 * (60px on phones), the headline in ink-black (28-44px), a berry subtitle one step smaller, one
 * berry button, then a small muted link to the catalogue and the reassurance lines as a seed list.
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
        <p className="mt-[18px] text-sm text-muted">
          <a href="#tools" className="inline-flex min-h-6 items-center gap-1 underline-offset-4 hover:text-brand-strong hover:underline" data-testid="hero-see-all">
            {siteCopy.heroSeeAll(tools.length)}
            <ChevronDownIcon size={16} />
          </a>
        </p>
        <ul className="mp-seedlist mt-5 flex flex-col items-center justify-center gap-x-8 text-[15px] text-ink sm:flex-row">
          <li>{siteCopy.trustUpload}</li>
          <li>{siteCopy.trustAccount}</li>
        </ul>
      </div>
    </div>
  );
}
