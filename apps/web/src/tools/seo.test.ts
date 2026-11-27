import { describe, expect, it } from "vitest";
import { isUsable, tools } from "./registry";
import { seoContent, toolPageTitle, toolSeo } from "./seo";

/** The automated half of the per-tool SEO checklist (docs/process/workflow.md). */
describe("tool SEO metadata", () => {
  it("covers every tool and nothing else", () => {
    expect(Object.keys(toolSeo).sort()).toEqual(tools.map((t) => t.slug).sort());
  });
  it("keeps titles within 60 characters with the brand, and unique", () => {
    for (const t of tools) expect(toolPageTitle(t.slug).length, t.slug).toBeLessThanOrEqual(60);
    expect(new Set(tools.map((t) => toolSeo[t.slug].title)).size).toBe(tools.length);
  });
  it("keeps descriptions between 110 and 160 characters, and unique", () => {
    for (const t of tools) {
      const d = toolSeo[t.slug].description;
      expect(d.length, `${t.slug}: ${d.length}`).toBeGreaterThanOrEqual(110);
      expect(d.length, `${t.slug}: ${d.length}`).toBeLessThanOrEqual(160);
    }
    expect(new Set(tools.map((t) => toolSeo[t.slug].description)).size).toBe(tools.length);
  });
  it("puts the primary keyword in the title and the description", () => {
    for (const t of tools) {
      const s = toolSeo[t.slug];
      const words = s.keyword.toLowerCase().split(" ").filter((w) => w.length > 2);
      for (const w of words) {
        expect(s.title.toLowerCase(), `${t.slug} title lacks "${w}"`).toContain(w);
        expect(s.description.toLowerCase(), `${t.slug} description lacks "${w}"`).toContain(w);
      }
    }
  });
  it("only promises 'nothing is uploaded' for browser tools", () => {
    for (const t of tools) if (toolSeo[t.slug].description.includes("nothing is uploaded")) expect(t.runtime, t.slug).toBe("client");
  });
  it("never names a competitor", () => {
    const all = JSON.stringify({ toolSeo, seoContent }).toLowerCase();
    for (const name of ["sejda", "ilovepdf", "smallpdf", "pdf24", "adobe", "acrobat"]) expect(all).not.toContain(name);
  });
});

describe("tool page content", () => {
  it("exists for every usable tool (no tool ships without its guide)", () => {
    for (const t of tools.filter((x) => isUsable(x) && !x.preview)) expect(seoContent[t.slug], t.slug).toBeDefined();
  });
  it("has 3–5 steps, 4–8 questions and 3–6 known related tools", () => {
    for (const [slug, c] of Object.entries(seoContent)) {
      expect(c.steps.length, slug).toBeGreaterThanOrEqual(3);
      expect(c.steps.length, slug).toBeLessThanOrEqual(5);
      expect(c.faq.length, slug).toBeGreaterThanOrEqual(4);
      expect(c.faq.length, slug).toBeLessThanOrEqual(8);
      expect(c.related.length, slug).toBeGreaterThanOrEqual(3);
      expect(c.related.length, slug).toBeLessThanOrEqual(6);
      for (const r of c.related) expect(toolSeo[r], `${slug} → ${r}`).toBeDefined();
      expect(c.related, slug).not.toContain(slug);
    }
  });
});
