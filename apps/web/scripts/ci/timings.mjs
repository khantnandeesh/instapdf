// Refreshes e2e/timings.json from Playwright JSON reports, so the CI planner (plan.mjs) packs shards
// by real durations. The nightly full run uploads its reports as the "e2e-timings" artifact:
//   node scripts/ci/timings.mjs report-*.json
// Seconds per spec file and bucket (desktop, mobile, serial = every @serial test of the file, both
// projects). Files not in any report keep their old numbers.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../../e2e/timings.json", import.meta.url));

/** Adds one report's durations (last attempt of each test) into `acc`. */
export function collect(report, acc = { desktop: {}, mobile: {}, serial: {} }) {
  const visit = (suite, file) => {
    const f = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.at(-1);
        if (!last) continue;
        const tags = [...(spec.tags ?? []), ...(t.tags ?? [])].map((x) => x.replace(/^@/, ""));
        const serial = spec.title.includes("@serial") || tags.includes("serial");
        const bucket = serial ? "serial" : t.projectName;
        if (!acc[bucket]) continue;
        const key = `e2e/${spec.file ?? f}`;
        acc[bucket][key] = (acc[bucket][key] ?? 0) + last.duration / 1000;
      }
    }
    for (const s of suite.suites ?? []) visit(s, f);
  };
  for (const s of report.suites ?? []) visit(s, s.file);
  return acc;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fresh = { desktop: {}, mobile: {}, serial: {} };
  for (const p of process.argv.slice(2)) collect(JSON.parse(readFileSync(p, "utf8")), fresh);
  let old = {};
  try {
    old = JSON.parse(readFileSync(out, "utf8"));
  } catch {}
  const merged = {};
  for (const b of ["desktop", "mobile", "serial"]) {
    const m = { ...(old[b] ?? {}) };
    for (const [k, v] of Object.entries(fresh[b])) m[k] = Math.round(v);
    merged[b] = Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)));
  }
  writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
  console.log(`timings: ${Object.values(fresh).reduce((n, b) => n + Object.keys(b).length, 0)} file entries updated`);
}
