"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteCopy } from "./copy";

/**
 * Up to 5 usable-tool links (3 below 1024 px, none below 768 px). Never a planned tool (AC-31).
 * Mint Paper: 17px ink-black, 6x8 padding, no underline and no active pill (aria-current stays).
 */
export function HeaderShortcuts({ links }: { links: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  if (!links.length) return null;
  return (
    <nav aria-label={siteCopy.shortcutsLabel} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {links.map((l, i) => {
          const current = pathname === `/${l.slug}`;
          return (
            <li key={l.slug} className={i >= 3 ? "hidden lg:block" : undefined}>
              <Link href={`/${l.slug}`} aria-current={current ? "page" : undefined} className="mp-navlink">
                {l.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
