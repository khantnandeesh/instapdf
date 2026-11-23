import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cspViolationsInHtml, inlineScriptHashes, routeForHtmlFile, scriptHash } from "../../../scripts/csp-lib.mjs";
import { recentPrepaintScript } from "../recent-tools";
import { contentSecurityPolicy, hashesFor, routeKey, securityHeaders } from "./csp";

const directives = (policy: string) => new Map(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)] as const));

describe("contentSecurityPolicy (production)", () => {
  const policy = contentSecurityPolicy({ scriptHashes: ["sha256-AAA=", "sha256-BBB="] });
  const d = directives(policy);

  it("only lets the page connect to its own origin (the 'nothing uploads' guarantee)", () => {
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
  });

  it("allows scripts from our origin plus exactly the given inline hashes, never unsafe-inline or eval", () => {
    expect(d.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'", "'sha256-AAA='", "'sha256-BBB='"]);
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("strict-dynamic");
  });

  it("has the rest of the strict policy", () => {
    expect(d.get("style-src")).toEqual(["'self'"]);
    expect(d.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
    expect(d.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("without hashes no inline script is allowed (fail closed)", () => {
    expect(directives(contentSecurityPolicy()).get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it("dev mode relaxes only what next dev needs", () => {
    const dev = directives(contentSecurityPolicy({ dev: true, scriptHashes: ["sha256-AAA="] }));
    expect(dev.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(dev.get("connect-src")).toEqual(["'self'", "ws:", "wss:"]);
    expect(dev.get("frame-ancestors")).toEqual(["'none'"]);
  });
});

describe("securityHeaders", () => {
  const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]));
  it("sets the agreed headers", () => {
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) expect(h["Permissions-Policy"]).toContain(feature);
  });
  it("keeps Web Share and clipboard available", () => {
    expect(h["Permissions-Policy"]).not.toMatch(/web-share|clipboard/);
  });
});

describe("routeKey / hashesFor", () => {
  const manifest = { routes: { "/": ["sha256-home="], "/rotate-pdf": ["sha256-rot="], "/_not-found": ["sha256-404="] } };
  it("normalises paths", () => {
    expect(routeKey("/")).toBe("/");
    expect(routeKey("")).toBe("/");
    expect(routeKey("/rotate-pdf/")).toBe("/rotate-pdf");
  });
  it("returns the page's hashes, the 404 page's for unknown paths, nothing without a manifest", () => {
    expect(hashesFor(manifest, "/")).toEqual(["sha256-home="]);
    expect(hashesFor(manifest, "/rotate-pdf")).toEqual(["sha256-rot="]);
    expect(hashesFor(manifest, "/nope/deeper")).toEqual(["sha256-404="]);
    expect(hashesFor(null, "/")).toEqual([]);
  });
});

describe("csp-lib (build-time manifest)", () => {
  it("hashes like the browser does: sha256 of the exact script text, base64", () => {
    const text = 'console.log("hi")';
    expect(scriptHash(text)).toBe(`sha256-${createHash("sha256").update(text).digest("base64")}`);
  });

  it("hashes inline executable scripts only, once each, in order", () => {
    const html = [
      '<script src="/_next/static/a.js" async=""></script>',
      "<script>one()</script>",
      '<script type="application/ld+json">{"a":1}</script>',
      "<script>two()</script>",
      "<script>one()</script>",
      '<script type="module">three()</script>',
    ].join("");
    expect(inlineScriptHashes(html)).toEqual([scriptHash("one()"), scriptHash("two()"), scriptHash("three()")]);
  });

  it("covers the Recent-tools pre-paint script", () => {
    const pre = recentPrepaintScript(["rotate-pdf"]);
    expect(inlineScriptHashes(`<head><script>${pre}</script></head>`)).toEqual([scriptHash(pre)]);
  });

  it("finds markup the strict policy would block, ignoring script contents", () => {
    expect(cspViolationsInHtml('<div class="a"><script>x=\'<p style="a">\'</script></div>')).toEqual([]);
    expect(cspViolationsInHtml('<span style="width:40px">')).toHaveLength(1);
    expect(cspViolationsInHtml("<style>a{}</style>")).toHaveLength(1);
    expect(cspViolationsInHtml('<button onclick="go()">')).toHaveLength(1);
    expect(cspViolationsInHtml('<a href="javascript:go()">')).toHaveLength(1);
    expect(cspViolationsInHtml("<p>Set style=\"x\" in text is fine</p>")).toEqual([]);
  });

  it("maps prerendered files to routes", () => {
    expect(routeForHtmlFile("index.html")).toBe("/");
    expect(routeForHtmlFile("rotate-pdf.html")).toBe("/rotate-pdf");
    expect(routeForHtmlFile("_not-found.html")).toBe("/_not-found");
    expect(routeForHtmlFile("(info)/privacy.html")).toBe("/privacy");
    expect(routeForHtmlFile("a/(group)/b.html")).toBe("/a/b");
    expect(routeForHtmlFile("docs/index.html")).toBe("/docs");
  });
});
