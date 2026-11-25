// Guard for CLAUDE.md rule 1 and docs/process/workflow.md "Reference (Sejda) runs":
// raw evaluation evidence (Sejda outputs, screenshots, recordings, network and Lighthouse logs)
// lives in /mnt/project-files/evals-cache/<feature>/, never in git. docs/evals/cache/<feature>/
// may hold only our own text: manifest.json, notes and the scripts that drove the runs.
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(
  new URL("../../../../docs/evals/cache/", import.meta.url),
);
const ALLOWED = new Set([".md", ".cjs", ".mjs", ".js", ".py", ".sh"]);

function walk(dir) {
  let out = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

describe("docs/evals/cache holds no raw evidence", () => {
  it("only manifests, notes and run scripts are committed", () => {
    const bad = walk(ROOT)
      .map((p) => relative(ROOT, p))
      .filter(
        (rel) =>
          !rel.endsWith("/manifest.json") &&
          rel !== "manifest.json" &&
          !ALLOWED.has(extname(rel).toLowerCase()),
      );
    expect(
      bad,
      "move these to /mnt/project-files/evals-cache/<feature>/ and list their hashes in manifest.json",
    ).toEqual([]);
  });
});
