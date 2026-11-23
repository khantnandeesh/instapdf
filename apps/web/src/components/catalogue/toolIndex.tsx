import { categories, tools } from "@/tools/registry";
import { ToolIcon } from "@/tools/tool-icons";
import type { ToolIndex, ToolIndexItem } from "./types";

/** Server only: builds the slim tool list with pre-rendered icons. */
export function buildToolIndex(): ToolIndex {
  const items: ToolIndexItem[] = tools.map((t) => ({
    slug: t.slug,
    name: t.name,
    summary: t.summary,
    category: t.category,
    status: t.status,
    runtime: t.runtime,
    keywords: t.keywords,
    ...(t.popularRank !== undefined ? { popularRank: t.popularRank } : {}),
    icon: <ToolIcon name={t.icon} size={20} />,
  }));
  return { items, categories };
}
