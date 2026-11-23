import { recentPrepaintScript } from "@/lib/recent-tools";
import { isUsable, tools } from "@/tools/registry";

/** Inline <head> script: reserves the home Recent row before first paint (spec F2 H-10). */
export function RecentPrepaintScript() {
  const usable = tools.filter(isUsable).map((t) => t.slug);
  return <script dangerouslySetInnerHTML={{ __html: recentPrepaintScript(usable) }} />;
}
