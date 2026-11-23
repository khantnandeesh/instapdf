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
