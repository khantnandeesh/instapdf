import Link from "next/link";
import { ToolCard } from "../catalogue/ToolCard";
import { buildToolIndex } from "../catalogue/toolIndex";
import { usable } from "../catalogue/types";
import { ToolIntro } from "../tool-flow/ToolIntro";
import { buttonClasses } from "../ui/Button";
import { ArrowLeftIcon, ClockIcon, DeviceIcon, InfoIcon } from "../ui/icons";
import type { Tool } from "@/tools/registry";
import { siteCopy } from "./copy";

const container = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8";

/** Usable tools as cards (coming-soon and 404 pages). Omitted when none are usable. */
export function AvailableNow({ idPrefix }: { idPrefix: string }) {
  const ready = buildToolIndex().items.filter(usable);
  if (!ready.length) return null;
  return (
    <section aria-labelledby={`${idPrefix}-available`} className="mt-10" data-testid="available-now">
      <h2 id={`${idPrefix}-available`} className="text-lg font-semibold">
        {siteCopy.available}
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ready.map((item) => (
          <li key={item.slug}>
            <ToolCard item={item} idPrefix={idPrefix} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `/<slug>` of a planned tool: a status page instead of a 404, never a file picker (AC-48). */
export function ComingSoonPage({ tool }: { tool: Tool }) {
  return (
    <main id="main" tabIndex={-1} className={`${container} pb-12 outline-none`}>
      <Link href="/#tools" className="-ms-1 mt-4 inline-flex h-11 items-center gap-1.5 rounded-sm px-1 text-sm font-medium text-fg-muted hover:text-fg">
        <ArrowLeftIcon size={16} />
        {siteCopy.soonBack}
      </Link>
      <ToolIntro title={tool.name} summary={tool.summary} />
      <section
        aria-labelledby="soon-heading"
        className="flex min-h-[280px] max-w-[760px] flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center shadow-sm sm:min-h-[420px] sm:items-start sm:justify-center sm:p-8 sm:text-start"
        data-testid="coming-soon"
      >
        <span className="grid size-14 place-items-center rounded-full bg-surface-sunken text-fg-muted">
          <ClockIcon size={28} />
        </span>
        <h2 id="soon-heading" className="text-xl font-semibold">
          {siteCopy.soonHeading}
        </h2>
        <p className="text-fg-muted">{siteCopy.soonBody(tool.name)}</p>
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          {tool.runtime === "client" ? <DeviceIcon size={18} className="mt-px shrink-0" /> : <InfoIcon size={18} className="mt-px shrink-0" />}
          {tool.runtime === "client" ? siteCopy.soonClient : siteCopy.soonServer}
        </p>
        <Link href="/#tools" className={buttonClasses("primary", "md", "mt-2")}>
          {siteCopy.soonCta}
        </Link>
      </section>
      <AvailableNow idPrefix="soon" />
    </main>
  );
}

/** Footer placeholder pages until F21 writes them. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[720px] px-4 pt-12 pb-12 outline-none sm:px-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-fg-muted">{siteCopy.placeholderBody}</p>
      <Link href="/#tools" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
        {siteCopy.placeholderBack}
      </Link>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main id="main" tabIndex={-1} className={`${container} pt-12 pb-12 outline-none`}>
      <div className="max-w-[720px]">
        <h1 className="text-2xl font-semibold">{siteCopy.notFoundTitle}</h1>
        <p className="mt-3 text-fg-muted">{siteCopy.notFoundBody}</p>
        <Link href="/#tools" className={buttonClasses("primary", "md", "mt-6")}>
          {siteCopy.soonCta}
        </Link>
      </div>
      <AvailableNow idPrefix="nf" />
    </main>
  );
}
