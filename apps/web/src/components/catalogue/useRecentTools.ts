"use client";
import { useMemo, useSyncExternalStore } from "react";
import { readRecent, serverRecent, subscribeRecent, visibleRecent } from "@/lib/recent-tools";
import { useToolIndex } from "./ToolIndexProvider";
import { usable, type ToolIndexItem } from "./types";

/** Recently used usable tools, newest first (at most 6). Empty on the server and during hydration. */
export function useRecentTools(): ToolIndexItem[] {
  const { items } = useToolIndex();
  const list = useSyncExternalStore(subscribeRecent, readRecent, serverRecent);
  return useMemo(() => {
    const bySlug = new Map(items.map((i) => [i.slug, i]));
    return visibleRecent(list, (s) => {
      const item = bySlug.get(s);
      return !!item && usable(item);
    }).map((s) => bySlug.get(s)!);
  }, [items, list]);
}
