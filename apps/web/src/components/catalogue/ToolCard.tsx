import Link from "next/link";
import type { ReactNode } from "react";
import { splitAt, type Range } from "@/lib/catalogue/search";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { ArrowRightIcon } from "../ui/icons";
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

function IconTile({ item, size = 40 }: { item: ToolIndexItem; size?: number }) {
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-md", usable(item) ? "bg-primary-soft text-primary-ink" : "bg-surface-sunken text-fg-muted")}
      style={{ width: size, height: size }}
    >
      {item.icon}
    </span>
  );
}

const cardBase = (item: ToolIndexItem) =>
  cx(
    "ip-edge group relative flex h-full rounded-xl transition-[transform,box-shadow,background-color] duration-(--ip-duration-fast) ease-out active:scale-[0.99]",
    // Ready: a surface card on canvas. Planned: the same hairline ring with no fill, so it reads quieter.
    usable(item)
      ? "bg-surface-raised shadow-sm [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md"
      : "bg-transparent shadow-sm hover:bg-hover",
  );

/** Full catalogue card: the whole card is one link (AC-7). */
export function ToolCard({ item, idPrefix = "cat", nameRange, summaryRange }: { item: ToolIndexItem; idPrefix?: string; nameRange?: Range; summaryRange?: Range }) {
  const base = `${idPrefix}-${item.slug}`;
  // The name comes from the content, in visual order: name, summary, badge, marker (AC-56).
  return (
    <Link href={`/${item.slug}`} prefetch={false} className={cx(cardBase(item), "gap-3 p-4")}>
      <IconTile item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${base}-name`} className="pe-5 font-semibold [overflow-wrap:anywhere] text-fg">
          <Highlighted text={item.name} range={nameRange} />
        </span>
        <NameSep />
        <span id={`${base}-summary`} className="text-sm text-fg-muted">
          <Highlighted text={item.summary} range={summaryRange} />
        </span>
        <Meta item={item} />
      </span>
      {usable(item) && (
        <ArrowRightIcon
          size={16}
          className="absolute top-4 end-4 text-primary-ink opacity-0 transition-[opacity,transform] duration-(--ip-duration-fast) group-hover:translate-x-1 group-hover:opacity-100"
        />
      )}
    </Link>
  );
}

/** Compact Popular-row tile. The summary shows at >= 1024 px and is always part of the link's name. */
export function ToolTile({ item, idPrefix = "pop" }: { item: ToolIndexItem; idPrefix?: string }) {
  const base = `${idPrefix}-${item.slug}`;
  // Name from content, in visual order: name, summary (visible at >= 1024 px), badge, marker (AC-56).
  return (
    <Link href={`/${item.slug}`} prefetch={false} className={cx(cardBase(item), "min-h-24 flex-col gap-2 p-4")}>
      <IconTile item={item} />
      <span id={`${base}-name`} className="font-semibold [overflow-wrap:anywhere] text-fg">
        {item.name}
      </span>
      <NameSep />
      <span id={`${base}-summary`} className="sr-only text-sm text-fg-muted lg:not-sr-only lg:line-clamp-2">
        {item.summary}
      </span>
      <Meta item={item} className="mt-auto" />
    </Link>
  );
}

/** Recent-tools chip (usable tools only, so no badges). */
export function ToolChip({ item, children }: { item: ToolIndexItem; children?: ReactNode }) {
  return (
    <Link
      href={`/${item.slug}`}
      className="ip-tint ip-edge inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface-raised ps-3 pe-4 text-sm font-medium whitespace-nowrap text-fg shadow-control hover:shadow-control-hover"
    >
      <span className="text-primary-ink">{item.icon}</span>
      {item.name}
      {children}
    </Link>
  );
}
