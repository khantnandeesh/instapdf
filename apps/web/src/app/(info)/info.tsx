import type { Metadata } from "next";
import { infoPages, type InfoSlug } from "@/components/site/copy";
import { PlaceholderPage } from "@/components/site/pages";

/** Footer placeholder page (About, Help, Security until F21 writes them): 200, noindex. */
export function infoPage(slug: InfoSlug) {
  const title = infoPages[slug];
  const metadata: Metadata = { title: `${title} · InstaPDF`, robots: { index: false } };
  function Page() {
    return <PlaceholderPage title={title} />;
  }
  return { metadata, Page };
}
