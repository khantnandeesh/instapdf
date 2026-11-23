import { describe, expect, it } from "vitest";
import { languageAlternates } from "./i18n";
import { jsonLdString } from "./jsonld";
import { pageMetadata } from "./metadata";
import { indexableRoutes } from "./routes";
import { absoluteUrl, isIndexableHost, SITE_HOST } from "./site";

describe("seo foundations", () => {
  it("indexes only the canonical host (and localhost for checks)", () => {
    expect(isIndexableHost(SITE_HOST)).toBe(true);
    expect(isIndexableHost("web-staging-qzq5fa2g7q-uc.a.run.app")).toBe(false);
    expect(isIndexableHost("web-prod-abc-uc.a.run.app")).toBe(false);
    expect(isIndexableHost(null)).toBe(false);
    expect(isIndexableHost("localhost:3000")).toBe(true);
  });
  it("builds absolute URLs", () => {
    expect(absoluteUrl("/rotate-pdf")).toMatch(/^https:\/\/[^/]+\/rotate-pdf$/);
  });
  it("self-references in hreflang and adds x-default", () => {
    expect(languageAlternates("/rotate-pdf")).toEqual({ en: "/rotate-pdf", "x-default": "/rotate-pdf" });
  });
  it("sets canonical, robots and social tags", () => {
    const m = pageMetadata({ path: "/x", title: "X | BerryPDF", description: "d" });
    expect(m.alternates?.canonical).toBe("/x");
    expect(m.robots).toMatchObject({ index: true });
    expect(pageMetadata({ path: "/x", title: "X", description: "d", noindex: true }).robots).toMatchObject({ index: false });
  });
  it("lists the home page and usable tools, never planned ones", () => {
    const paths = indexableRoutes().map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/rotate-pdf");
    expect(paths).not.toContain("/merge-pdf");
  });
  it("escapes JSON-LD so it cannot close its script tag", () => {
    const s = jsonLdString([{ name: "</script><script>alert(1)</script>&" }]);
    expect(s).not.toContain("<");
    expect(JSON.parse(s)["@graph"][0].name).toBe("</script><script>alert(1)</script>&");
  });
});
