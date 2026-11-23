import { describe, expect, it } from "vitest";
import { tools } from "./registry";

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
    expect(rotate.flow.outputName(["a.pdf", "b.pdf"])).toBe("instapdf-rotate.zip");
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
