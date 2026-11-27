/**
 * One-off guard (owner rule 2026-11-27: one shared component per repeated UI element).
 *
 * Counts hand-rolled copies of shared controls per file and compares them with one-off-baseline.json.
 * A count may only go down: a new raw <button>, dialog, menu, inline icon or page tile outside the
 * shared components fails here and names the component to use instead. When a clean-up lowers a
 * count, lower the baseline with `UPDATE_UI_BASELINE=1 pnpm test one-off-guard` and commit it.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../..");
const BASELINE = join(__dirname, "one-off-baseline.json");

type Rule = { id: string; pattern: RegExp; allow: RegExp; use: string };

const RULES: Rule[] = [
  {
    id: "raw-button",
    pattern: /<button\b/g,
    allow: /^components\/(ui|tile)\//,
    use: "Button, IconButton, LinkButton, SegmentedControl or MenuButton from components/ui",
  },
  {
    id: "own-dialog-or-menu",
    pattern: /role="(dialog|alertdialog|menu)"|<dialog\b/g,
    allow: /^components\/ui\//,
    use: "Dialog, Popover or Menu from components/ui",
  },
  {
    id: "inline-svg",
    pattern: /<svg\b/g,
    allow: /^components\/ui\/|[Ii]cons?\.tsx$|[Mm]arks?\.tsx$|^components\/berry\//,
    use: "an icon from components/ui/icons or page-tool-icons (add new ones through scripts/gen-tool-icons.mjs)",
  },
  {
    id: "own-page-tile",
    pattern: /bg-paper shadow-paper|absolute inset-0 rounded-\[10px\]/g,
    allow: /^components\/tile\//,
    use: "TilePage, TileHit and the other parts in components/tile/parts",
  },
];

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith(".tsx") && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function count(): Record<string, Record<string, number>> {
  const found: Record<string, Record<string, number>> = Object.fromEntries(RULES.map((r) => [r.id, {}]));
  for (const file of sources(SRC).sort()) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    for (const r of RULES) {
      if (r.allow.test(rel)) continue;
      const n = text.match(r.pattern)?.length ?? 0;
      if (n) found[r.id][rel] = n;
    }
  }
  return found;
}

describe("one-off guard", () => {
  const found = count();
  if (process.env.UPDATE_UI_BASELINE === "1") writeFileSync(BASELINE, JSON.stringify(found, null, 2) + "\n");
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, Record<string, number>>;

  for (const r of RULES) {
    it(`${r.id}: no new one-off copies`, () => {
      const grew = Object.entries(found[r.id])
        .filter(([file, n]) => n > (baseline[r.id]?.[file] ?? 0))
        .map(([file, n]) => `${file}: ${n} (allowed ${baseline[r.id]?.[file] ?? 0}). Use ${r.use}.`);
      expect(grew).toEqual([]);
    });

    it(`${r.id}: the baseline is not stale`, () => {
      const shrank = Object.entries(baseline[r.id] ?? {})
        .filter(([file, n]) => (found[r.id][file] ?? 0) < n)
        .map(([file, n]) => `${file}: now ${found[r.id][file] ?? 0}, baseline ${n}. Run UPDATE_UI_BASELINE=1 pnpm test one-off-guard.`);
      expect(shrank).toEqual([]);
    });
  }
});
