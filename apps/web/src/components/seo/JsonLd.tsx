import { jsonLdString } from "@/lib/seo/jsonld";

/**
 * Structured data as an inline JSON-LD data block. Browsers never execute it, so the strict CSP
 * (script-src with hashes) does not apply; scripts/csp-manifest.mjs skips data blocks.
 */
export function JsonLd({ data }: { data: Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
