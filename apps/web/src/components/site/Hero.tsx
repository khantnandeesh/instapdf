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
    <div className="pt-8 sm:pt-10 lg:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">{siteCopy.heroTitle}</h1>
      <p className="mt-3 max-w-[640px] text-base text-fg-muted sm:text-lg">{siteCopy.heroPitch}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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
        <a href="#tools" className="inline-flex h-11 items-center justify-center gap-1 rounded-md px-2 font-medium text-primary hover:underline" data-testid="hero-see-all">
          {siteCopy.heroSeeAll(tools.length)}
          <ChevronDownIcon size={18} />
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
