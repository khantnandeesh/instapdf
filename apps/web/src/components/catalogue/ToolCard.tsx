import Link from "next/link";
import type { ReactNode } from "react";
import { splitAt, type Range } from "@/lib/catalogue/search";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { RUNTIME_CLIENT_TEXT } from "../ui/RuntimeMarker";
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

/**
 * The card's one visible status mark (owner 2026-11-23, minimal text): a small "Soon" tag for a
 * planned tool or the "Beta" pill. The full words ("Coming soon") and the runtime fact ("Runs in
 * your browser") stay in the link's accessible name (AC-9, AC-59), visually hidden. Each piece is
 * preceded by a NameSep so the name reads "Merge, Join PDFs…, Coming soon, Runs in your browser".
 */
function Meta({ item }: { item: ToolIndexItem }) {
  const badge = badgeText(item);
  return (
    <>
      {badge && (
        <>
          <NameSep />
          {item.status === "planned" ? (
            <Badge tone="soon" className="mp-card__mark">
              <span aria-hidden="true">{copy.soonShort}</span>
              <span className="sr-only">{badge}</span>
            </Badge>
          ) : (
            <Badge tone="beta" className="mp-card__mark">
              {badge}
            </Badge>
          )}
        </>
      )}
      {item.runtime === "client" && (
        <>
          <NameSep />
          <span className="sr-only">{RUNTIME_CLIENT_TEXT}</span>
        </>
      )}
    </>
  );
}

/** The 40px icon disc: the category berry at 16% behind the duotone icon in the full colour (BerryPDF ToolCard). */
function Halo({ item }: { item: ToolIndexItem }) {
  return <span className="mp-halo">{item.icon}</span>;
}

/** Leaf-cornered BerryPDF tool card. Colour means category: `ip-cat-*` sets the hue. */
const cardClass = (item: ToolIndexItem, extra?: string) => cx("mp-card", `ip-cat-${item.category}`, extra);

/**
 * Catalogue card: icon, name and at most one small status mark; the whole card is one link (AC-7).
 * The summary is not shown (owner 2026-11-23): it stays in the accessible name (visually hidden)
 * and is the hover tooltip.
 */
export function ToolCard({ item, idPrefix = "cat", nameRange, summaryRange }: { item: ToolIndexItem; idPrefix?: string; nameRange?: Range; summaryRange?: Range }) {
  const base = `${idPrefix}-${item.slug}`;
  // The name comes from the content, in DOM order: name, summary, badge, marker (AC-56).
  return (
    <Link href={`/${item.slug}`} prefetch={false} title={item.summary} className={cardClass(item)} data-planned={usable(item) ? undefined : ""}>
      <Halo item={item} />
      <span id={`${base}-name`} className="mp-card__name">
        <Highlighted text={item.name} range={nameRange} />
      </span>
      <NameSep />
      <span id={`${base}-summary`} className="sr-only">
        <Highlighted text={item.summary} range={summaryRange} />
      </span>
      <Meta item={item} />
    </Link>
  );
}

/** Popular-row card: the same card, without search highlights. */
export function ToolTile({ item, idPrefix = "pop" }: { item: ToolIndexItem; idPrefix?: string }) {
  return <ToolCard item={item} idPrefix={idPrefix} />;
}

/** Recent-tools chip (usable tools only, so no badges): the BerryPDF nav chip, icon in its category colour. */
export function ToolChip({ item, children }: { item: ToolIndexItem; children?: ReactNode }) {
  return (
    <Link href={`/${item.slug}`} className={cx("mp-navlink mp-navlink--chip gap-2", `ip-cat-${item.category}`)}>
      <span className="text-(--c) [&_svg]:size-[18px]">{item.icon}</span>
      {item.name}
      {children}
    </Link>
  );
}
