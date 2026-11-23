/**
 * Building blocks for the legal pages (privacy, terms, cookies, licenses). Server components.
 * Facts the legal pages state about the product live in ./facts.ts.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { LeafIcon } from "../ui/icons";

/** BerryPDF Prose column: about 680px, centred, left-aligned; no decoration. */
export const legalContainer = "mx-auto w-full max-w-[710px] px-[15px] pt-(--space-8) pb-(--space-8) outline-none";

/**
 * Text only the owner can supply (company name, contact email, governing law, dates).
 * Rendered visibly bracketed and highlighted (bold ink on sand, 11.15:1) so nobody ships it by mistake.
 */
export function Fill({ children }: { children: string }) {
  return (
    <span className="rounded-[3px] bg-sand px-1 font-bold text-ink" data-placeholder="">
      {`[${children}]`}
    </span>
  );
}

/** BerryPDF Prose: Fredoka headings, a small muted date line, warm-brown 16/28 body, 24px paragraph gap, bold berry links. */
export function LegalPage({ title, intro, updated = true, children }: { title: string; intro: ReactNode; updated?: boolean; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={legalContainer}>
      <article className="mp-prose mp-prose--legal">
        <h1>{title}</h1>
        {updated && (
          <p>
            <em>
              Last updated: <Fill>effective date</Fill>
            </em>
          </p>
        )}
        <div className="text-[17px] leading-[28px] text-ink">{intro}</div>
        <div className="mt-6 space-y-10">{children}</div>
      </article>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="scroll-mt-[calc(var(--ip-header-h)+16px)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-[17px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="mp-seedlist space-y-1.5">{children}</ul>;
}

/** BerryPDF inline code chip (pale yellow), in Fredoka like everything else. */
export function Code({ children }: { children: string }) {
  return <code className="rounded-[6px] bg-[var(--code-yellow)] px-[7px] py-[3px] font-mono text-[13px] leading-4 font-medium break-words text-ink">{children}</code>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false}>
      {children}
    </Link>
  );
}

/** Short "in brief" box at the top of a legal page: a BerryPDF Callout (pink band, leaf, seed bullets). */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <div className="mp-callout">
      <LeafIcon size={22} />
      <div className="min-w-0">
        <h2 className="m-0 font-display text-[17px] leading-[25.5px] font-semibold text-ink">In short</h2>
        <ul className="mp-seedlist mt-1 text-ink">{children}</ul>
      </div>
    </div>
  );
}

/** Contact line shared by the legal pages. */
export function Contact() {
  return (
    <p>
      <Fill>Company name</Fill>, <Fill>registered address</Fill>. Email: <Fill>contact email</Fill>.
    </p>
  );
}
