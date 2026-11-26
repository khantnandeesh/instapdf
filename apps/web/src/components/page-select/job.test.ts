import { describe, expect, it } from "vitest";
import { planDelete, planSplit } from "@/lib/page-plans";
import { documentsJob } from "@/lib/pdf/jobs";
import { pageToolJob } from "./job";

const files = [
  { id: "a", name: "twelve.pdf", pageCount: 12, source: new Blob(["a"]) },
  { id: "b", name: "three-pages.pdf", pageCount: 3, source: new Blob(["b"]), password: "pw" },
];

describe("pageToolJob", () => {
  it("builds exactly the engine's documentsJob (no drift)", () => {
    const split = planSplit(files, { mode: { kind: "everyN", n: 5 }, date: new Date(2026, 0, 1) });
    for (const removeBookmarks of [false, true]) {
      expect(pageToolJob("split", split, files, { removeBookmarks })).toEqual(documentsJob("split", split, files, { removeBookmarks }));
    }
    const del = planDelete(files, { a: [0], b: [0, 1, 2] });
    expect(pageToolJob("delete", del, files)).toEqual(documentsJob("delete", del, files));
    expect(pageToolJob("delete", del, files).sources.map((s) => s.id)).toEqual(["a"]);
  });
});
