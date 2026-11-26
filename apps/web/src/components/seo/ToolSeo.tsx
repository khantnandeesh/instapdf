import Link from "next/link";
import { ToolChip } from "@/components/catalogue/ToolCard";
import { buildToolIndex } from "@/components/catalogue/toolIndex";
import { usable } from "@/components/catalogue/types";
import { breadcrumbLd, faqLd, howToLd, webApplicationLd } from "@/lib/seo/jsonld";
import type { Tool } from "@/tools/registry";
import { seoContent } from "@/tools/seo";
import { JsonLd } from "./JsonLd";
import "./tool-guide.css";

/**
 * The search-facing part of a tool page (docs/seo/strategy.md, "Tool pages"): structured data
 * plus a quiet guide below the tool: a breadcrumb, the how-to steps, the FAQ (answers folded
 * in <details>, still in the HTML for crawlers) and links to related usable tools. Nothing here
 * sits above or inside the tool flow, so the tool keeps the owner's minimal-text rule.
 */
export function ToolSeo({ tool }: { tool: Tool }) {
  const content = seoContent[tool.slug];
  const name = tool.flow?.title ?? tool.name;
  const crumbs = [
    { name: "BerryPDF", path: "/" },
    { name, path: `/${tool.slug}` },
  ];
  const related = content
    ? content.related.flatMap((slug) => buildToolIndex().items.filter((i) => i.slug === slug && usable(i)))
    : [];

  return (
    <>
      <JsonLd data={[webApplicationLd(tool, name), breadcrumbLd(crumbs), ...(content ? [howToLd(content.howTo, content), faqLd(content)] : [])]} />
      {content && (
        <section className="mp-guide" aria-labelledby="guide-howto" data-testid="tool-guide">
          <nav aria-label="Breadcrumb" className="mp-guide__crumbs">
            <Link href="/" prefetch={false}>
              BerryPDF
            </Link>
            <span aria-hidden="true"> › </span>
            <span aria-current="page">{name}</span>
          </nav>
          <h2 id="guide-howto">{content.howTo}</h2>
          <ol className="mp-guide__steps">
            {content.steps.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
          <h2 id="guide-faq">Questions</h2>
          <div className="mp-guide__faq">
            {content.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          {related.length > 0 && (
            <>
              <h2 id="guide-related">Related tools</h2>
              <ul className="flex flex-wrap gap-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <ToolChip item={item} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
