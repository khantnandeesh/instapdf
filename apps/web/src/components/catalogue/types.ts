import type { ReactNode } from "react";
import type { Tool, ToolCategory } from "@/tools/registry";

/** Slim, serializable view of a registry tool for client islands (spec F2 H-5). */
export type ToolIndexItem = {
  slug: string;
  name: string;
  summary: string;
  category: ToolCategory;
  status: Tool["status"];
  runtime: Tool["runtime"];
  keywords: string[];
  popularRank?: number;
  /** Pre-rendered on the server (tool icons never ship as JS). */
  icon: ReactNode;
};

export type CategoryInfo = { id: ToolCategory; label: string };

export type ToolIndex = { items: ToolIndexItem[]; categories: CategoryInfo[] };

export const usable = (item: Pick<ToolIndexItem, "status">) => item.status !== "planned";

/** The home page's search field; the "/" shortcut focuses it when present (AC-61). */
export const CATALOGUE_SEARCH_ID = "catalogue-search";
