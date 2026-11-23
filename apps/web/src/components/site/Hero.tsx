import Link from "next/link";
import { featured, isUsable, toolBySlug, tools } from "@/tools/registry";
import { buttonClasses } from "../ui/Button";
import { CheckIcon, ChevronDownIcon, LockIcon, SearchIcon } from "../ui/icons";
import { siteCopy } from "./copy";

/**
 * Home hero (spec F2 §3a). The primary CTA opens the featured tool once it is
 * usable; until then it is a jump to the catalogue that the Catalogue island
 * upgrades to "scroll + focus the search" (data-focus-search, AC-3).
 */
export function Hero() {
  const feature = toolBySlug(featured);
  const live = feature && isUsable(feature) ? feature : null;
  return (
    <div className="pt-10 sm:pt-14 lg:pt-16">
      <h1 className="text-3xl font-semibold text-balance sm:text-4xl lg:text-[3.25rem] lg:leading-[1.08] lg:tracking-[-0.025em]">{siteCopy.heroTitle}</h1>
      <p className="mt-4 max-w-[600px] text-base text-fg-muted sm:text-lg">{siteCopy.heroPitch}</p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {live ? (
          <Link href={`/${live.slug}`} className={buttonClasses("primary", "lg", "max-sm:w-full")} data-testid="hero-cta">
            {live.flow?.actionLabel ?? live.name}
          </Link>
        ) : (
          <a href="#tools" data-focus-search="" className={buttonClasses("primary", "lg", "max-sm:w-full")} data-testid="hero-cta">
            <SearchIcon size={20} />
            {siteCopy.heroCta}
          </a>
        )}
        <a href="#tools" className={buttonClasses("secondary", "lg", "max-sm:w-full")} data-testid="hero-see-all">
          {siteCopy.heroSeeAll(tools.length)}
          <ChevronDownIcon size={18} className="text-fg-muted" />
        </a>
      </div>
      <ul className="mt-6 flex flex-col gap-2 text-sm text-fg-muted sm:flex-row sm:gap-6">
        <li className="flex items-center gap-2">
          <LockIcon size={16} className="text-success" />
          {siteCopy.trustUpload}
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon size={16} className="text-success" />
          {siteCopy.trustAccount}
        </li>
      </ul>
    </div>
  );
}
