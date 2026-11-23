/*
 * NEEDS OWNER / LEGAL REVIEW before the first production release.
 * Our own plain-language text. Placeholders (<Fill>): effective date, contact email.
 * Verified against the code on 2026-11-23 (backlog Q1): the app sets no cookies
 * (e2e AC-54) and uses exactly the two storage keys listed below (src/lib/recent-tools.ts,
 * src/components/tool-flow/ToolFlow.tsx). Update this page if that changes.
 */
import type { Metadata } from "next";
import { Code, Fill, LegalPage, Section, Summary, TextLink } from "@/components/legal/Legal";
import { legalFacts as f } from "@/components/legal/facts";

export const metadata: Metadata = {
  title: "Cookies · InstaPDF",
  description: "InstaPDF sets no cookies. It keeps a short list of recently used tools in your browser, and you can clear it.",
};

const cell = "border-b border-border px-3 py-2 align-top text-start";

export default function CookiesPage() {
  return (
    <LegalPage title="Cookies and browser storage" intro={<p>InstaPDF doesn&apos;t use cookies. Here is the little we do keep in your browser, and how to remove it.</p>}>
      <Summary>
        <li>No cookies: not ours, and not from advertisers or analytics services.</li>
        <li>Two small browser-storage entries that make the site easier to use. Neither leaves your device.</li>
        <li>Nothing here tracks you, so there is no consent banner.</li>
      </Summary>

      <Section id="cookies" title="Cookies">
        <p>
          Our pages don&apos;t set cookies and don&apos;t load anything from other websites that could set them. We use no analytics, advertising or social media
          services.
        </p>
      </Section>

      <Section id="storage" title="What we keep in your browser">
        <p>
          Web browsers let a site keep small notes on your device (&quot;local storage&quot; and &quot;session storage&quot;). Unlike cookies, they are not sent to
          our servers with each request. We use them for two conveniences:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <caption className="sr-only">Browser storage used by InstaPDF</caption>
            <thead>
              <tr className="text-ink">
                <th scope="col" className={`${cell} font-bold`}>
                  Name
                </th>
                <th scope="col" className={`${cell} font-bold`}>
                  Type
                </th>
                <th scope="col" className={`${cell} font-bold`}>
                  What it holds and why
                </th>
                <th scope="col" className={`${cell} font-bold`}>
                  How long
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell}>
                  <Code>{f.recentKey}</Code>
                </td>
                <td className={cell}>Local storage</td>
                <td className={cell}>
                  The names of up to {f.recentMax} tools you opened, newest first, so the home page and menu can list them under &quot;Recently used&quot;. No file
                  names or contents.
                </td>
                <td className={cell}>Until you clear it</td>
              </tr>
              <tr>
                <td className={cell}>
                  <Code>{f.thumbKey}</Code>
                </td>
                <td className={cell}>Session storage</td>
                <td className={cell}>The page-preview size you picked with the size slider in a tool, so it stays the same while you work.</td>
                <td className={cell}>Until you close the tab</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The files you open in a tool are held in your browser&apos;s memory only while the tool page is open. They are not written to storage and are gone when you
          close or leave the page.
        </p>
      </Section>

      <Section id="clear" title="How to clear it">
        <p>
          To clear the list of recently used tools, use the <strong className="font-bold text-ink">Clear</strong> button next to &quot;Recently used&quot; on
          the <TextLink href="/">home page</TextLink> or in the All tools menu. To remove everything, clear this site&apos;s data in your browser&apos;s settings
          (often under Privacy, then Cookies and site data). Private or incognito windows discard it when you close them.
        </p>
      </Section>

      <Section id="more" title="More information">
        <p>
          The <TextLink href="/privacy">privacy policy</TextLink> covers everything else, including what our servers receive when you load a page. Questions:{" "}
          <Fill>contact email</Fill>.
        </p>
      </Section>
    </LegalPage>
  );
}
