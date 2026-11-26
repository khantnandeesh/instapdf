import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planDelete, planSplit } from "@/lib/page-plans";
import { documentsJob as engineJob } from "@/lib/pdf/jobs";
import { documentsJob } from "@/lib/pdf/documents-job";

const files = [
  { id: "a", name: "twelve.pdf", pageCount: 12, source: new Blob(["a"]) },
  { id: "b", name: "three-pages.pdf", pageCount: 3, source: new Blob(["b"]), password: "pw" },
];

describe("documentsJob (the page's job builder)", () => {
  it("is the engine's documentsJob, one implementation (no drift)", () => {
    expect(documentsJob).toBe(engineJob);
  });

  it("imports types only, so a tool page can use it without the PDF engine in its first load", () => {
    const src = readFileSync(join(__dirname, "../../lib/pdf/documents-job.ts"), "utf8");
    const imports = src.split("\n").filter((l) => /^import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l).toMatch(/^import type /);
  });

  it("sends only the sources a document uses, with the bookmark option", () => {
    const split = planSplit(files, { mode: { kind: "everyN", n: 5 }, date: new Date(2026, 0, 1) });
    expect(documentsJob("split", split, files).options).toEqual({ bookmarks: "keep" });
    expect(documentsJob("split", split, files, { removeBookmarks: true }).options).toEqual({ bookmarks: "remove" });
    expect(documentsJob("split", split, files).sources.map((s) => [s.id, s.password])).toEqual([
      ["a", undefined],
      ["b", "pw"],
    ]);
    const del = planDelete(files, { a: [0], b: [0, 1, 2] });
    expect(documentsJob("delete", del, files).sources.map((s) => s.id)).toEqual(["a"]);
  });
});
