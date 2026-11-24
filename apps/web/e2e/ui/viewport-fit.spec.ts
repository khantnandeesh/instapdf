/**
 * Fold fit (docs/design/berrypdf.md "Fit the first screen"): on every usable tool page the title,
 * drop area, options panel and primary action are visible on load without scrolling; after a file
 * loads the pages scroll in their own area (desktop) or the page scrolls (phones) and the primary
 * action stays in view; Download is in view on the result.
 *
 * Desktop sizes include real browser viewports (screen minus browser chrome), which are shorter
 * than the screen resolution: a 1366x768 laptop shows about 1366x657 of page.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { isUsable, tools } from "../../src/tools/registry";
import { fx } from "../support/flow";

const usable = tools.filter((t) => isUsable(t) && t.flow);

const DESKTOP: [number, number][] = [
  [1280, 632], // 1280x720 screen in a browser window
  [1280, 720],
  [1366, 657], // 1366x768 screen in a browser window (most common laptop)
  [1366, 768],
  [1440, 789], // 1440x900 screen in a browser window
  [1440, 900],
  [1536, 730], // 1536x864 screen in a browser window
  [1536, 864],
  [1920, 969], // 1920x1080 screen in a browser window
  [1920, 1080],
  [1024, 768], // tablet landscape, first width with the side panel
];
const PHONE: [number, number][] = [
  [360, 640],
  [390, 664], // iPhone 13/14 with Safari bars
  [412, 839], // Pixel 7 with Chrome bars
  [768, 1024], // tablet portrait, bottom dock
];

/** The element's box lies fully inside the viewport (not covered by the fold). */
async function expectInViewport(page: Page, el: Locator, what: string) {
  await expect(el, what).toBeVisible();
  const box = await el.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, what).not.toBeNull();
  expect(box!.y, `${what}: top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${what}: bottom edge must be above the fold (${vp.height}px)`).toBeLessThanOrEqual(vp.height);
  expect(box!.x + box!.width, `${what}: right edge`).toBeLessThanOrEqual(vp.width);
  // Not hidden under the fixed dock, a sticky bar or anything else.
  const onTop = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (node === hit || node.contains(hit));
  });
  expect(onTop, `${what}: not covered by another element`).toBe(true);
}

async function open(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);
}

for (const tool of usable) {
  test.describe(`fold fit: ${tool.slug}`, () => {
    for (const [width, height] of DESKTOP) {
      test(`desktop ${width}x${height}: picker and primary action visible on load, options fold to a bottom bar and pages fill the screen, page preview and Download fit`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "desktop sizes run in the desktop project");
        await page.setViewportSize({ width, height });
        await open(page, tool.slug);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (empty state)");
        await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker");
        await expectInViewport(page, page.getByTestId("dock-status"), "status line");
        await expectInViewport(page, page.locator("[data-ip-dock]"), "options panel");
        await expectInViewport(page, page.getByTestId("drop-card"), "drop area");
        const title = await page.getByRole("heading", { level: 1 }).boundingBox();
        expect(title!.height, "tool title fits on one line (the head has a fixed height)").toBeLessThanOrEqual(44);
        await noHorizontalScroll(page);

        await page.getByTestId("file-input").setInputFiles(fx("sixty-pages.pdf"));
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        // Loaded: the options fold into the compact bottom bar and the pages get most of the screen.
        await expect(page.locator("[data-ip-dock]")).toHaveAttribute("data-ip-dock", "bar");
        await expectInViewport(page, page.getByTestId("dock-options"), "options in the bottom bar");
        const pages = page.getByTestId("pages-scroll");
        await expectInViewport(page, pages, "pages area");
        const box = (await pages.boundingBox())!;
        expect(box.width, "pages use the full content width").toBeGreaterThanOrEqual(Math.min(width, 1280) - 120);
        expect(box.height, "pages get at least half of the screen height").toBeGreaterThanOrEqual(height * 0.5 - 40);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 3000);
        await expect.poll(() => pages.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => window.scrollY), { message: "the page itself does not scroll" }).toBe(0);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded, pages scrolled)");
        await expectInViewport(page, page.getByRole("button", { name: /Add files|Replace file/ }), "add files (loaded, pages scrolled)");

        // The bigger page view fits too: its buttons are on screen.
        await page.getByRole("button", { name: /^Page 1 of/ }).click();
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Close" }), "Close in the page preview");
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Next" }), "Next in the page preview");
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

        await page.getByTestId("primary-action").click();
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
        await expectInViewport(page, page.getByRole("link", { name: "Download" }), "Download (result)");
      });
    }

    for (const [width, height] of PHONE) {
      test(`phone/tablet ${width}x${height}: picker and primary action visible on load`, async ({ page }, info) => {
        test.skip(info.project.name !== "mobile", "phone sizes run in the mobile project");
        await page.setViewportSize({ width, height });
        await open(page, tool.slug);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (empty state)");
        await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker");
        await expectInViewport(page, page.getByTestId("privacy-intro"), "privacy line");
        await noHorizontalScroll(page);

        await page.getByTestId("file-input").setInputFiles(fx("sixty-pages.pdf"));
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        await page.getByRole("button", { name: /^Page 1 of/ }).click();
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Close" }), "Close in the page preview");
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded, scrolled)");
      });
    }
  });
}
