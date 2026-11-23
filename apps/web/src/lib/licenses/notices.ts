/**
 * Reads the third-party notice summary that scripts/licenses.mjs writes at build time
 * (.generated/licenses.json). Server-only: the /licenses page is prerendered, so this
 * runs during `next build`, never per request.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type NoticeEntry = {
  kind: "package" | "font" | "asset";
  name: string;
  version: string;
  license: string | null;
  copyright: string[];
  author: string | null;
  homepage: string | null;
  hasNotice: boolean;
  /** Set when the package is accepted as a reviewed exception to the allow-list. */
  exception: string | null;
};

export function readNotices(): NoticeEntry[] {
  const file = join(process.cwd(), ".generated", "licenses.json");
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { entries: NoticeEntry[] }).entries;
  } catch (error) {
    throw new Error("Missing .generated/licenses.json: run `node scripts/licenses.mjs` (the build does this first).", { cause: error });
  }
}
