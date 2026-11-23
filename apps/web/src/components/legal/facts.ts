/**
 * Product facts quoted by the legal pages. Kept next to the code they describe so a
 * change here is a prompt to re-read /privacy, /terms and /cookies.
 */
import { RECENT_KEY, RECENT_STORED_MAX } from "@/lib/recent-tools";

export const legalFacts = {
  hosting: "Google Cloud",
  region: "us-central1 (Iowa, United States)",
  /** Server tools (none live yet) delete uploaded files within this many hours. */
  serverFileHours: 2,
  /** Google Cloud Logging's default retention for request logs; infra/ does not change it. */
  logRetentionDays: 30,
  recentKey: RECENT_KEY,
  recentMax: RECENT_STORED_MAX,
  /** sessionStorage key for the thumbnail-size slider (ToolFlow.tsx). */
  thumbKey: "ip-thumb-size",
} as const;
