import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cspViolationsInHtml, inlineScriptHashes, routeForHtmlFile, scriptHash } from "../../../scripts/csp-lib.mjs";
import { recentPrepaintScript } from "../recent-tools";
import { CLOUD_ALLOW, CLOUD_COOP, cloudPolicy, cloudRouteOf, contentSecurityPolicy, hashesFor, routeKey, securityHeaders } from "./csp";

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

describe("F23: tool pages keep the pre-F23 policy byte for byte (spec D-3, AC-120/AC-127)", () => {
  it("the tool-page policy string is exactly what it was before cloud sources", () => {
    expect(contentSecurityPolicy({ scriptHashes: ["sha256-AAA="] })).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-AAA='; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
  });
  it("tool pages still get exactly the pre-F23 security headers, COOP same-origin included", () => {
    expect(securityHeaders).toEqual([
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ]);
  });
  it("only /cloud/<provider> itself is a cloud route", () => {
    expect(cloudRouteOf("/cloud/google")).toBe("google");
    expect(cloudRouteOf("/cloud/onedrive/")).toBe("onedrive");
    expect(cloudRouteOf("/cloud/mock")).toBe("mock");
    expect(cloudRouteOf("/cloud/google/x")).toBeNull();
    expect(cloudRouteOf("/cloud/box")).toBeNull();
    expect(cloudRouteOf("/merge-pdf")).toBeNull();
    expect(cloudRouteOf("/x/cloud/google")).toBeNull();
  });
});

describe("F23: cloudPolicy (research §2.1)", () => {
  const routes = Object.keys(CLOUD_ALLOW) as (keyof typeof CLOUD_ALLOW)[];

  it("each window allows exactly its provider's hosts and nothing else", () => {
    const d = directives(cloudPolicy("google", { scriptHashes: ["sha256-AAA="] }));
    expect(d.get("script-src")).toEqual(["'self'", "'sha256-AAA='", "https://apis.google.com/js/api.js", "https://apis.google.com/_/scs/", "https://accounts.google.com/gsi/client"]);
    expect(d.get("connect-src")).toEqual(["'self'", "https://www.googleapis.com/drive/v3/about", "https://www.googleapis.com/drive/v3/files", "https://www.googleapis.com/drive/v3/files/", "https://www.googleapis.com/upload/drive/v3/files", "https://accounts.google.com/gsi/"]);
    expect(d.get("frame-src")).toEqual(["https://docs.google.com", "https://drive.google.com", "https://accounts.google.com"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    const dbx = directives(cloudPolicy("dropbox"));
    expect(dbx.get("script-src")).toEqual(["'self'", "https://www.dropbox.com/static/api/2/dropins.js"]);
    expect(dbx.get("connect-src")).toEqual(["'self'", "https://dl.dropboxusercontent.com"]);
    expect(dbx.get("frame-src")).toEqual(["'none'"]);
    const od = directives(cloudPolicy("onedrive"));
    expect(od.get("script-src")).toEqual(["'self'"]); // MSAL is bundled: no third-party script
    expect(od.get("frame-src")).toEqual(["https://onedrive.live.com/picker/"]);
    expect(od.get("form-action")).toEqual(["'self'", "https://onedrive.live.com/picker/"]);
    const mock = directives(cloudPolicy("mock"));
    expect(mock.get("connect-src")).toEqual(["'self'"]);
    expect(mock.get("script-src")).toEqual(["'self'"]);
  });

  it("keeps the strict base everywhere: no inline/eval, no wildcard or scheme-only sources, never framed", () => {
    for (const r of routes) {
      const policy = cloudPolicy(r, { scriptHashes: ["sha256-AAA="] });
      const d = directives(policy);
      expect(policy, r).not.toContain("'unsafe-inline'");
      expect(policy, r).not.toContain("'unsafe-eval'");
      expect(d.get("frame-ancestors"), r).toEqual(["'none'"]);
      expect(d.get("style-src"), r).toEqual(["'self'"]);
      expect(d.get("object-src"), r).toEqual(["'none'"]);
      for (const k of ["script-src", "connect-src", "frame-src", "form-action"]) {
        for (const src of d.get(k) ?? []) expect(["*", "https:", "http:", "data:", "blob:"], `${r} ${k} ${src}`).not.toContain(src);
      }
    }
  });

  it("COOP: allow-popups for the windows whose SDK opens a nested popup, same-origin for OneDrive", () => {
    expect(CLOUD_COOP).toEqual({ dropbox: "same-origin-allow-popups", google: "same-origin-allow-popups", onedrive: "same-origin", mock: "same-origin-allow-popups" });
  });
});
