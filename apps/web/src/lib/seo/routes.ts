/**
 * Every indexable URL, in one place: the sitemap lists exactly these, and e2e checks each of
 * them against the SEO checklist (docs/process/workflow.md). A page is indexable when it does
 * its job: usable tools yes, coming-soon tools, noindex previews and placeholders no.
 */
import { isUsable, tools } from "@/tools/registry";

export type IndexableRoute = { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" };

export function indexableRoutes(): IndexableRoute[] {
  return [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    ...tools.filter((t) => isUsable(t) && !t.preview).map((t) => ({ path: `/${t.slug}`, priority: t.popularRank ? 0.9 : 0.8, changeFrequency: "monthly" as const })),
    ...["/privacy", "/terms", "/cookies", "/licenses"].map((path) => ({ path, priority: 0.2, changeFrequency: "yearly" as const })),
  ];
}
