"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui/cx";
import { siteCopy } from "./copy";

/** Up to 5 usable-tool links (3 below 1024 px, none below 768 px). Never a planned tool (AC-31). */
export function HeaderShortcuts({ links }: { links: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  if (!links.length) return null;
  return (
    <nav aria-label={siteCopy.shortcutsLabel} className="hidden md:block">
      <ul className="flex items-center">
        {links.map((l, i) => {
          const current = pathname === `/${l.slug}`;
          return (
            <li key={l.slug} className={i >= 3 ? "hidden lg:block" : undefined}>
              <Link
                href={`/${l.slug}`}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "relative inline-flex h-11 items-center px-3 text-sm font-medium whitespace-nowrap transition-colors duration-(--ip-duration-fast) hover:text-fg",
                  current ? "text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted",
                )}
              >
                {l.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
