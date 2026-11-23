/**
 * Building blocks for the legal pages (privacy, terms, cookies, licenses). Server components.
 * Facts the legal pages state about the product live in ./facts.ts.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export const legalContainer = "mx-auto w-full max-w-[760px] px-4 pt-10 pb-12 outline-none sm:px-6 sm:pt-12";

/**
 * Text only the owner can supply (company name, contact email, governing law, dates).
 * Rendered visibly bracketed and highlighted so nobody ships it by mistake.
 */
export function Fill({ children }: { children: string }) {
  return (
    <span className="rounded-sm bg-warning-soft px-1 font-medium text-fg" data-placeholder="">
      {`[${children}]`}
    </span>
  );
}

export function LegalPage({ title, intro, updated = true, children }: { title: string; intro: ReactNode; updated?: boolean; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={legalContainer}>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {updated && (
        <p className="mt-2 text-sm text-fg-muted">
          Last updated: <Fill>effective date</Fill>
        </p>
      )}
      <div className="mt-4 text-base text-fg-muted sm:text-lg">{intro}</div>
      <div className="mt-8 space-y-10">{children}</div>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 leading-relaxed">
      <h2 id={id} className="scroll-mt-20 text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 ps-6 marker:text-fg-muted">{children}</ul>;
}

export function Code({ children }: { children: string }) {
  return <code className="rounded-sm bg-surface-sunken px-1 py-0.5 font-mono text-[0.9em] break-words">{children}</code>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
      {children}
    </Link>
  );
}

/** Short "in brief" box at the top of a legal page. */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">In short</h2>
      <ul className="mt-2 list-disc space-y-1.5 ps-6 text-fg-muted marker:text-fg-muted">{children}</ul>
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
