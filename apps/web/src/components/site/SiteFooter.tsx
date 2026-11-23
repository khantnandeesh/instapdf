import Link from "next/link";
import { tools } from "@/tools/registry";
import { Wordmark } from "./BrandMark";
import { infoPages, siteCopy } from "./copy";

/* Footer links: ink, 14px, 24px targets (WCAG 2.5.8); berry and underlined on hover. */
const linkClass = "mp-footer__link";

/**
 * Footer on every page (spec F2 §3g), compact (owner 2026-11-23: minimal text). One row: the
 * wordmark and copyright, then All tools and the Company and Legal links inline (their headings
 * are for screen readers). The A–Z tool list (AC-53) sits folded under a small "Tools A–Z" toggle.
 */
export function SiteFooter() {
  const az = [...tools].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const year = new Date().getFullYear();
  const company = (["about", "help"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  const legal = (["privacy", "terms", "cookies", "licenses", "security"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  return (
    <footer className="ip-site-footer mp-footer">
      <div className="mx-auto flex max-w-[1170px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-[15px] pt-5 pb-3">
        <div className="flex items-center gap-3">
          <Wordmark />
          <small className="text-sm text-muted">© {year} BerryPDF</small>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/#tools" prefetch={false} className={linkClass}>
            {siteCopy.footerAllTools}
          </Link>
          <FooterNav id="footer-company" title="Company" links={company} />
          <FooterNav id="footer-legal" title="Legal" links={legal} />
        </div>
      </div>
      <details className="mp-footer__az mx-auto max-w-[1170px] px-[15px] pb-5">
        <summary className="mp-footer__link w-fit cursor-pointer">Tools A–Z</summary>
        <nav aria-labelledby="footer-tools">
          <h2 id="footer-tools" className="sr-only">
            Tools A–Z
          </h2>
          <ul className="mt-2 columns-2 gap-6 sm:columns-4 lg:columns-6" data-testid="footer-az">
            {az.map((t) => (
              <li key={t.slug} className="break-inside-avoid">
                <Link href={`/${t.slug}`} prefetch={false} className={linkClass}>
                  <span>
                    {t.name}
                    {t.status === "planned" && <span className="sr-only">, coming soon</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    </footer>
  );
}

function FooterNav({ id, title, links }: { id: string; title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="sr-only">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
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
