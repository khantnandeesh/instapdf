/*
 * NEEDS OWNER / LEGAL REVIEW before the first production release.
 * Our own plain-language text (no third-party legal text was copied). Bracketed
 * placeholders (<Fill>) must be filled in by the owner: company name, registered
 * address, contact email, effective date. Statements about how the product works
 * were checked against the code on 2026-11-23 (backlog Q1); keep them true when the
 * product changes (server tools, accounts or analytics would each need an update).
 */
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { Code, Contact, Fill, LegalPage, List, Section, Sub, Summary, TextLink } from "@/components/legal/Legal";
import { legalFacts as f } from "@/components/legal/facts";
import { configuredProviders } from "@/lib/cloud/providers";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy | BerryPDF",
  description: "How BerryPDF handles your files and data: browser tools process files on your device and upload nothing.",
});

export default function PrivacyPage() {
  // F23: the clouds this build offers (none without cloud sources: the page stays as it was).
  const providers = configuredProviders();
  const cloud = providers.length > 0;
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          BerryPDF is built so that we learn as little about you as possible. This page explains what happens to your files, what little information reaches our
          servers, and how you can check our claims yourself.
        </p>
      }
    >
      <Summary>
        <li>Tools that run in your browser process your files on your device. The files are never uploaded.</li>
        <li>There are no accounts, no analytics, no ads and no cookies.</li>
        <li>The only thing we keep on your device is a short list of tools you used recently, and you can clear it.</li>
        <li>Tools that need our servers are not available yet. When they are, files sent to them will be deleted within {f.serverFileHours} hours.</li>
      </Summary>

      <Section id="files" title="Your files stay on your device">
        <p>
          Every tool available today runs entirely in your web browser. When you add a PDF, your browser reads it, processes it and creates the result on your own
          device. The file is not sent to us or to anyone else, and the result is saved straight from your browser.
        </p>
        <p>
          Your browser enforces this, so you don&apos;t have to take our word for it. Every page is sent with a Content Security Policy, a security header your
          browser obeys, that only allows network connections back to our own site (<Code>{"connect-src 'self'"}</Code>). Our pages contain no code that sends your
          files anywhere, not even to our own site, and the policy also blocks the usual ways a page could send data to another site (network requests, form posts,
          and loading scripts, images or frames from elsewhere).
        </p>
        <Sub title="Check it yourself">
          <ol className="list-decimal space-y-1.5 ps-6 marker:text-muted">
            <li>
              Open your browser&apos;s developer tools (usually <kbd className="font-mono text-[0.9em]">F12</kbd>, or right-click and choose Inspect) and go to
              the <strong className="font-bold text-ink">Network</strong> tab.
            </li>
            <li>
              Open a tool, for example <TextLink href="/rotate-pdf">Rotate</TextLink>, add a PDF, process it and download the result. You will see the page&apos;s own
              code and fonts load from our site, but no request that carries your file.
            </li>
            <li>
              Select the request for the page itself and look at its response headers. The <Code>Content-Security-Policy</Code> header contains{" "}
              <Code>{"connect-src 'self'"}</Code>, <Code>{"default-src 'self'"}</Code> and <Code>{"form-action 'self'"}</Code>.
            </li>
            <li>
              Optional: in the Console tab, type <Code>{'fetch("https://example.com")'}</Code>. The browser refuses it with a Content Security Policy error. The same
              rule applies inside the background workers our tools use.
            </li>
          </ol>
        </Sub>
        <p>
          Some tools that are still being built, such as Office conversions, can&apos;t run in a browser and will need our servers. They will be clearly marked, and
          the next section explains what will happen when they launch.
        </p>
      </Section>

      <Section id="server-tools" title="Tools that will use our servers (coming later)">
        <p>
          None of these tools are live yet. When the first one launches, files you choose to process with it will be uploaded over an encrypted connection to
          temporary storage on {f.hosting} in {f.region}, processed there, and deleted automatically within {f.serverFileHours} hours, together with the result.
          We will not look at, share or keep them. Those tool pages will say clearly that they upload, and we will update this page before they launch.
        </p>
      </Section>

      <Section id="collect" title="What reaches our servers">
        <p>
          Like any website, our servers receive basic technical information when your browser loads a page: your IP address, the address of the page, the time,
          your browser&apos;s user agent and the page that linked to us. Our hosting provider, {f.hosting}, records this in request logs. We use them only to keep
          the service running, fix problems and protect it from abuse. The logs are kept for {f.logRetentionDays} days and then deleted. They never contain your
          files.
        </p>
        <p>We don&apos;t have accounts, so we don&apos;t hold your name, email address, password or payment details.</p>
      </Section>

      <Section id="not-collect" title="What we don't do">
        <List>
          <li>No analytics or usage tracking, and no advertising.</li>
          {cloud ? (
            <li>
              No third-party scripts, tracking pixels or social media widgets on our pages. Fonts and icons are served from our own site. The only exception is
              the separate cloud window described <TextLink href="#third-party">below</TextLink>, and only when you open it.
            </li>
          ) : (
            <li>No third-party scripts, tracking pixels or social media widgets. Fonts and icons are served from our own site.</li>
          )}
          <li>
            No cookies. The <TextLink href="/cookies">cookie notice</TextLink> describes the small amount of browser storage we use instead.
          </li>
          <li>We don&apos;t sell or share personal information.</li>
        </List>
      </Section>

      <Section id="device" title="Information kept on your device">
        <p>
          To show the tools you used recently, your browser keeps a list of up to {f.recentMax} tool names in its local storage under the key{" "}
          <Code>{f.recentKey}</Code>. It holds only tool names, never file names or contents, and it never leaves your device. You can clear it with the{" "}
          <strong className="font-bold text-ink">Clear</strong> button next to &quot;Recently used&quot; on the home page or in the All tools menu, or by
          clearing this site&apos;s data in your browser settings. Details are in the <TextLink href="/cookies">cookie notice</TextLink>.
        </p>
      </Section>

      {/* F23: only in builds that offer a cloud. */}
      {cloud && (
        <Section id="third-party" title="Third-party services (cloud storage)">
          <p>
            Where it is available, you can choose files from, or save results to, a cloud storage account you already have. This happens in a separate BerryPDF
            window, never on the tool page, and only after you click a cloud button. That window loads the provider&apos;s own sign-in and file chooser from the
            provider&apos;s site, and your browser downloads the files you pick straight from the provider. They then go to the tool tab and are processed on your
            device like any other file. Nothing passes through our servers.
          </p>
          <List>
            {providers.includes("dropbox") && (
              <li>
                <strong className="font-bold text-ink">Dropbox Chooser</strong> (Dropbox, Inc.) for choosing files from Dropbox.
              </li>
            )}
            {providers.includes("google") && (
              <li>
                <strong className="font-bold text-ink">Google Picker and Google Identity Services</strong> (Google LLC) for signing in to Google Drive, choosing
                files and saving results. We ask only for access to the files you pick or that BerryPDF creates (the <Code>drive.file</Code> permission). The Google window also reads the email address of your Google account so the picker opens on the account you signed in with; it stays in that window and goes only to Google.
              </li>
            )}
            {providers.includes("onedrive") && (
              <li>
                <strong className="font-bold text-ink">Microsoft sign-in and the OneDrive file picker</strong> (Microsoft Corporation) for OneDrive, including
                saving results.
              </li>
            )}
          </List>
          <p>
            The access the provider gives us is kept in that window&apos;s memory only. It is never stored and never sent to us, and it is gone when the window
            closes. The provider sees your sign-in and the files you choose, under its own privacy policy. To remember which cloud you used last, your browser keeps
            one word (for example <Code>dropbox</Code>) under the key <Code>berrypdf:cloud-last</Code>. It never leaves your device.
          </p>
        </Section>
      )}

      <Section id="providers" title="Service providers">
        <p>
          The site is hosted on {f.hosting} (Google LLC) in {f.region}. Google handles the request logs described above on our behalf. If you are outside the
          United States, this means that information may be processed outside your country, including in the United States.
        </p>
      </Section>

      <Section id="rights" title="Your choices and rights">
        <p>
          Depending on where you live, you may have the right to ask what personal information we hold about you, to have it corrected or deleted, or to object to
          how it is used. Because we hold so little (only short-lived server logs), there is usually nothing we can link to you, but we will answer every request.
          Write to <Fill>contact email</Fill>. You can also complain to your local data protection authority.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>BerryPDF is not aimed at children and we don&apos;t knowingly collect information from them. With no accounts, we hold no profile of anyone.</p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If the way BerryPDF handles data changes, for example when server tools launch, we will update this page before the change takes effect and change the
          date at the top.
        </p>
      </Section>

      <Section id="contact" title="Who we are and how to reach us">
        <p>BerryPDF is run by:</p>
        <Contact />
      </Section>
    </LegalPage>
  );
}
