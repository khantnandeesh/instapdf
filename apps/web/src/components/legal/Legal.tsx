/**
 * Building blocks for the legal pages (privacy, terms, cookies, licenses). Server components.
 * Facts the legal pages state about the product live in ./facts.ts.
 */
import Link from "next/link";
import type { ReactNode } from "react";

/** Mint Paper Prose column: about 680px, centered, left-aligned. */
export const legalContainer = "mx-auto w-full max-w-[710px] px-[15px] pt-(--space-8) pb-(--space-8) outline-none";

/**
 * Text only the owner can supply (company name, contact email, governing law, dates).
 * Rendered visibly bracketed and highlighted (bold ink on sand, 10.23:1) so nobody ships it by mistake.
 */
export function Fill({ children }: { children: string }) {
  return (
    <span className="rounded-[3px] bg-sand px-1 font-bold text-ink" data-placeholder="">
      {`[${children}]`}
    </span>
  );
}

/** Mint Paper Prose: page-title, a small italic date line, #555 body at 16/28, 24px paragraph gap, mint links. */
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
      <h3 className="font-bold text-[var(--mp-prose-h2)]">{title}</h3>
      {children}
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 ps-6 marker:text-muted">{children}</ul>;
}

/** Mint Paper inline code chip (yellow tint). */
export function Code({ children }: { children: string }) {
  return <code className="rounded-[3px] bg-[var(--code-yellow)] px-1.5 py-0.5 font-mono text-code-chip break-words text-ink">{children}</code>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false}>
      {children}
    </Link>
  );
}

/** Short "in brief" box at the top of a legal page: a Mint Paper Callout. */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <div className="mp-callout">
      <h2 className="m-0 text-[17px] leading-[25.5px] text-ink">In short</h2>
      <ul className="mt-2 list-disc space-y-1.5 ps-6 marker:text-muted">{children}</ul>
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
