import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(__dirname, "..", "..", path), "utf8");

describe("the editor's idle prefetch", () => {
  it("loads the same pdf.js module the pick imports (lib/pdf/pdfjs.ts loadPdfjs)", () => {
    const picked = source("lib/pdf/pdfjs.ts").match(/modulePromise \?\?= import\("([^"]+)"\)/)?.[1];
    const ensured = source("tools/editor/idle-prefetch.ts").match(/require\.ensure\(\s*(?:\/\/[^\n]*\n\s*)*\[([^\]]*)\]/)?.[1];
    expect(picked).toBe("pdfjs-dist");
    expect(ensured?.split(",").map((s) => s.trim().replace(/^"|"$/g, ""))).toEqual(["./EditorShell", picked]);
  });

  it("loads the shell EditorTool imports", () => {
    expect(source("tools/editor/EditorTool.tsx")).toContain('shellModule ??= import("./EditorShell")');
  });
});
