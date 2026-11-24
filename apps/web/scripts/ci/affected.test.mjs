import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALWAYS, AREAS, CLOUD_SPECS, listSpecs, selectSpecs, specGroup } from "./affected.mjs";
import { buildMatrix, pack, ROW_KINDS, testCount } from "./plan.mjs";

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = join(webRoot, "../..");
const pick = (...changed) => selectSpecs({ repoRoot, changed });
const groups = (r) => [...new Set(r.specs.map(specGroup))].sort();

describe("affected specs", () => {
  it("runs no browser tests for docs, infra or unit tests", () => {
    const r = pick("docs/process/workflow.md", "infra/main.tf", "CLAUDE.md", "apps/web/src/lib/page-list.test.ts");
    expect(r.mode).toBe("none");
  });

  it("an engine (crates/) change runs the editor specs and the guards", () => {
    const r = pick("crates/berry-engine/src/lib.rs");
    expect(r.mode).toBe("some");
    expect(groups(r)).toEqual(expect.arrayContaining(["f16", "f24", "ui", "seo"]));
    expect(groups(r)).not.toContain("f3");
  });

  it("runs the full suite for build config, the root layout and what it imports", () => {
    for (const f of ["pnpm-lock.yaml", "apps/web/next.config.ts", ".github/workflows/ci.yml", "apps/web/src/app/layout.tsx", "apps/web/src/components/site/SiteHeader.tsx", "apps/web/src/app/globals.css", "apps/web/scripts/ci/affected.mjs"]) {
      expect(pick(f).mode, f).toBe("full");
    }
  });

  it("runs the full suite for a path it can't place", () => {
    expect(pick("apps/web/src/lib/nothing-imports-this.ts").mode).toBe("full");
    expect(pick("some-new-top-level/file.txt").mode).toBe("full");
  });

  it("an editor change runs the editor specs and the guards, not Merge", () => {
    const r = pick("apps/web/src/tools/editor/EditorShell.tsx");
    expect(r.mode).toBe("some");
    expect(groups(r)).toEqual(expect.arrayContaining(["f16", "ui", "seo", "q1"]));
    expect(groups(r)).not.toContain("f3");
  });

  it("the engine build in public/engine runs the editor specs", () => {
    const r = pick("apps/web/public/engine/berry_engine_bg.wasm");
    expect(groups(r)).toEqual(expect.arrayContaining(["f16", "f24"]));
    expect(groups(r)).not.toContain("f3");
  });

  it("a Merge change runs Merge, and not the editor", () => {
    const r = pick("apps/web/src/app/merge-pdf/page.tsx");
    expect(groups(r)).toContain("f3");
    expect(groups(r)).not.toContain("f16");
  });

  it("a removed asset runs the full suite; a removed module relies on its importers", () => {
    expect(pick("apps/web/public/fonts/forms/gone.woff").mode).toBe("full");
    expect(pick("apps/web/src/tools/editor/gone.ts", "apps/web/src/tools/editor/EditorShell.tsx").mode).toBe("some");
    // A removed route has no importers: the specs whose routes held it run.
    const r = pick("apps/web/src/app/edit-pdf/page.tsx", "apps/web/src/app/merge-pdf/page.tsx");
    expect(groups(r)).toEqual(expect.arrayContaining(["f16", "f3"]));
  });

  it("a changed spec runs itself", () => {
    const r = pick("apps/web/e2e/f3/pages.spec.ts");
    expect(r.specs).toContain("e2e/f3/pages.spec.ts");
    expect(r.specs).not.toContain("e2e/f3/edge.spec.ts");
  });

  it("a fixture runs the specs that name it", () => {
    const r = pick("apps/web/tests/fixtures/forms/form-extra.pdf");
    expect(r.mode).toBe("some");
    expect(groups(r)).toContain("f16");
  });

  it("every spec folder is mapped to its routes or runs always", () => {
    const dirs = readdirSync(join(webRoot, "e2e"), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "support");
    for (const d of dirs) expect(d.name in AREAS || ALWAYS.includes(d.name), `e2e/${d.name} needs an entry in AREAS`).toBe(true);
    for (const area of Object.values(AREAS)) for (const p of area) expect(existsSync(join(webRoot, p)), p).toBe(true);
  });

  it("every cloud spec path exists", () => {
    const specs = listSpecs(webRoot);
    for (const c of CLOUD_SPECS) expect(specs.some((s) => s === c || s.startsWith(c)), c).toBe(true);
  });

  it("no spec path matches another spec as a Playwright filter", () => {
    const specs = listSpecs(webRoot);
    for (const a of specs) {
      const re = new RegExp(a);
      expect(specs.filter((b) => re.test(b)), a).toEqual([a]);
    }
  });
});

describe("shard plan", () => {
  it("counts @serial tags on the title or in options, also on the next line", () => {
    const src = 'test("a", async () => {});\ntest("b", { tag: "@serial" }, async () => {});\ntest(\n  "c",\n  { tag: "@serial" },\n  async () => {},\n);\n';
    expect(testCount(src, true)).toBe(2);
    expect(testCount(src, false)).toBe(1);
  });

  it("packs heavy files apart", () => {
    const bins = pack(
      [
        { spec: "a", weight: 100 },
        { spec: "b", weight: 90 },
        { spec: "c", weight: 10 },
        { spec: "d", weight: 10 },
      ],
      2,
    );
    expect(bins.map((b) => b.total).sort()).toEqual([100, 110]);
  });

  it("covers every selected spec in every row kind it belongs to", () => {
    const timings = JSON.parse(readFileSync(join(webRoot, "e2e/timings.json"), "utf8"));
    const specs = listSpecs(webRoot);
    const rows = buildMatrix(specs, timings);
    for (const kind of ROW_KINDS.filter((k) => k.bucket !== "serial")) {
      const files = rows.filter((r) => r.name === kind.key || r.name.startsWith(`${kind.key} `)).flatMap((r) => r.files.split(" "));
      const want = specs.filter((s) => !kind.cloud || CLOUD_SPECS.some((c) => s === c || s.startsWith(c)));
      // Files whose every test is @serial may be left out of the parallel rows.
      const allSerial = (s) => testCount(readFileSync(join(webRoot, s), "utf8"), false) === 0;
      expect(want.filter((s) => !files.includes(s) && !allSerial(s)), kind.key).toEqual([]);
      expect(new Set(files).size, `${kind.key}: a file in two shards`).toBe(files.length);
    }
    for (const r of rows) expect(r.files.length).toBeGreaterThan(0);
  });
});
