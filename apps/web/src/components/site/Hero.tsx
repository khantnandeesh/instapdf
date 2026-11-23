import Link from "next/link";
import { featured, isUsable, toolBySlug, tools } from "@/tools/registry";
import { buttonClasses } from "../ui/Button";
import { CheckIcon, ChevronDownIcon, LockIcon, SearchIcon } from "../ui/icons";
import { siteCopy } from "./copy";

/**
 * Home hero (spec F2 §3a), Mint Paper Hero: centered, 120px of air above the title (60px on
 * phones), the title in ink, a mint subtitle one step smaller, one primary button, then a small
 * muted link to the catalogue. Faint dotted circles sit in the far corners. No hero image.
 *
 * The primary CTA opens the featured tool once it is usable; until then it is a jump to the
 * catalogue that the Catalogue island upgrades to "scroll + focus the search" (data-focus-search, AC-3).
 */
export function Hero() {
  const feature = toolBySlug(featured);
  const live = feature && isUsable(feature) ? feature : null;
  return (
    <div className="relative overflow-x-clip">
      <span aria-hidden="true" className="mp-dots ip-float -top-10 -left-24 hidden opacity-70 lg:block" />
      <span aria-hidden="true" className="mp-dots ip-float -right-24 bottom-0 hidden opacity-70 [animation-delay:-2s] lg:block" />
      <div className="relative mx-auto max-w-[1170px] px-[15px] pt-(--space-8) pb-(--space-7) text-center md:pt-(--space-9)">
        <h1 className="text-hero text-balance text-ink">{siteCopy.heroTitle}</h1>
        {/* Mint subtitle. Deviation: brand-strong (4.95:1), not brand-bright (2.08:1, fails 3:1 at 26px). */}
        <p className="mx-auto mt-2.5 max-w-[780px] text-subtitle text-balance text-brand-strong">{siteCopy.heroPitch}</p>
        <div className="mt-6">
          {live ? (
            <Link href={`/${live.slug}`} className={buttonClasses("primary", "md", "max-sm:w-full")} data-testid="hero-cta">
              {live.flow?.actionLabel ?? live.name}
            </Link>
          ) : (
            <a href="#tools" data-focus-search="" className={buttonClasses("primary", "md", "max-sm:w-full")} data-testid="hero-cta">
              <SearchIcon size={20} />
              {siteCopy.heroCta}
            </a>
          )}
        </div>
        <p className="mt-3.5 text-sm text-muted">
          <a href="#tools" className="inline-flex min-h-6 items-center gap-1 underline-offset-4 hover:text-ink hover:underline" data-testid="hero-see-all">
            {siteCopy.heroSeeAll(tools.length)}
            <ChevronDownIcon size={16} />
          </a>
        </p>
        <ul className="mt-5 flex flex-col items-center justify-center gap-2 text-sm text-muted sm:flex-row sm:gap-6">
          <li className="flex items-center gap-2">
            <LockIcon size={16} className="text-brand-strong" />
            {siteCopy.trustUpload}
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} className="text-brand-strong" />
            {siteCopy.trustAccount}
          </li>
        </ul>
      </div>
    </div>
  );
}
