import { zipSync } from "fflate";
import { uniqueNames } from "./naming";

export type ZipEntry = { name: string; bytes: Uint8Array };

/**
 * Packs entries into a ZIP. PDFs are already compressed, so entries are
 * stored (level 0), which is fast and keeps the size predictable.
 * Duplicate names get " (2)", " (3)"...
 */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const names = uniqueNames(entries.map((e) => e.name));
  const tree: Record<string, [Uint8Array, { level: 0 }]> = {};
  entries.forEach((e, i) => {
    tree[names[i]] = [e.bytes, { level: 0 }];
  });
  // Fixed timestamp: the output does not leak when the file was made.
  return zipSync(tree, { mtime: new Date("2000-01-01T00:00:00Z") });
}
