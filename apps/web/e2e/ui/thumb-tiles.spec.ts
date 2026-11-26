/**
 * Page tiles rule (docs/design/berrypdf.md "Page tiles", owner 2026-11-26): the page fills at least
 * 90% of its tile's width (--ip-tile-fill), the tile's edge is at most 8px each side, and the tile has
 * no filled background (no pink tray). Checked at 1280x800 and 390x844 on Rotate, Merge's files view
 * and Merge's pages view, with A4 portrait pages (the common and the narrowest case the rule covers).
 */
import { expect, test, type Page } from "@playwright/test";
import { fx } from "../support/flow";

const FILL = 0.9;
const MAX_PAD = 8;

async function measure(page: Page, item: string, visual: string) {
  return page.locator(item).evaluateAll(
    (els, visual) =>
      els.map((el) => {
        const t = el.getBoundingClientRect();
        const p = el.querySelector(visual)!.getBoundingClientRect();
        return { fill: p.width / t.width, left: p.left - t.left, right: t.right - p.right, bg: getComputedStyle(el).backgroundColor };
      }),
    visual,
  );
}

/** Every rule breach as text, so a failure names the tile and the number. Polled: tiles fade and FLIP in. */
async function breaches(page: Page, item: string, visual: string, what: string) {
  const rows = await measure(page, item, visual);
  if (!rows.length) return [`${what}: no tiles`];
  return rows.flatMap((r, i) => [
    ...(r.fill >= FILL ? [] : [`${what} #${i + 1}: page is ${(r.fill * 100).toFixed(1)}% of the tile width`]),
    ...(r.left <= MAX_PAD && r.right <= MAX_PAD ? [] : [`${what} #${i + 1}: edge ${r.left.toFixed(1)} / ${r.right.toFixed(1)}px`]),
    ...(r.bg === "rgba(0, 0, 0, 0)" ? [] : [`${what} #${i + 1}: tile fill ${r.bg}`]),
  ]);
}

async function check(page: Page, item: string, visual: string, what: string) {
  await expect.poll(() => breaches(page, item, visual, what), { timeout: 5000 }).toEqual([]);
}

for (const [w, h] of [
  [1280, 800],
  [390, 844],
] as const) {
  test.describe(`page tiles at ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test(`Rotate: the page fills >= ${FILL * 100}% of its tile`, async ({ page }) => {
      await page.goto("/rotate-pdf");
      await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
      await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
      await expect(page.getByTestId("page-visual")).toHaveCount(3);
      await check(page, "[role=listitem]:has([data-testid=page-tile])", "[data-testid=page-visual]", "rotate");
    });

    test(`Merge files and pages views: the page fills >= ${FILL * 100}% of its tile`, async ({ page }) => {
      await page.goto("/merge-pdf");
      await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
      await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("three-pages.pdf")]);
      await expect(page.locator("[data-testid=file-card] [data-card-box] > span:first-child")).toHaveCount(2);
      await check(page, "[data-testid=file-card]", "[data-card-box] > span:first-child", "merge files");
      await page.getByRole("radio", { name: "Pages" }).click();
      await expect(page.locator("[data-uid] [data-tile-box] > span:first-child")).toHaveCount(6);
      await check(page, "[data-uid]", "[data-tile-box] > span:first-child", "merge pages");
    });
  });
}
