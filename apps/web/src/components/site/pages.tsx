import Link from "next/link";
import { ToolCard } from "../catalogue/ToolCard";
import { buildToolIndex } from "../catalogue/toolIndex";
import { usable } from "../catalogue/types";
import { ToolIntro } from "../tool-flow/ToolIntro";
import { buttonClasses } from "../ui/Button";
import { Floaties, VineDivider } from "../berry/Berry";
import { ArrowLeftIcon, DeviceIcon, InfoIcon } from "../ui/icons";
import type { Tool } from "@/tools/registry";
import { siteCopy } from "./copy";

const container = "mx-auto w-full max-w-[1170px] px-[15px]";

/**
 * Usable tools as BerryPDF tool cards (coming-soon and 404 pages), on the grid paper, set off from
 * the empty state above by the vine divider (the page's one divider style). Omitted when none are usable.
 */
export function AvailableNow({ idPrefix }: { idPrefix: string }) {
  const ready = buildToolIndex().items.filter(usable);
  if (!ready.length) return null;
  return (
    <section aria-labelledby={`${idPrefix}-available`} className="pt-(--space-7) pb-(--space-8)" data-testid="available-now">
      <VineDivider className="mb-(--space-7)" />
      <div className={container}>
        <h2 id={`${idPrefix}-available`} className="text-center text-section-title text-ink">
          {siteCopy.available}
        </h2>
        <ul className="mx-auto mt-6 grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-5 lg:w-[957px] lg:grid-cols-[repeat(3,300px)] lg:gap-x-[28.5px]">
          {ready.map((item) => (
            <li key={item.slug}>
              <ToolCard item={item} idPrefix={idPrefix} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * `/<slug>` of a planned tool: a status page instead of a 404, never a file picker (AC-48).
 * BerryPDF Tool page head (centred page title + muted subtitle), then the EmptyState: the words and
 * the single berry button in the middle of the grid paper, small pale berries and blossoms
 * floating around them, and a jam label naming the status.
 */
export function ComingSoonPage({ tool }: { tool: Tool }) {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className={container}>
        <Link href="/#tools" className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-sm text-muted hover:text-brand-strong hover:underline">
          <ArrowLeftIcon size={16} />
          {siteCopy.soonBack}
        </Link>
        <ToolIntro title={tool.name} summary={tool.summary} />
      </div>
      <section aria-labelledby="soon-heading" className="mp-empty" data-testid="coming-soon">
        <Floaties set="empty" />
        <div className={`mp-empty__in ${container} flex flex-col items-center gap-3 text-center`}>
          <h2 id="soon-heading">
            <span className="mp-jamtag text-[15px]">{siteCopy.soonHeading}</span>
          </h2>
          <p className="max-w-[640px] text-[20px] leading-[1.4] text-ink-black">{siteCopy.soonBody(tool.name)}</p>
          <p className="flex max-w-[640px] items-start gap-2 text-sm text-muted">
            {tool.runtime === "client" ? <DeviceIcon size={18} className="mt-px shrink-0" /> : <InfoIcon size={18} className="mt-px shrink-0" />}
            {tool.runtime === "client" ? siteCopy.soonClient : siteCopy.soonServer}
          </p>
          <Link href="/#tools" className={buttonClasses("primary", "lg", "mt-3")}>
            {siteCopy.soonCta}
          </Link>
        </div>
      </section>
      <AvailableNow idPrefix="soon" />
    </main>
  );
}

/** Footer placeholder pages until F21 writes them: BerryPDF Prose column (no decoration). */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main id="main" tabIndex={-1} className="px-[15px] pt-(--space-8) pb-(--space-8) outline-none">
      <article className="mp-prose mx-auto">
        <h1>{title}</h1>
        <p>{siteCopy.placeholderBody}</p>
        <p>
          <Link href="/#tools" className="inline-flex min-h-6 items-center">
            {siteCopy.placeholderBack}
          </Link>
        </p>
      </article>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      {/* BerryPDF EmptyState: nothing to show here, so the words and one button float among berries. */}
      <div className="mp-empty">
        <Floaties set="empty" />
        <div className={`mp-empty__in ${container} pt-(--space-8)`}>
          <h1 className="text-page-title text-ink-black">{siteCopy.notFoundTitle}</h1>
          <p className="mt-2.5 text-subtitle text-muted">{siteCopy.notFoundBody}</p>
          <Link href="/#tools" className={buttonClasses("primary", "md", "mt-6")}>
            {siteCopy.soonCta}
          </Link>
        </div>
      </div>
      <AvailableNow idPrefix="nf" />
    </main>
  );
}
