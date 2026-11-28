// Picks the Playwright specs a change can affect, so PR checks run only those (the full suite runs
// on main when a PR was behind, and every night). The rule is conservative: anything this file
// can't place runs the full suite.
//
// How a changed file is placed:
// 1. Ignored: paths no browser test reads (docs, infra, other workflows, unit tests).
//    The Rust engine (crates/) runs the editor specs (OUTSIDE below), though it reaches the app only
//    through apps/web/public/engine/.
// 2. Full suite: build and test configuration, the root layout and everything it imports (it is on
//    every page), styles, middleware, build scripts, and this planner itself.
// 3. A spec file or its own helpers: that spec.
// 4. Source: every spec whose "reach" contains the file. A spec's reach is the import closure of the
//    spec itself plus the routes its folder visits (AREAS below), found by following import,
//    import(), require() and new URL(..., import.meta.url) through the source tree.
// 5. A fixture: the specs that name it; if none names it (built names like `${name}`), full suite.
// 6. Anything else: full suite.
//
// Guards that visit every page (ALWAYS) run whenever any app file changes.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Repo-relative prefixes that no browser test depends on. */
export const IGNORED = [
  "docs/",
  "infra/",
  "services/",
  "tests/parity/",
  ".claude/",
  ".github/workflows/engine.yml",
  ".github/workflows/deploy-staging.yml",
  ".github/workflows/deploy-prod.yml",
  ".github/workflows/publish-fonts.yml",
  ".github/scripts/smoke-test.sh",
  ".github/pull_request_template.md",
  "apps/web/Dockerfile",
  "apps/web/e2e/timings.json", // only decides how specs are packed into machines
];
/** Repo-relative file patterns that no browser test depends on. */
const IGNORED_FILES = [
  /^[^/]+\.md$/, // CLAUDE.md, README.md at the root
  /^apps\/web\/src\/.*\.test\.ts$/, // unit tests run in the checks job
  /^apps\/web\/scripts\/.*\.test\.mjs$/,
  /^apps\/web\/src\/.*\.d\.ts$/, // types only: the typecheck covers them
  /^apps\/web\/src\/(.*\/)?__fixtures__\//, // unit-test fixtures
];

/** Repo-relative prefixes whose change runs the full suite. */
export const GLOBAL = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".github/workflows/ci.yml",
  "apps/web/package.json",
  "apps/web/next.config.ts",
  "apps/web/playwright.config.ts",
  "apps/web/tsconfig.json",
  "apps/web/postcss.config.mjs",
  "apps/web/eslint.config.mjs",
  "apps/web/src/middleware.ts",
  "apps/web/src/styles/",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/globals.css",
  "apps/web/scripts/",
  "apps/web/licenses/",
  "apps/web/THIRD-PARTY-NOTICES.md",
];

/**
 * The routes each spec folder visits, as app paths (folders count whole). A spec's own imports are
 * added on top. Keep this in step with the `goto(...)` calls in each folder; a folder missing here
 * fails the unit test.
 */
export const AREAS = {
  f1: ["src/app/rotate-pdf/"],
  f2: ["src/app/page.tsx", "src/app/[slug]/", "src/app/not-found.tsx", "src/app/(info)/", "src/app/rotate-pdf/", "src/app/merge-pdf/"],
  f3: ["src/app/merge-pdf/", "src/app/[slug]/", "src/app/page.tsx"],
  f16: ["src/app/edit-pdf/", "src/app/page.tsx", "src/app/sitemap.ts", "public/engine/"],
  f23: ["src/app/cloud/", "src/app/cloud-mock/", "src/app/merge-pdf/", "src/app/rotate-pdf/", "src/app/edit-pdf/"],
  f24: ["src/app/edit-pdf/", "public/engine/"],
  f5: ["src/app/organize-pdf/", "src/app/combine-reorder-pdf/", "src/app/alternate-mix-pdf/", "src/app/merge-pdf/"],
  f4: ["src/app/split-pdf/", "src/app/extract-pdf-pages/", "src/app/delete-pdf-pages/"],
  f11: ["src/app/protect-pdf/", "src/app/unlock-pdf/"],
  f7: ["src/app/split-pdf-by-bookmarks/", "src/app/split-pdf-by-size/", "src/app/split-pdf-by-text/", "src/app/split-pdf-in-half/"],
  f8: ["src/app/crop-pdf/", "src/app/resize-pdf/", "src/app/flip-pdf/", "src/app/n-up-pdf/"],
  f12: ["src/app/pdf-to-jpg/", "src/app/jpg-to-pdf/", "src/app/pdf-to-text/", "src/app/extract-images/"],
};
/** Paths outside apps/web and the spec folders they run. */
export const OUTSIDE = { "crates/": ["f16", "f24"] };

/** Spec folders (or files) that visit every page: they run whenever any app file changes. */
export const ALWAYS = ["ui", "seo", "q1", "smoke.spec.ts"];

/** The specs the cloud rows run (the build with cloud sources on, ci.yml). */
export const CLOUD_SPECS = ["e2e/f23/", "e2e/q1/csp.spec.ts", "e2e/f1/", "e2e/f3/", "e2e/f5/", "e2e/ui/", "e2e/seo/"];

const EXT = [".ts", ".tsx", ".mjs", ".js", ".json", ".css"];
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew URL\(\s*)["'`]([^"'`$\n]+)["'`]/g;

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const walk = (d) =>
  isDir(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : [];

/** The import graph of the web app, rooted at apps/web (absolute paths in, absolute paths out). */
export function importGraph(webRoot) {
  const memo = new Map();
  const resolveSpec = (spec, from) => {
    let base;
    if (spec.startsWith("@/")) base = join(webRoot, "src", spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null; // a package: its changes show up in the lockfile (full suite)
    if (isFile(base)) return base;
    for (const e of EXT) if (isFile(base + e)) return base + e;
    if (isDir(base)) {
      for (const e of EXT) if (isFile(join(base, `index${e}`))) return join(base, `index${e}`);
      return base.endsWith(sep) ? base : base + sep; // a folder read at run time (public/engine/)
    }
    return null;
  };
  const deps = (file) => {
    if (memo.has(file)) return memo.get(file);
    const out = [];
    if (!file.endsWith(sep) && /\.(tsx?|mjs|js|css)$/.test(file)) {
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
        const r = resolveSpec(m[1], file);
        if (r) out.push(r);
      }
    }
    memo.set(file, out);
    return out;
  };
  /** Every file (and run-time folder) reachable from the entries. A folder entry means all files in it. */
  const closure = (entries) => {
    const seen = new Set();
    const stack = entries.flatMap((e) => (isDir(e) ? [...walk(e), e.endsWith(sep) ? e : e + sep] : [e]));
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      for (const d of deps(f)) stack.push(d);
    }
    return seen;
  };
  return { closure };
}

/** All spec files, repo-relative (apps/web/e2e/...). */
export function listSpecs(webRoot) {
  return walk(join(webRoot, "e2e"))
    .filter((f) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(f)) // Playwright's default testMatch
    .map((f) => relative(webRoot, f).split(sep).join("/"))
    .sort();
}

/** The spec's folder under e2e/ ("f16"), or its file name for a spec at the top ("smoke.spec.ts"). */
export const specGroup = (spec) => spec.replace(/^e2e\//, "").split("/")[0];

/**
 * @param {{ repoRoot: string, changed: string[] }} input  changed paths, repo-relative
 * @returns {{ mode: "none" | "some" | "full", specs: string[], reasons: string[] }}
 *   specs are relative to apps/web ("e2e/f16/editor-e1.spec.ts"); for "full" they list every spec.
 */
export function selectSpecs({ repoRoot, changed }) {
  const webRoot = join(repoRoot, "apps/web");
  const all = listSpecs(webRoot);
  const graph = importGraph(webRoot);
  const reasons = [];
  const full = (why) => ({ mode: "full", specs: all, reasons: [...reasons, why] });

  const relevant = changed.filter(
    (f) => !IGNORED.some((p) => f === p || f.startsWith(p)) && !IGNORED_FILES.some((re) => re.test(f)),
  );
  if (relevant.length === 0) return { mode: "none", specs: [], reasons: ["only files no browser test reads changed"] };

  const globalHit = relevant.find((f) => GLOBAL.some((p) => f === p || f.startsWith(p)));
  if (globalHit) return full(`${globalHit} is shared by every page or configures the build`);

  const toAbs = (f) => join(repoRoot, f);
  const layout = graph.closure([join(webRoot, "src/app/layout.tsx")]);
  const reach = new Map();
  for (const spec of all) {
    const area = AREAS[specGroup(spec)] ?? [];
    reach.set(spec, graph.closure([join(webRoot, spec), ...area.map((a) => join(webRoot, a))]));
  }
  const inReach = (set, abs) => set.has(abs) || [...set].some((p) => p.endsWith(sep) && abs.startsWith(p));

  const picked = new Set();
  for (const f of relevant) {
    const abs = toAbs(f);
    const outside = Object.entries(OUTSIDE).find(([p]) => f.startsWith(p));
    if (outside) {
      const hits = all.filter((s) => outside[1].includes(specGroup(s)));
      hits.forEach((s) => picked.add(s));
      reasons.push(`${f}: ${outside[1].join(", ")}`);
      continue;
    }
    if (!f.startsWith("apps/web/")) return full(`${f} is outside the web app and not known to be safe`);
    if (layout.has(abs)) return full(`${f} is imported by the root layout (every page)`);
    if (f.startsWith("apps/web/tests/fixtures/")) {
      const name = f.split("/").pop();
      // The spec and the e2e helpers it imports.
      const e2eDir = join(webRoot, "e2e") + sep;
      const naming = all.filter((s) =>
        [...reach.get(s)].some((x) => x.startsWith(e2eDir) && isFile(x) && readFileSync(x, "utf8").includes(name)),
      );
      if (naming.length === 0) return full(`fixture ${name} is not named in any spec`);
      naming.forEach((s) => picked.add(s));
      reasons.push(`${f}: ${naming.length} spec(s) name it`);
      continue;
    }
    if (!existsSync(abs)) {
      // A removed module: whatever imported it changed too (or the build fails). A removed asset
      // can be fetched by URL from anywhere, so it runs everything.
      if (!/^apps\/web\/src\/.*\.(tsx?|mjs|js|css)$/.test(f)) return full(`${f} was removed and may be fetched by URL`);
      // A removed route or module inside a spec's routes (folders match by prefix) runs that spec.
      const hits = all.filter((s) => inReach(reach.get(s), abs));
      hits.forEach((s) => picked.add(s));
      reasons.push(`${f}: removed${hits.length ? `, ${hits.length} spec(s)` : ""}`);
      continue;
    }
    const hits = all.filter((s) => inReach(reach.get(s), abs));
    if (hits.length === 0) return full(`${f} is not reached from any spec or route`);
    hits.forEach((s) => picked.add(s));
    reasons.push(`${f}: ${hits.length} spec(s)`);
  }
  if (picked.size === 0 && reasons.every((r) => r.includes(": removed"))) return full("only removals, nothing to place them by");
  for (const s of all) if (ALWAYS.includes(specGroup(s))) picked.add(s);
  if (picked.size === all.length) return { mode: "full", specs: all, reasons };
  return { mode: "some", specs: all.filter((s) => picked.has(s)), reasons };
}
