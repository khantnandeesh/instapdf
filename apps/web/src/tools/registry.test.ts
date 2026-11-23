import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { categories, featured, isUsable, popularTools, shortcutTools, toolBySlug, tools } from "./registry";
import { toolIconNames } from "./tool-icon-names";

describe("tool registry", () => {
  it("has unique slugs and unique reference slugs", () => {
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.ref)).size).toBe(tools.length);
  });
  it("uses url-safe slugs", () => {
    for (const t of tools) expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("flow config", () => {
  it("runs Rotate on the shared flow with the spec's limits", async () => {
    const { flowTool } = await import("./registry");
    const rotate = flowTool("rotate-pdf");
    expect(rotate.status).toBe("beta");
    expect(rotate.flow.accept.extensions).toEqual([".pdf"]);
    expect(rotate.flow.maxFiles).toBe(20);
    expect(rotate.flow.maxFileBytes).toBe(100 * 1024 * 1024);
    expect(rotate.flow.maxTotalPages).toBe(1000);
    expect(rotate.flow.maxTotalBytes).toBe(500 * 1024 * 1024);
    expect(rotate.flow.requiredPermissions).toEqual([]);
    expect(rotate.flow.actionLabel).toBe("Rotate PDF");
    expect(rotate.flow.title).toBe("Rotate PDF");
    expect(rotate.flow.outputName(["three-pages.pdf"])).toBe("three-pages.pdf");
    expect(rotate.flow.outputName(["a.pdf", "b.pdf"])).toBe("berrypdf-rotate.zip");
  });
  it("keeps every other tool planned", () => {
    expect(tools.filter((t) => t.status !== "planned").map((t) => t.slug)).toEqual(["rotate-pdf"]);
  });
  it("offers Rotate to continue with a PDF output and nothing for a ZIP", async () => {
    const { continueTargets } = await import("./registry");
    expect(continueTargets("application/pdf").map((t) => t.slug)).toEqual(["rotate-pdf"]);
    expect(continueTargets("application/zip")).toEqual([]);
  });
});

describe("catalogue fields (F2)", () => {
  it("gives every tool an icon that exists in the generated set", () => {
    const generated = readFileSync(new URL("./tool-icons.tsx", import.meta.url), "utf8");
    for (const t of tools) {
      expect(toolIconNames, t.slug).toContain(t.icon);
      expect(generated, t.slug).toContain(`"${t.icon}": <>`);
    }
  });
  it("generates complete icon shapes (every line, path, circle and rect has its geometry)", () => {
    const generated = readFileSync(new URL("./tool-icons.tsx", import.meta.url), "utf8");
    const required: Record<string, string[]> = { line: ["x1", "x2", "y1", "y2"], path: ["d"], circle: ["cx", "cy", "r"], rect: ["width", "height"], polyline: ["points"], polygon: ["points"], ellipse: ["cx", "cy", "rx", "ry"] };
    const shapes = [...generated.matchAll(/<(line|path|circle|rect|polyline|polygon|ellipse) ([^>]*)\/>/g)];
    expect(shapes.length).toBeGreaterThan(45);
    for (const [, tag, attrs] of shapes) for (const a of required[tag]) expect(attrs, `<${tag} ${attrs}>`).toMatch(new RegExp(`\\b${a}="`));
  });
  it("puts every tool in one of the 8 categories, in the spec's order", () => {
    expect(categories.map((c) => c.label)).toEqual([
      "Organize pages",
      "Edit & sign",
      "Optimize",
      "Security",
      "Convert from PDF",
      "Convert to PDF",
      "Scans",
      "Automate",
    ]);
    const ids = new Set(categories.map((c) => c.id));
    for (const t of tools) expect(ids.has(t.category), t.slug).toBe(true);
    for (const c of categories) expect(tools.some((t) => t.category === c.id), c.id).toBe(true);
  });
  it("has short, lower-case keywords, and a name and summary on every tool", () => {
    for (const t of tools) {
      expect(t.name.trim(), t.slug).not.toBe("");
      expect(t.summary.trim(), t.slug).not.toBe("");
      for (const k of t.keywords) expect(k, t.slug).toMatch(/^[a-z0-9 ]{2,24}$/);
    }
  });
  it("keeps keywords from leaking into the AC-15 split search", () => {
    for (const t of tools) if (!t.name.toLowerCase().includes("split")) expect(t.keywords.join(" "), t.slug).not.toContain("split");
  });
  it("orders the Popular row usable first, then planned, in the fixed order (AC-11)", () => {
    expect(popularTools().map((t) => t.slug)).toEqual([
      "rotate-pdf",
      "pdf-editor",
      "compress-pdf",
      "delete-pages",
      "merge-pdf",
      "split-pdf",
      "crop-pdf",
      "fill-sign",
      "pdf-to-word",
      "extract-pages",
    ]);
    const ranks = tools.filter((t) => t.popularRank !== undefined).map((t) => t.popularRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
  it("only ever offers usable tools as header shortcuts, at most 5 (AC-31)", () => {
    const s = shortcutTools();
    expect(s.length).toBeLessThanOrEqual(5);
    for (const t of s) expect(isUsable(t)).toBe(true);
    expect(s.map((t) => t.slug)).toEqual(["rotate-pdf"]);
  });
  it("features the editor (H-11 item 7)", () => {
    expect(featured).toBe("pdf-editor");
    expect(toolBySlug(featured)).toBeDefined();
  });
});
