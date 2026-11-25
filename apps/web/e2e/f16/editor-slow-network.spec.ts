/**
 * F16 on a slow phone connection (owner request on PR #25): the text engine (WebAssembly) never
 * blocks viewing or object tools, shows its progress only when Edit text is asked for early,
 * prefetches on idle (not with Data Saver), and comes from the HTTP cache on a second visit.
 *
 * Mobile project only, with Chrome's network emulation at a slow-3G profile.
 */
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
/** Slow 3G: about 400 kbit/s down and up, 400 ms round trip. */
const SLOW_3G = { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 };
/** The first body line of std14-reportlab.pdf ("This page is a synthetic test paragraph…"), as page fractions. */
const LINE = { fx: 0.356, fy: 0.15, text: "This page is a synthetic test paragraph with several lines of" };

test.skip(({ isMobile, browserName }) => !isMobile || browserName !== "chromium", "The slow-network profile runs on the mobile project (Chrome's emulation)");
// No action (a read, a tap) may wait without limit: one that can't happen fails fast, by name,
// well inside the test timeout. The slow steps (navigation, first page, engine) have their own.
test.use({ actionTimeout: 30_000 });

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
  return cdp;
}

/** Data Saver on: the landing doesn't prefetch the engine, so it starts once a file's page is up. */
const dataSaver = (page: Page) =>
  page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "3g" }, configurable: true }));

const engineState = (page: Page) => page.getByTestId("editor-shell").getAttribute("data-engine");

async function tapPage(page: Page, fx: number, fy: number) {
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
}

test("slow 3G: the first page and Add text work before the engine; a line clicked early opens when it's ready", { tag: "@serial" }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await dataSaver(page);
  await throttle(page);
  const tNav = Date.now();
  await page.goto("/edit-pdf", { timeout: 120_000 });
  await expect(page.getByTestId("editor")).toHaveAttribute("data-hydrated", "true", { timeout: 120_000 });
  const tLanding = Date.now() - tNav;

  const t0 = Date.now();
  await page.getByTestId("editor-input").setInputFiles(corpus("std14-reportlab.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 120_000 });
  const tFirstPage = Date.now() - t0;
  expect(await engineState(page)).not.toBe("ready");

  // An object tool works at once.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  await tapPage(page, 0.3, 0.55);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type("Added on a slow line");
  await page.getByTestId("text-input").press("Escape");
  await expect(page.getByRole("group", { name: /Added on a slow line/ })).toHaveCount(1);
  expect(await engineState(page)).not.toBe("ready");

  // A tap on existing text: the progress shows and rises, then the line edit starts by itself.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("v");
  await tapPage(page, LINE.fx, LINE.fy);
  const progress = page.getByTestId("engine-progress");
  await expect(progress).toBeVisible({ timeout: 10_000 });
  const seen: number[] = [];
  const input = page.getByTestId("line-input");
  // Every read here returns at once. The pill (and its percent) goes away when the engine is ready,
  // a moment before the line edit opens, so a read that waits for the percent would wait forever
  // (it hung CI until the 300 s test timeout). A failed download or a line that never opens fails
  // here, with what was seen, instead of hanging.
  const deadline = Date.now() + 180_000;
  while (!(await input.isVisible())) {
    const [t] = await page.getByTestId("engine-percent").allTextContents();
    if (t) {
      const n = Number(t.replace("%", ""));
      if (seen.at(-1) !== n) seen.push(n);
    }
    const state = await engineState(page);
    const where = `engine ${state}; percent values seen: ${seen.join(", ")}`;
    if (state === "failed") throw new Error(`The engine download failed before the line opened (${where})`);
    if (Date.now() > deadline) throw new Error(`The line clicked early didn't open within 180 s (${where})`);
    await page.waitForTimeout(250);
  }
  await expect(input).toBeFocused();
  const tEngine = Date.now() - t0;
  await expect(input).toHaveText(LINE.text);
  await expect(progress).toHaveCount(0);
  expect(seen.length, `percent values seen: ${seen.join(", ")}`).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
  expect(seen.at(-1)! - seen[0]!).toBeGreaterThan(20);
  await page.keyboard.press("Escape");

  info.annotations.push({ type: "slow-3g", description: `landing ${tLanding} ms; first page ${tFirstPage} ms after the pick; engine ready ${tEngine} ms after the pick` });
  console.log(`[slow-3g] landing ${tLanding} ms, first page ${tFirstPage} ms, engine ready ${tEngine} ms (from the pick)`);

  // Second visit, same browser: the engine comes from the HTTP cache (nothing over the network).
  const again = await page.context().newPage();
  await throttle(again);
  await again.goto("/edit-pdf", { timeout: 120_000 });
  await again.getByTestId("editor-input").setInputFiles(corpus("std14-reportlab.pdf"));
  await expect(again.getByTestId("editor-shell")).toHaveAttribute("data-engine", "ready", { timeout: 60_000 });
  await expect(again.getByTestId("editor-shell")).toHaveAttribute("data-engine-cached", "true");
});

test("slow 3G: the landing fetches pdf.js and its workers on idle before the engine, so the first page after a pick needs no download", { tag: "@serial" }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await throttle(page);
  const order: string[] = [];
  const done = new Set<string>();
  const kind = (u: string) => {
    const p = new URL(u).pathname;
    return /pdf\.worker/.test(p) ? "worker" : /pdf\.renderer/.test(p) ? "renderer" : p.startsWith("/engine/") && p.endsWith(".wasm") ? "engine" : null;
  };
  page.on("request", (r) => {
    const k = kind(r.url());
    if (k) order.push(k);
  });
  page.on("requestfinished", (r) => {
    const k = kind(r.url());
    if (k) done.add(k);
  });
  await page.goto("/edit-pdf", { timeout: 120_000 });
  await expect(page.getByTestId("editor")).toHaveAttribute("data-hydrated", "true", { timeout: 120_000 });
  // pdf.js's workers come first (the first page needs them), the engine after.
  await expect.poll(() => done.has("worker") && done.has("renderer"), { timeout: 120_000 }).toBe(true);
  expect(order.indexOf("worker")).toBeGreaterThanOrEqual(0);
  if (order.includes("engine")) expect(order.indexOf("engine")).toBeGreaterThan(order.indexOf("worker"));
  const t0 = Date.now();
  await page.getByTestId("editor-input").setInputFiles(corpus("std14-reportlab.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 120_000 });
  const tFirstPage = Date.now() - t0;
  info.annotations.push({ type: "slow-3g", description: `prefetched landing: first page ${tFirstPage} ms after the pick` });
  console.log(`[slow-3g] prefetched landing: first page ${tFirstPage} ms after the pick`);
  expect(tFirstPage).toBeLessThan(6000);
});

test("slow 3G: the landing prefetches the engine on idle, from hashed paths, unless Data Saver is on", { tag: "@serial" }, async ({ browser }) => {
  test.setTimeout(240_000);
  const run = async (saver: boolean) => {
    const context = await browser.newContext({ ...test.info().project.use });
    const page = await context.newPage();
    if (saver) await dataSaver(page);
    await throttle(page);
    const engine: string[] = [];
    const workers: string[] = [];
    page.on("request", (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith("/engine/")) engine.push(p);
      if (/pdf\.(worker|renderer)/.test(p)) workers.push(p);
    });
    await page.goto("/edit-pdf", { timeout: 120_000 });
    await expect(page.getByTestId("editor")).toHaveAttribute("data-hydrated", "true", { timeout: 120_000 });
    if (!saver) await expect.poll(() => engine.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
    else await page.waitForTimeout(6000);
    await context.close();
    return { engine, workers };
  };
  const normal = await run(false);
  expect(normal.engine.every((p) => /^\/engine\/[0-9a-f]{16}\/berry_engine(_bg\.wasm|\.js)$/.test(p)), normal.engine.join(", ")).toBe(true);
  // Data Saver: neither pdf.js's workers nor the engine before a file.
  expect(await run(true)).toEqual({ engine: [], workers: [] });
});

test("home: the engine is fetched on intent on the Edit PDF link, never on load", async ({ page }) => {
  const engine: string[] = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/engine/")) engine.push(p);
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  expect(engine).toEqual([]);
  // Edit PDF is unlisted during the beta, so no card links to it yet: stand one in for the card.
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/edit-pdf";
    a.textContent = "Edit PDF";
    a.dataset.testCard = "";
    document.querySelector("main")!.prepend(a);
  });
  const link = page.locator("a[data-test-card]");
  await page.waitForTimeout(500);
  expect(engine).toEqual([]);
  await link.dispatchEvent("touchstart");
  await expect.poll(() => engine.length).toBeGreaterThanOrEqual(2);
  expect(engine.every((p) => /^\/engine\/[0-9a-f]{16}\//.test(p))).toBe(true);
});
