import { describe, expect, it } from "vitest";
import { acceptAttribute, fitsPageBudget, hasAcceptedType, screenFiles, type IntakeLimits } from "./validation";

const accept = { mime: ["application/pdf"], extensions: [".pdf"] };
const MB = 1024 * 1024;
const limits: IntakeLimits = { accept, multiFile: true, maxFiles: 20, maxFileBytes: 100 * MB, maxTotalBytes: 500 * MB };
const f = (name: string, size = 1000, type = "application/pdf") => ({ name, size, type });

describe("hasAcceptedType", () => {
  it("accepts .pdf whatever the reported MIME", () => {
    expect(hasAcceptedType(f("a.pdf"), accept)).toBe(true);
    expect(hasAcceptedType(f("A.PDF", 1, ""), accept)).toBe(true);
    expect(hasAcceptedType(f("a.pdf", 1, "application/octet-stream"), accept)).toBe(true);
  });
  it("AC-12: rejects other extensions", () => {
    expect(hasAcceptedType(f("notes.txt", 1, "text/plain"), accept)).toBe(false);
    expect(hasAcceptedType(f("notes.txt", 1, "application/pdf"), accept)).toBe(false);
  });
  it("accepts an extensionless file only with a PDF MIME", () => {
    expect(hasAcceptedType(f("clipboard", 1, "application/pdf"), accept)).toBe(true);
    expect(hasAcceptedType(f("clipboard", 1, ""), accept)).toBe(false);
  });
  it("builds the input accept attribute", () => {
    expect(acceptAttribute(accept)).toBe(".pdf,application/pdf");
  });
});

describe("screenFiles", () => {
  it("AC-15: keeps valid files next to a wrong type", () => {
    const r = screenFiles([f("notes.txt", 10, "text/plain"), f("three-pages.pdf")], limits, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(["three-pages.pdf"]);
    expect(r.rejected).toEqual([{ name: "notes.txt", reason: "type" }]);
  });
  it("AC-16: rejects files over the size cap", () => {
    const r = screenFiles([f("big.pdf", 100 * 1024 * 1024 + 1), f("ok.pdf", 100 * 1024 * 1024)], limits, 0);
    expect(r.rejected).toEqual([{ name: "big.pdf", reason: "size" }]);
    expect(r.accepted.map((x) => x.name)).toEqual(["ok.pdf"]);
  });
  it("AC-18: keeps the first 20 of 21 files", () => {
    const files = Array.from({ length: 21 }, (_, i) => f(`f${i}.pdf`));
    const r = screenFiles(files, limits, 0);
    expect(r.accepted).toHaveLength(20);
    expect(r.overCount).toEqual(["f20.pdf"]);
  });
  it("counts files already loaded", () => {
    const r = screenFiles([f("a.pdf"), f("b.pdf")], limits, 19);
    expect(r.accepted.map((x) => x.name)).toEqual(["a.pdf"]);
    expect(r.overCount).toEqual(["b.pdf"]);
  });
  it("takes one file on single-file tools (it replaces the current one)", () => {
    const r = screenFiles([f("a.pdf"), f("b.pdf")], { ...limits, multiFile: false }, 1);
    expect(r.accepted.map((x) => x.name)).toEqual(["a.pdf"]);
    expect(r.overCount).toEqual(["b.pdf"]);
  });
});

describe("screenFiles total size", () => {
  it("rejects a file that would take the task past 500 MB and keeps the rest", () => {
    const files = [f("a.pdf", 100 * MB), f("b.pdf", 100 * MB), f("c.pdf", 100 * MB), f("d.pdf", 100 * MB), f("e.pdf", 100 * MB), f("f.pdf", 100 * MB), f("g.pdf", 1)];
    const r = screenFiles(files, limits, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"]);
    expect(r.rejected).toEqual([
      { name: "f.pdf", reason: "total" },
      { name: "g.pdf", reason: "total" },
    ]);
  });
  it("counts bytes already loaded and lets a smaller later file fit", () => {
    const r = screenFiles([f("big.pdf", 60 * MB), f("small.pdf", 10 * MB)], limits, 5, 450 * MB);
    expect(r.rejected).toEqual([{ name: "big.pdf", reason: "total" }]);
    expect(r.accepted.map((x) => x.name)).toEqual(["small.pdf"]);
  });
  it("allows exactly the cap", () => {
    expect(screenFiles([f("x.pdf", 100 * MB)], limits, 4, 400 * MB).accepted).toHaveLength(1);
  });
});

describe("fitsPageBudget", () => {
  it("AC-17: allows exactly the cap and rejects one more", () => {
    expect(fitsPageBudget(0, 1000, 1000)).toBe(true);
    expect(fitsPageBudget(0, 1001, 1000)).toBe(false);
    expect(fitsPageBudget(997, 3, 1000)).toBe(true);
    expect(fitsPageBudget(998, 3, 1000)).toBe(false);
  });
});
