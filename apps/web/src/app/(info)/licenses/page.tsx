/*
 * NEEDS OWNER / LEGAL REVIEW before the first production release (the caniuse-lite
 * CC-BY-4.0 exception and the font copyright lines in scripts/licenses.mjs especially).
 * Generated at build time: scripts/licenses.mjs reads the production dependency tree,
 * checks every license against the allow-list (failing the build otherwise) and writes
 * .generated/licenses.json, read here, plus public/third-party-notices.txt (full texts).
 */
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { LegalPage, Section, TextLink } from "@/components/legal/Legal";
import { readNotices, type NoticeEntry } from "@/lib/licenses/notices";

export const dynamic = "force-static";

export const metadata: Metadata = pageMetadata({
  path: "/licenses",
  title: "Open-Source Licenses | BerryPDF",
  description: "The open-source software, fonts and icons BerryPDF uses, with their licenses and copyright notices.",
});

export default function LicensesPage() {
  const entries = readNotices();
  const assets = entries.filter((e) => e.kind !== "package");
  const packages = entries.filter((e) => e.kind === "package");
  return (
    <LegalPage
      title="Open-source licenses"
      updated={false}
      intro={
        <p>
          BerryPDF is built on open-source software. We thank the people who make it. Below are the components we use, their licenses and copyright notices. The
          full license and notice texts are in{" "}
          <a href="/third-party-notices.txt" className="text-brand-strong underline underline-offset-2 hover:no-underline">
            third-party-notices.txt
          </a>
          .
        </p>
      }
    >
      <Section id="assets" title="Fonts and icons">
        <EntryList entries={assets} testId="license-assets" />
      </Section>

      <Section id="packages" title="Software packages">
        <p className="text-muted">
          This list is generated from the site&apos;s production dependencies each time it is built ({packages.length} packages). Some are used only to build the
          site or to run its server and are never sent to your browser. We only use software under permissive licenses (MIT, Apache 2.0, BSD, ISC, MPL 2.0 and
          similar); the build stops if anything else appears.
        </p>
        <EntryList entries={packages} testId="license-packages" />
      </Section>

      <Section id="more" title="Questions">
        <p>
          If you think something is missing or wrong here, please tell us. Our <TextLink href="/privacy">privacy policy</TextLink> has our contact details.
        </p>
      </Section>
    </LegalPage>
  );
}

function EntryList({ entries, testId }: { entries: NoticeEntry[]; testId: string }) {
  return (
    <ul className="divide-y divide-border rounded-panel border border-panel-border bg-surface-raised" data-testid={testId}>
      {entries.map((e) => (
        <li key={`${e.name}@${e.version}`} className="space-y-1 px-4 py-3 text-sm" data-license={e.license ?? ""}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-bold break-all text-ink">
              {e.homepage ? (
                <a href={e.homepage} rel="noopener noreferrer" className="hover:underline">
                  {e.name}
                </a>
              ) : (
                e.name
              )}{" "}
              <span className="font-normal text-muted">{e.version}</span>
            </span>
            <span className="rounded-[3px] bg-[var(--code-yellow)] px-1.5 py-0.5 font-mono text-code-chip text-ink">{e.license}</span>
          </div>
          {e.copyright.length > 0 ? (
            e.copyright.map((c) => (
              <p key={c} className="break-words text-muted">
                {c}
              </p>
            ))
          ) : e.author ? (
            <p className="break-words text-muted">Author: {e.author.replace(/\s*<[^>]*>/, "")}</p>
          ) : null}
          {e.hasNotice && <p className="text-muted">Includes a NOTICE file, reproduced in the full notices.</p>}
          {e.exception && <p className="text-muted">Data, not program code: used under its attribution license.</p>}
        </li>
      ))}
    </ul>
  );
}
