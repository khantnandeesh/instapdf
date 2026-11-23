import Link from "next/link";
import { tools } from "@/tools/registry";
import { Wordmark } from "./BrandMark";
import { infoPages, siteCopy } from "./copy";

/* BerryPDF Footer links: ink, 15px on 27px rows (also a 24px target, WCAG 2.5.8); berry and underlined on hover. */
const linkClass = "mp-footer__link";

/**
 * Footer on every page (spec F2 §3g), BerryPDF Footer: a calm sitemap on cream, introduced by the
 * vine divider (layout.tsx). Left: the berry mark, the name and a small muted sign-off; then plain
 * link columns under small uppercase Fredoka headings in berry red. No social row, no boxes.
 */
export function SiteFooter() {
  const az = [...tools].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const year = new Date().getFullYear();
  const company = (["about", "help"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  const legal = (["privacy", "terms", "cookies", "licenses", "security"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  return (
    <footer className="ip-site-footer mp-footer">
      <div className="mx-auto grid max-w-[1170px] grid-cols-2 gap-[30px] px-[30px] pt-[26px] pb-[34px] text-[15px] lg:grid-cols-[1.4fr_3fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <Wordmark />
          <small className="mt-3 block text-sm leading-[1.7] text-muted">
            {siteCopy.footerTagline}
            <br />© {year} BerryPDF · {siteCopy.footerPrivacy}
          </small>
          <Link href="/#tools" prefetch={false} className={`${linkClass} mt-2`}>
            {siteCopy.footerAllTools} →
          </Link>
        </div>
        <nav aria-labelledby="footer-tools" className="col-span-2 lg:col-span-1">
          <h2 id="footer-tools">
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
      <h2 id={id}>
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
