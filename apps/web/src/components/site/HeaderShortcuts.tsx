"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteCopy } from "./copy";

/**
 * Up to 5 usable-tool links (3 below 1024 px, none below 768 px). Never a planned tool (AC-31).
 * BerryPDF Header links: 16px, 8x12 padding, 10px radius; hover (and the current page) gets a milk-pink fill and berry text.
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
