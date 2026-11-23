import Link from "next/link";
import { tools } from "@/tools/registry";
import { Wordmark } from "./BrandMark";
import { infoPages, siteCopy } from "./copy";

/* Mint Paper Footer links: near-black, 14px, 24px rows (a 24px target, WCAG 2.5.8), underline on hover. */
const linkClass = "block text-sm leading-6 text-[var(--mp-footer-link)] no-underline hover:underline";
/* Small bold uppercase headings. */
const headingClass = "mb-2.5 text-sm font-bold tracking-[0.5px] text-ink uppercase";

/**
 * Footer on every page (spec F2 §3g), Mint Paper Footer: a tall, light sitemap on surface-footer
 * with 40px top padding; a small muted sign-off on the left, then plain link columns under small
 * bold uppercase headings. No icons, no social row, no dividers.
 */
export function SiteFooter() {
  const az = [...tools].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const year = new Date().getFullYear();
  const company = (["about", "help"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  const legal = (["privacy", "terms", "cookies", "security"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  return (
    <footer className="ip-site-footer bg-surface-footer">
      <div className="mx-auto grid max-w-[1170px] grid-cols-2 gap-[30px] px-[30px] pt-(--space-7) pb-(--space-7) text-sm lg:grid-cols-[1.4fr_3fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <Wordmark />
          <small className="mt-2 block text-sm leading-6 text-muted">
            {siteCopy.footerTagline}
            <br />© {year} InstaPDF · {siteCopy.footerPrivacy}
          </small>
          <Link href="/#tools" prefetch={false} className={`${linkClass} mt-2`}>
            {siteCopy.footerAllTools} →
          </Link>
        </div>
        <nav aria-labelledby="footer-tools" className="col-span-2 lg:col-span-1">
          <h2 id="footer-tools" className={headingClass}>
            Tools A–Z
          </h2>
          <ul className="columns-2 gap-6 sm:columns-3 xl:columns-4" data-testid="footer-az">
            {az.map((t) => (
              <li key={t.slug} className="break-inside-avoid">
                <Link href={`/${t.slug}`} prefetch={false} className={linkClass}>
                  <span>
                    {t.name}
                    {t.status === "planned" && (
                      <>
                        <span aria-hidden="true" className="ms-1.5 text-xs text-muted">
                          Soon
                        </span>
                        <span className="sr-only">, coming soon</span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <FooterNav id="footer-company" title="Company" links={company} />
        <FooterNav id="footer-legal" title="Legal" links={legal} />
      </div>
    </footer>
  );
}

function FooterNav({ id, title, links }: { id: string; title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className={headingClass}>
        {title}
      </h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} prefetch={false} className={linkClass}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
