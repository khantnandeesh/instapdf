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

/** Ids for the parts that make up a link's accessible name: name, badge, runtime marker. */
function nameParts(item: ToolIndexItem, base: string) {
  const badge = item.status === "beta" ? copy.beta : item.status === "planned" ? copy.soon : null;
  const ids = [`${base}-name`, badge && `${base}-badge`, item.runtime === "client" && `${base}-rt`].filter(Boolean).join(" ");
  return { badge, ids };
}

function Meta({ item, base, badge }: { item: ToolIndexItem; base: string; badge: string | null }) {
  return (
    <span className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
      {badge && (
        <Badge id={`${base}-badge`} tone={item.status === "planned" ? "soon" : "beta"}>
          {badge}
        </Badge>
      )}
      {item.runtime === "client" && <RuntimeMarker id={`${base}-rt`} />}
    </span>
  );
}

function IconTile({ item, size = 40 }: { item: ToolIndexItem; size?: number }) {
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-md", usable(item) ? "bg-primary-soft text-primary" : "bg-surface-sunken text-fg-muted")}
      style={{ width: size, height: size }}
    >
      {item.icon}
    </span>
  );
}

const cardBase = (item: ToolIndexItem) =>
  cx(
    "group relative flex h-full rounded-lg border transition-[transform,box-shadow,border-color] duration-(--ip-duration-fast) ease-out active:scale-[0.99]",
    usable(item)
      ? "border-border bg-surface-raised shadow-sm hover:border-border-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md"
      : "border-dashed border-border bg-surface hover:border-border-strong",
  );

/** Full catalogue card: the whole card is one link (AC-7). */
export function ToolCard({ item, idPrefix = "cat", nameRange, summaryRange }: { item: ToolIndexItem; idPrefix?: string; nameRange?: Range; summaryRange?: Range }) {
  const base = `${idPrefix}-${item.slug}`;
  const { badge, ids } = nameParts(item, base);
  return (
    <Link href={`/${item.slug}`} prefetch={false} aria-labelledby={ids} aria-describedby={`${base}-summary`} className={cx(cardBase(item), "gap-3 p-4")}>
      <IconTile item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${base}-name`} className="pe-5 font-semibold [overflow-wrap:anywhere] text-fg">
          <Highlighted text={item.name} range={nameRange} />
        </span>
        <span id={`${base}-summary`} className="text-sm text-fg-muted">
          <Highlighted text={item.summary} range={summaryRange} />
        </span>
        <Meta item={item} base={base} badge={badge} />
      </span>
      {usable(item) && (
        <ArrowRightIcon
          size={16}
          className="absolute top-4 end-4 text-fg-muted opacity-0 transition-[opacity,transform] duration-(--ip-duration-fast) group-hover:translate-x-1 group-hover:opacity-100"
        />
      )}
    </Link>
  );
}

/** Compact Popular-row tile. The summary shows at >= 1024 px and is always the link's description. */
export function ToolTile({ item, idPrefix = "pop" }: { item: ToolIndexItem; idPrefix?: string }) {
  const base = `${idPrefix}-${item.slug}`;
  const { badge, ids } = nameParts(item, base);
  return (
    <Link href={`/${item.slug}`} prefetch={false} aria-labelledby={ids} aria-describedby={`${base}-summary`} className={cx(cardBase(item), "min-h-24 flex-col gap-2 p-4")}>
      <IconTile item={item} />
      <span id={`${base}-name`} className="font-semibold [overflow-wrap:anywhere] text-fg">
        {item.name}
      </span>
      <span id={`${base}-summary`} className="sr-only text-sm text-fg-muted lg:not-sr-only lg:line-clamp-2">
        {item.summary}
      </span>
      <span className="mt-auto">
        <Meta item={item} base={base} badge={badge} />
      </span>
    </Link>
  );
}

/** Recent-tools chip (usable tools only, so no badges). */
export function ToolChip({ item, children }: { item: ToolIndexItem; children?: ReactNode }) {
  return (
    <Link
      href={`/${item.slug}`}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-raised ps-2 pe-3 text-sm font-medium whitespace-nowrap text-fg hover:border-border-strong"
    >
      <span className="text-primary">{item.icon}</span>
      {item.name}
      {children}
    </Link>
  );
}
