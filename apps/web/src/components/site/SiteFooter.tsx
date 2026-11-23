import Link from "next/link";
import { tools } from "@/tools/registry";
import { infoPages, siteCopy } from "./copy";

const linkClass = "inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg hover:underline lg:min-h-8";

/** Footer on every page (spec F2 §3g): A–Z tools, company and legal placeholders, copyright. */
export function SiteFooter() {
  const az = [...tools].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const year = new Date().getFullYear();
  const company = (["about", "help"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  const legal = (["privacy", "terms", "cookies", "security"] as const).map((s) => ({ href: `/${s}`, label: infoPages[s] }));
  return (
    <footer className="ip-site-footer mt-16 border-t border-border bg-surface pt-12 pb-8 sm:mt-24">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-[240px_1fr_140px_140px]">
          <div className="col-span-2 lg:col-span-1">
            <p className="text-lg font-semibold tracking-tight">
              Insta<span className="text-primary">PDF</span>
            </p>
            <p className="mt-1 text-sm text-fg-muted">{siteCopy.footerTagline}</p>
            <Link href="/#tools" prefetch={false} className={linkClass}>
              {siteCopy.footerAllTools} →
            </Link>
          </div>
          <nav aria-labelledby="footer-tools" className="col-span-2 lg:col-span-1">
            <h2 id="footer-tools" className="text-sm font-semibold">
              Tools A–Z
            </h2>
            <ul className="mt-2 columns-2 gap-6 sm:columns-3 xl:columns-4" data-testid="footer-az">
              {az.map((t) => (
                <li key={t.slug} className="break-inside-avoid">
                  <Link href={`/${t.slug}`} prefetch={false} className={linkClass}>
                    <span>
                      {t.name}
                      {t.status === "planned" && (
                        <>
                          <span aria-hidden="true" className="ms-1.5 text-xs">
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
        <p className="mt-10 border-t border-border pt-6 text-xs text-fg-muted">
          © {year} InstaPDF · {siteCopy.footerPrivacy}
        </p>
      </div>
    </footer>
  );
}

function FooterNav({ id, title, links }: { id: string; title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <ul className="mt-2">
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
