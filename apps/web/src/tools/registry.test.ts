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
    expect(rotate.flow.outputName!(["three-pages.pdf"])).toBe("three-pages.pdf");
    expect(rotate.flow.outputName!(["a.pdf", "b.pdf"])).toBe("berrypdf-rotate.zip");
  });
  it("runs Merge on the shared flow with its overrides (F3 §0)", async () => {
    const { flowTool } = await import("./registry");
    const merge = flowTool("merge-pdf");
    expect(merge.status).toBe("beta");
    expect(merge.runtime).toBe("client");
    expect(merge.flow.accept.extensions).toEqual([".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"]);
    expect(merge.flow.maxFiles).toBe(50);
    expect(merge.flow.maxFileBytes).toBe(100 * 1024 * 1024);
    expect(merge.flow.maxTotalBytes).toBe(500 * 1024 * 1024);
    expect(merge.flow.maxTotalPages).toBe(1000);
    expect(merge.flow.defaultView).toBe("files");
    expect(merge.flow.optionsDensity).toBe("full");
    expect(merge.flow.requiredPermissions).toEqual([]);
    expect(merge.flow.actionLabel).toBe("Merge PDFs");
    expect(merge.flow.outputName!(["alpha.pdf", "bravo.pdf"])).toBe("alpha_merged.pdf");
  });
  it("runs the F5 page tools on the shared flow (F4/F5 §0d)", async () => {
    const { flowTool } = await import("./registry");
    const expected = {
      "organize-pdf": { view: "pages", density: "compact", action: "Save PDF", progress: "Saving", out: "alpha_organized.pdf" },
      "combine-reorder-pdf": { view: "pages", density: "full", action: "Combine PDF", progress: "Combining", out: "alpha_merged.pdf" },
      "alternate-mix-pdf": { view: "files", density: "compact", action: "Mix PDFs", progress: "Mixing", out: "alpha_mixed.pdf" },
    } as const;
    for (const [slug, e] of Object.entries(expected)) {
      const t = flowTool(slug);
      expect(t.status, slug).toBe("beta");
      expect(t.runtime, slug).toBe("client");
      expect(t.flow.accept.extensions, slug).toEqual([".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"]);
      expect(t.flow.multiFile, slug).toBe(true);
      expect(t.flow.maxFiles, slug).toBe(50);
      expect(t.flow.maxFileBytes, slug).toBe(100 * 1024 * 1024);
      expect(t.flow.maxTotalBytes, slug).toBe(500 * 1024 * 1024);
      expect(t.flow.maxTotalPages, slug).toBe(1000);
      expect(t.flow.defaultView, slug).toBe(e.view);
      expect(t.flow.optionsDensity, slug).toBe(e.density);
      expect(t.flow.requiredPermissions, slug).toEqual([]);
      expect(t.flow.actionLabel, slug).toBe(e.action);
      expect(t.flow.progressLabel, slug).toBe(e.progress);
      expect(t.flow.outputName!(["alpha.pdf", "bravo.pdf"]), slug).toBe(e.out);
    }
  });
  it("keeps every other tool planned", () => {
    expect(tools.filter((t) => t.status !== "planned" && !t.preview).map((t) => t.slug)).toEqual(["merge-pdf", "split-pdf", "extract-pdf-pages", "delete-pdf-pages", "rotate-pdf", "organize-pdf", "combine-reorder-pdf", "alternate-mix-pdf", "split-pdf-by-bookmarks", "split-pdf-by-size", "split-pdf-by-text", "split-pdf-in-half", "protect-pdf", "unlock-pdf", "pdf-to-jpg", "pdf-to-text", "extract-images", "jpg-to-pdf"]);
    // Edit PDF is listed as a Beta preview: usable, its own page, noindex.
    expect(toolBySlug("edit-pdf")).toMatchObject({ status: "beta", preview: true });
  });
  it("offers the usable PDF tools to continue with a PDF output and nothing for a ZIP (F3 AC-43, F4 AC-412, F5)", async () => {
    const { continueTargets } = await import("./registry");
    expect(continueTargets("application/pdf").map((t) => t.slug)).toEqual(["merge-pdf", "split-pdf", "extract-pdf-pages", "delete-pdf-pages", "rotate-pdf", "organize-pdf", "combine-reorder-pdf", "alternate-mix-pdf", "split-pdf-by-bookmarks", "split-pdf-by-size", "split-pdf-by-text", "split-pdf-in-half", "protect-pdf", "unlock-pdf", "pdf-to-jpg", "pdf-to-text", "extract-images"]);
    expect(continueTargets("application/zip")).toEqual([]);
    // F12: an image result can go on to the tools that take images.
    expect(continueTargets("image/jpeg").map((t) => t.slug)).toEqual(["merge-pdf", "organize-pdf", "combine-reorder-pdf", "alternate-mix-pdf", "jpg-to-pdf"]);
    expect(continueTargets("text/plain")).toEqual([]);
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
      "edit-pdf",
      "delete-pdf-pages",
      "merge-pdf",
      "split-pdf",
      "extract-pdf-pages",
      "compress-pdf",
      "crop-pdf",
      "sign-pdf",
      "pdf-to-word",
    ]);
    const ranks = tools.filter((t) => t.popularRank !== undefined).map((t) => t.popularRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
  it("only ever offers usable tools as header shortcuts, at most 5 (AC-31)", () => {
    const s = shortcutTools();
    expect(s.length).toBeLessThanOrEqual(5);
    for (const t of s) expect(isUsable(t)).toBe(true);
    expect(s.map((t) => t.slug)).toEqual(["rotate-pdf", "delete-pdf-pages", "merge-pdf", "split-pdf", "extract-pdf-pages"]);
  });
  it("features the editor (H-11 item 7)", () => {
    expect(featured).toBe("edit-pdf");
    expect(toolBySlug(featured)).toBeDefined();
  });
});
