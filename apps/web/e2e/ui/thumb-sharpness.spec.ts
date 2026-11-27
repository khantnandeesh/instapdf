/**
 * Thumbnails are drawn for the size they are shown at (eval G-1, M4): every canvas in view has at least
 * min(devicePixelRatio, 2.5) backing pixels per CSS pixel of the page as shown, on every page tool, Rotate
 * and Merge, at 1280 (1x and 2x), 390 (3x) and 320 (2x). A bigger thumbnail size (the zoom slider) and a
 * new pixel ratio (browser zoom, another screen) redraw them sharp, and big files stay responsive.
 */
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { fx } from "../support/flow";

const CAP = 2.5;
/** Backing sizes are whole pixels: a hair under the ratio is still the ratio. */
const SLACK = 0.02;

type Route = { slug: string; files: string[]; view?: "Files" | "Pages" };
const ROUTES: Route[] = [
  { slug: "split-pdf", files: ["twelve.pdf"] },
  { slug: "extract-pdf-pages", files: ["twelve.pdf"] },
  { slug: "delete-pdf-pages", files: ["twelve.pdf"] },
  { slug: "organize-pdf", files: ["alpha.pdf", "three-pages.pdf"] },
  { slug: "combine-reorder-pdf", files: ["alpha.pdf", "three-pages.pdf"] },
  { slug: "alternate-mix-pdf", files: ["odd.pdf", "even.pdf"] },
  { slug: "alternate-mix-pdf", files: ["odd.pdf", "even.pdf"], view: "Pages" },
  { slug: "rotate-pdf", files: ["three-pages.pdf"] },
  { slug: "merge-pdf", files: ["alpha.pdf", "three-pages.pdf"] },
  { slug: "merge-pdf", files: ["alpha.pdf", "three-pages.pdf"], view: "Pages" },
];

/** Backing pixels per CSS pixel of each thumbnail canvas in view (its longest side as shown, turns and scales included). */
function ratios(page: Page) {
  return page.locator("[data-rendered] > canvas").evaluateAll((canvases) =>
    (canvases as HTMLCanvasElement[]).flatMap((c) => {
      // A canvas just replaced by a sharper one is skipped.
      if (!c.parentElement) return [];
      const r = c.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width < 1) return [];
      return [Math.round((Math.max(c.width, c.height) / Math.max(r.width, r.height)) * 1000) / 1000];
    }),
  );
}

async function load(page: Page, r: Route) {
  await page.goto(`/${r.slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(r.files.map(fx));
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
  if (r.view) await page.getByRole("radio", { name: r.view }).click();
  await expect(page.locator("[data-rendered] > canvas").first()).toBeVisible();
}

/** Every thumbnail in view is sharp for `dpr` (polled: redraws wait for a resize to settle). */
async function sharp(page: Page, dpr: number, what: string) {
  const want = Math.min(dpr, CAP) - SLACK;
  await expect
    .poll(async () => {
      const got = await ratios(page);
      return got.length ? got.filter((x) => x < want).map((x) => `${what}: ${x}x < ${want + SLACK}x`) : [`${what}: no thumbnail in view`];
    }, { timeout: 8000 })
    .toEqual([]);
}

const VIEWPORTS = [
  { name: "1280 at 1x", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { name: "1280 at 2x", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 },
  { name: "390 at 3x", viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: "320 at 2x", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
] as const;

for (const { name, ...use } of VIEWPORTS)
  test.describe(`thumbnails at ${name}`, () => {
    test.use(use);
    for (const r of ROUTES)
      test(`${r.slug}${r.view ? ` (${r.view})` : ""}: canvas pixels per CSS pixel >= min(DPR, ${CAP})`, async ({ page }) => {
        await load(page, r);
        await sharp(page, use.deviceScaleFactor, r.slug);
      });
  });

test.describe("redraws", () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test("a bigger thumbnail size redraws the pages sharp (Organize, Merge pages)", async ({ page }) => {
    for (const r of [ROUTES[3], ROUTES[9]]) {
      await load(page, r);
      const first = page.locator("[data-rendered]").first();
      const before = await first.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).width);
      const shown = (await first.boundingBox())!.width;
      const larger = page.getByRole("button", { name: "Larger thumbnail size" });
      // Each step is 8 px: four make the page about 20% bigger, past what the first canvas covers.
      for (let i = 0; i < 4; i++) await larger.click();
      await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(shown * 1.15);
      await sharp(page, 1, `${r.slug} zoomed in`);
      expect(await first.locator("canvas").evaluate((c) => (c as HTMLCanvasElement).width)).toBeGreaterThan(before);
    }
  });

  test("a new pixel ratio redraws the pages sharp (Rotate, Merge, Extract)", async ({ page }) => {
    for (const r of [ROUTES[7], ROUTES[8], ROUTES[1]]) {
      await load(page, r);
      await sharp(page, 1, `${r.slug} at 1x`);
      const cdp: CDPSession = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
      // Headless Chromium changes devicePixelRatio here without the events a real zoom fires (the
      // resolution query's change, a resize); send the resize a zoom gives.
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await sharp(page, 2, `${r.slug} moved to 2x`);
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await cdp.detach();
    }
  });
});

test.describe("big files stay responsive", () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

  for (const [slug, file] of [
    ["organize-pdf", "big-250.pdf"],
    ["delete-pdf-pages", "sixty-pages.pdf"],
  ] as const)
    test(`${slug} with ${file}: scrolling the grid gives no long task over 200 ms and keeps canvases bounded`, async ({ page }) => {
      await load(page, { slug, files: [file] });
      await sharp(page, 2, slug);
      await page.evaluate(() => {
        const w = window as unknown as { __long: number[] };
        w.__long = [];
        new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask" });
      });
      // The pages' own scroll area when it scrolls (desktop), else the page.
      for (let i = 0; i < 12; i++) {
        await page.mouse.move(640, 400);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(120);
      }
      await sharp(page, 2, `${slug} scrolled`);
      const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
      expect(Math.max(0, ...long), `long tasks: ${long.map(Math.round).join(", ")}`).toBeLessThan(200);
      const tiles = await page.locator("[data-rendered]").count();
      const total = await page.getByTestId("page-tile").count();
      expect(tiles, "canvases far from view are released").toBeLessThan(Math.max(80, total * 0.6));
    });
});
