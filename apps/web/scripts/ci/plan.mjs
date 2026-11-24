// CI planner (.github/workflows/ci.yml, job "plan"). Decides what this run tests and writes the
// e2e matrix to $GITHUB_OUTPUT:
//
// - pull_request: lint, typecheck, unit tests and the build always run; the browser tests are the
//   specs the change can affect (affected.mjs). The label "full-ci" runs everything.
// - push to main: if the PR that made this commit was up to date with main (same tree as the PR's
//   head) and its CI passed, that run already tested exactly this code: nothing runs again and the
//   staging deploy starts at once. Otherwise the full suite runs (or none for docs-only pushes).
// - schedule, workflow_dispatch: the full suite (the nightly safety net for the selection).
//
// Browser specs are packed into shards by their measured time (e2e/timings.json), so each machine
// finishes at about the same moment.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLOUD_SPECS, listSpecs, selectSpecs } from "./affected.mjs";

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = join(webRoot, "../..");

/** Seconds of test time a machine should hold (per worker), before the fixed ~1.5 min of setup. */
export const TARGET_SECONDS = 180;

/** The kinds of e2e rows. Cloud rows build the app with cloud sources and the mock provider on. */
export const ROW_KINDS = [
  { key: "desktop", bucket: "desktop", args: ["--project", "desktop", "--grep-invert", "@serial"], workers: 3, maxShards: 5 },
  { key: "mobile", bucket: "mobile", args: ["--project", "mobile", "--grep-invert", "@serial"], workers: 3, maxShards: 4 },
  // Wall-clock limits and heavy loads: one worker, so no other test's load decides their result.
  { key: "serial", bucket: "serial", args: ["--grep", "@serial"], workers: 1, maxShards: 4 },
  { key: "cloud desktop", bucket: "desktop", cloud: true, args: ["--project", "desktop", "--grep-invert", "@serial"], workers: 3, maxShards: 4 },
  { key: "cloud mobile", bucket: "mobile", cloud: true, args: ["--project", "mobile", "--grep-invert", "@serial"], workers: 3, maxShards: 4 },
  { key: "cloud serial", bucket: "serial", cloud: true, args: ["--grep", "@serial"], workers: 1, maxShards: 3 },
];

/** Tests declared in a spec file, by whether their line carries the @serial tag. */
export const testCount = (src, serial) =>
  [...src.matchAll(/^\s*test(?:\.(?:only|fixme))?\(.*$/gm)].filter((m) => m[0].includes("@serial") === serial).length +
  (serial ? 0 : [...src.matchAll(/^\s*for \(/gm)].length * 2); // a loop of tests: guess a few

/**
 * Estimated seconds for a spec file in a bucket: measured when known, else from its test count.
 * Whether a file belongs in a bucket comes from its source, never from old timings, so a test
 * added to a file always runs; 0 means the file has no tests for that bucket.
 */
export function estimate(timings, bucket, spec) {
  const src = readFileSync(join(webRoot, spec), "utf8");
  const serial = bucket === "serial";
  const count = testCount(src, serial);
  if (count === 0) return 0;
  const known = timings[bucket]?.[spec];
  // Measured in CI on 24 Nov: about 3 s of worker time per test, 15 s per @serial test and project.
  const guess = serial ? 30 * count : 3 * count;
  return Math.max(1, typeof known === "number" ? known : guess);
}

/** Longest-processing-time-first packing of weighted items into n bins. */
export function pack(items, n) {
  const bins = Array.from({ length: n }, () => ({ total: 0, longest: 0, items: [] }));
  for (const it of [...items].sort((a, b) => b.weight - a.weight || a.spec.localeCompare(b.spec))) {
    const bin = bins.reduce((min, b) => (b.total < min.total ? b : min), bins[0]);
    bin.items.push(it.spec);
    bin.total += it.weight;
    bin.longest = Math.max(bin.longest, it.weight);
  }
  return bins.filter((b) => b.items.length > 0);
}

/** The e2e matrix rows for a list of selected specs. */
export function buildMatrix(specs, timings) {
  const rows = [];
  for (const kind of ROW_KINDS) {
    const files = specs.filter((s) => !kind.cloud || CLOUD_SPECS.some((c) => s === c || s.startsWith(c)));
    const items = files.map((spec) => ({ spec, weight: estimate(timings, kind.bucket, spec) })).filter((i) => i.weight > 0);
    if (items.length === 0) continue;
    const total = items.reduce((s, i) => s + i.weight, 0);
    // Per machine its workers share the files (a file's tests stay on one worker).
    const n = Math.min(kind.maxShards, items.length, Math.max(1, Math.ceil(total / kind.workers / TARGET_SECONDS)));
    const bins = pack(items, n);
    bins.forEach((bin, i) => {
      rows.push({
        name: bins.length > 1 ? `${kind.key} ${i + 1}/${bins.length}` : kind.key,
        cloud: kind.cloud ? "1" : "",
        // The first-load JS budgets on the cloud build run once, on its first desktop row.
        budget: kind.key === "cloud desktop" && i === 0,
        args: [...kind.args, "--workers", String(kind.workers)].join(" "),
        files: bin.items.join(" "),
        estimate: Math.round(Math.max(bin.total / kind.workers, bin.longest)),
      });
    });
  }
  return rows;
}

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const changedBetween = (a, b) => git("diff", "--name-only", a, b).split("\n").filter(Boolean);

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status}`);
  return res.json();
}

/**
 * Push to main: was this exact tree already tested green as a PR? True when the commit came from a
 * merged PR whose head has the same tree (the PR was up to date with main) and CI passed on that head.
 */
async function alreadyTested(sha) {
  const pulls = await gh(`/commits/${sha}/pulls`);
  const pr = pulls.find((p) => p.merged_at && p.base?.ref === "main");
  if (!pr) return { ok: false, why: "no merged PR for this commit" };
  const head = pr.head.sha;
  const [mine, theirs] = await Promise.all([gh(`/git/commits/${sha}`), gh(`/git/commits/${head}`)]);
  if (mine.tree.sha !== theirs.tree.sha) return { ok: false, why: `PR #${pr.number} was behind main when it merged` };
  const runs = await gh(`/actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request&status=success&per_page=1`);
  if (!runs.total_count) return { ok: false, why: `PR #${pr.number} has no green CI run on its head ${head.slice(0, 7)}` };
  return { ok: true, why: `PR #${pr.number} tested this exact tree (head ${head.slice(0, 7)}, run ${runs.workflow_runs[0].html_url})` };
}

async function main() {
  const event = process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch";
  const timings = JSON.parse(readFileSync(join(webRoot, "e2e/timings.json"), "utf8"));
  const labels = JSON.parse(process.env.PR_LABELS || "null") ?? [];
  let scope; // verified | none | some | full
  let specs = [];
  const notes = [];

  if (event === "pull_request") {
    if (labels.includes("full-ci")) {
      scope = "full";
      notes.push('label "full-ci"');
    } else {
      // The checkout is the PR merged into its base: HEAD^1 is the base, so this is what the PR adds.
      const sel = selectSpecs({ repoRoot, changed: changedBetween("HEAD^1", "HEAD") });
      scope = sel.mode;
      notes.push(...sel.reasons);
      if (scope === "some") specs = sel.specs;
    }
  } else if (event === "push") {
    const sha = process.env.GITHUB_SHA;
    let tested = { ok: false, why: "check skipped" };
    try {
      tested = await alreadyTested(sha);
    } catch (e) {
      tested = { ok: false, why: `could not check (${e.message})` };
    }
    notes.push(tested.why);
    if (tested.ok) scope = "verified";
    else {
      const before = process.env.BEFORE ?? "";
      let changed = null;
      try {
        if (before && !/^0+$/.test(before)) changed = changedBetween(before, sha);
      } catch {
        changed = null; // the old commit isn't here (force push): test everything
      }
      scope = changed && selectSpecs({ repoRoot, changed }).mode === "none" ? "none" : "full";
    }
  } else {
    scope = "full";
    notes.push(`${event}: full suite`);
  }
  if (scope === "full") specs = listSpecs(webRoot);

  const matrix = scope === "verified" || scope === "none" ? [] : buildMatrix(specs, timings);
  const out = { scope, checks: scope === "verified" ? "skip" : "run", matrix: JSON.stringify({ include: matrix }), e2e: matrix.length > 0 ? "run" : "skip" };
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(""));

  const summary = [
    `### CI plan: ${scope}`,
    "",
    ...notes.slice(0, 40).map((n) => `- ${n}`),
    "",
    matrix.length ? `${specs.length} spec files on ${matrix.length} machines:` : "No browser tests in this run.",
    "",
    ...matrix.map((r) => `- **${r.name}** (about ${Math.round(r.estimate / 60)} min): ${r.files.split(" ").length} files`),
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  console.log(summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
