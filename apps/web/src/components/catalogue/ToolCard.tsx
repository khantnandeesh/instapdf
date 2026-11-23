import Link from "next/link";
import type { ReactNode } from "react";
import { splitAt, type Range } from "@/lib/catalogue/search";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { RuntimeMarker } from "../ui/RuntimeMarker";
import { catalogueCopy as copy } from "./copy";
import { usable, type ToolIndexItem } from "./types";

/** Wraps the matched range in <mark> (AC-63). */
export function Highlighted({ text, range }: { text: string; range?: Range }) {
  const parts = splitAt(text, range);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark className="ip-mark">{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

export function badgeText(item: ToolIndexItem): string | null {
  return item.status === "beta" ? copy.beta : item.status === "planned" ? copy.soon : null;
}

/**
 * Goes between the visible pieces of a tool link. Tool links take their accessible name from
 * their content (WCAG 2.5.3, AC-56), so each piece needs real whitespace after it (or the
 * text runs together, "MergeComing soon") plus a comma for screen readers to pause on.
 * Whitespace-only text is not rendered in flex layouts, so it changes nothing visually.
 */
export function NameSep() {
  return (
    <>
      <span className="sr-only">,</span>{" "}
    </>
  );
}

/** Badge and runtime marker, each preceded by a NameSep. */
function Meta({ item, className }: { item: ToolIndexItem; className?: string }) {
  const badge = badgeText(item);
  if (!badge && item.runtime !== "client") return null;
  return (
    <span className={cx("flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {badge && (
        <>
          <NameSep />
          <Badge tone={item.status === "planned" ? "soon" : "beta"}>{badge}</Badge>
        </>
      )}
      {item.runtime === "client" && (
        <>
          <NameSep />
          <RuntimeMarker />
        </>
      )}
    </span>
  );
}

/** The 32px icon halo: the category hue at 20% behind a thin icon in the full hue (Mint Paper ToolCard). */
function Halo({ item }: { item: ToolIndexItem }) {
  return <span className="mp-halo">{item.icon}</span>;
}

/** Leaf-cornered Mint Paper tool card. Colour means category: `ip-cat-*` sets the hue. */
const cardClass = (item: ToolIndexItem, extra?: string) => cx("mp-card", `ip-cat-${item.category}`, extra);

/** Full catalogue card: the whole card is one link (AC-7). */
export function ToolCard({ item, idPrefix = "cat", nameRange, summaryRange }: { item: ToolIndexItem; idPrefix?: string; nameRange?: Range; summaryRange?: Range }) {
  const base = `${idPrefix}-${item.slug}`;
  // The name comes from the content, in visual order: name, summary, badge, marker (AC-56).
  return (
    <Link href={`/${item.slug}`} prefetch={false} className={cardClass(item)} data-planned={usable(item) ? undefined : ""}>
      <span className="mp-card__top">
        <Halo item={item} />
        <span id={`${base}-name`} className="min-w-0 [overflow-wrap:anywhere]">
          <Highlighted text={item.name} range={nameRange} />
        </span>
      </span>
      <NameSep />
      <span id={`${base}-summary`} className="mp-card__desc">
        <Highlighted text={item.summary} range={summaryRange} />
      </span>
      <Meta item={item} className="mb-1 ms-1.5" />
    </Link>
  );
}

/** Popular-row card. The summary shows at >= 1024 px and is always part of the link's name. */
export function ToolTile({ item, idPrefix = "pop" }: { item: ToolIndexItem; idPrefix?: string }) {
  const base = `${idPrefix}-${item.slug}`;
  // Name from content, in visual order: name, summary (visible at >= 1024 px), badge, marker (AC-56).
  return (
    <Link href={`/${item.slug}`} prefetch={false} className={cardClass(item)} data-planned={usable(item) ? undefined : ""}>
      <span className="mp-card__top">
        <Halo item={item} />
        <span id={`${base}-name`} className="min-w-0 [overflow-wrap:anywhere]">
          {item.name}
        </span>
      </span>
      <NameSep />
      <span id={`${base}-summary`} className="sr-only lg:not-sr-only lg:mt-1.5 lg:mb-2 lg:ms-1.5 lg:block lg:text-sm lg:leading-4 lg:text-muted">
        {item.summary}
      </span>
      <Meta item={item} className="mt-1 mb-1 ms-1.5" />
    </Link>
  );
}

/** Recent-tools chip (usable tools only, so no badges): the Mint Paper nav chip, icon in its category hue. */
export function ToolChip({ item, children }: { item: ToolIndexItem; children?: ReactNode }) {
  return (
    <Link href={`/${item.slug}`} className={cx("mp-navlink mp-navlink--chip gap-2", `ip-cat-${item.category}`)}>
      <span className="text-(--c) [&_svg]:size-4">{item.icon}</span>
      {item.name}
      {children}
    </Link>
  );
}
