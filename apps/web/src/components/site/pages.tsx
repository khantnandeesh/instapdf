import "@/components/berry/floaties-empty.css";
import Link from "next/link";
import { ToolCard } from "../catalogue/ToolCard";
import { buildToolIndex } from "../catalogue/toolIndex";
import { usable } from "../catalogue/types";
import { ToolIntro } from "../tool-flow/ToolIntro";
import { buttonClasses } from "../ui/Button";
import { Floaties } from "../berry/Berry";
import type { Tool } from "@/tools/registry";
import { siteCopy } from "./copy";

const container = "mx-auto w-full max-w-[1170px] px-[15px]";

/**
 * Usable tools as BerryPDF tool cards (coming-soon and 404 pages), on the grid paper, set off from
 * the empty state above by spacing only. Omitted when none are usable.
 */
export function AvailableNow({ idPrefix }: { idPrefix: string }) {
  const ready = buildToolIndex().items.filter(usable);
  if (!ready.length) return null;
  return (
    <section aria-labelledby={`${idPrefix}-available`} className="pt-(--space-6)" data-testid="available-now">
      <div className={container}>
        <h2 id={`${idPrefix}-available`} className="text-center text-section-title text-ink">
          {siteCopy.available}
        </h2>
        <ul className="mp-rise mt-6 flex flex-wrap justify-center gap-3 lg:gap-4">
          {ready.map((item) => (
            <li key={item.slug} className="w-[calc(50%-6px)] sm:w-[224px]">
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
 * Minimal (owner 2026-11-23): the tool's name, the jam "Coming soon" label and one button back
 * to the catalogue, among floating berries; then the tools ready now.
 */
export function ComingSoonPage({ tool }: { tool: Tool }) {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className={container}>
        <ToolIntro title={tool.name} />
      </div>
      <section aria-labelledby="soon-heading" className="mp-empty" data-testid="coming-soon">
        <Floaties set="empty" />
        <div className={`mp-empty__in mp-enter ${container} flex flex-col items-center gap-4 text-center`}>
          <h2 id="soon-heading">
            <span className="mp-jamtag text-[15px]">{siteCopy.soonHeading}</span>
          </h2>
          <Link href="/#tools" className={buttonClasses("primary", "lg")}>
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
        <div className={`mp-empty__in mp-enter ${container} pt-(--space-8)`}>
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
