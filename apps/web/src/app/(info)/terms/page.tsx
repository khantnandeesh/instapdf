/*
 * NEEDS OWNER / LEGAL REVIEW before the first production release.
 * Our own plain-language text (no third-party terms were copied). Placeholders (<Fill>)
 * the owner must supply: company name, registered address, contact email, effective
 * date, governing law and courts. The warranty and liability sections in particular
 * must be checked by a lawyer for the owner's jurisdiction and consumer law.
 */
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { Contact, Fill, LegalPage, List, Section, Summary, TextLink } from "@/components/legal/Legal";
import { legalFacts as f } from "@/components/legal/facts";

export const metadata: Metadata = pageMetadata({
  path: "/terms",
  title: "Terms of Use | BerryPDF",
  description: "The terms for using BerryPDF's free PDF tools, in plain language.",
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms are the agreement between you and <Fill>Company name</Fill> (&quot;we&quot;) for using BerryPDF. By using the site you accept them. We have
          tried to keep them short and readable.
        </p>
      }
    >
      <Summary>
        <li>BerryPDF is free to use and needs no account.</li>
        <li>Your files stay yours. Browser tools never upload them.</li>
        <li>Only process files you have the right to use, and don&apos;t misuse the service.</li>
        <li>We work hard to get results right, but check important documents before you rely on them.</li>
      </Summary>

      <Section id="service" title="The service">
        <p>
          BerryPDF is a set of online tools for working with PDF files. Most tools run entirely in your browser, as explained in our{" "}
          <TextLink href="/privacy">privacy policy</TextLink>. Some tools are marked &quot;coming soon&quot; and are not available yet. We may add, change or remove
          tools, and the service may sometimes be unavailable, for example during maintenance.
        </p>
      </Section>

      <Section id="files" title="Your files and content">
        <p>
          You keep all rights to the files you process and the results you create. We claim no ownership of them and, for browser tools, never receive them. When
          tools that use our servers launch, files you send to them will be used only to produce your result and deleted within {f.serverFileHours} hours.
        </p>
        <p>You are responsible for the files you process: make sure you have the right to use and change them.</p>
      </Section>

      <Section id="use" title="Acceptable use">
        <p>Please don&apos;t:</p>
        <List>
          <li>use BerryPDF to break the law or to infringe anyone else&apos;s rights, including copyright and privacy;</li>
          <li>try to disrupt, overload or break the service, or get around its limits or security measures;</li>
          <li>use automated means to send large volumes of requests to the service;</li>
          <li>copy or resell the service itself, or pretend to be us.</li>
        </List>
        <p>We may block access for anyone who misuses the service.</p>
      </Section>

      <Section id="ours" title="Our site and open-source software">
        <p>
          The BerryPDF name, design and text belong to us. BerryPDF is built with open-source software, fonts and icons, each used under its own license. The{" "}
          <TextLink href="/licenses">open-source licenses</TextLink> page lists them, and nothing in these terms limits your rights under those licenses.
        </p>
      </Section>

      <Section id="warranty" title="No guarantee">
        <p>
          We provide BerryPDF free of charge and &quot;as is&quot;. PDF files vary a great deal, and although we test our tools carefully we can&apos;t promise that
          every result will be perfect or that the service will always be available. Keep your original files, and check results before you rely on them,
          especially for legal, financial or other important documents.
        </p>
      </Section>

      <Section id="liability" title="Limits on our liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, or for loss of data, profits or business, arising from your use of
          BerryPDF. Nothing in these terms limits liability that cannot legally be limited, or takes away rights you have as a consumer under the law where you
          live.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          We may update these terms, for example when new kinds of tools launch. We will post the new version here and change the date at the top. If you keep
          using BerryPDF after that, the new terms apply.
        </p>
      </Section>

      <Section id="law" title="Governing law">
        <p>
          These terms are governed by the laws of <Fill>governing law</Fill>, and disputes will be handled by the courts of <Fill>jurisdiction / courts</Fill>,
          unless the law where you live gives you the right to bring a claim there.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <Contact />
      </Section>
    </LegalPage>
  );
}
