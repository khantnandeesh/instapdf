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
/** Tools with no options at all (F4/F5 §3e, §3g): their bar holds the status, history and primary only. */
const NO_OPTIONS = new Set(["organize-pdf", "alternate-mix-pdf"]);
/** Tools that need a second file before they can run (Alternate & mix mixes two or more). */
const SECOND_FILE: Record<string, string> = { "alternate-mix-pdf": "three-pages.pdf" };
/** Loads the test file (and a second one where the tool needs it). */
async function loadFiles(page: Page, slug: string) {
  await page.getByTestId("file-input").setInputFiles(SECOND_FILE[slug] ? [fx("sixty-pages.pdf"), fx(SECOND_FILE[slug])] : fx("sixty-pages.pdf"));
}

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
    return !!hit && (node === hit || node.contains(hit)) ? "" : (hit?.outerHTML.slice(0, 160) ?? "nothing");
  });
  expect(onTop, `${what}: not covered by another element`).toBe("");
}

/**
 * Opens the bigger view of the first page. Tools on the shared page grid have a "Page 1 of N" tile
 * button; Merge opens it from its file card (files view) or a page tile's More menu (pages view).
 */
async function openFirstPagePreview(page: Page) {
  const pageButton = page.getByRole("button", { name: /^Page 1 of/ });
  if (await pageButton.count()) return pageButton.first().click();
  const card = page.getByTestId("card-main").first();
  if (await card.isVisible()) return card.click();
  const tile = page.getByTestId("page-tile").first();
  await tile.hover();
  // A read-only grid (Alternate's result order) has no More menu: the tile itself shows the page larger.
  if (!(await tile.getByTestId("tile-more").count())) return page.getByTestId("tile-main").first().click();
  await tile.getByTestId("tile-more").click();
  await page.getByRole("menuitem", { name: "Enlarge" }).click();
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
        if (await page.getByTestId("cloud-caret").count()) {
          await expectInViewport(page, page.getByTestId("cloud-caret"), "sources caret (empty state)");
          await expectInViewport(page, page.getByTestId("cloud-row"), "cloud row (empty state)");
        }
        // The panel grows with its options and never scrolls inside (design rule "Scrolling"): its top
        // and first option are on the first screen; a tall panel runs past the fold while its status and
        // primary stay pinned to the bottom of the screen.
        const dock = (await page.locator("[data-ip-dock]").boundingBox())!;
        expect(dock.y, "options panel starts on the first screen").toBeGreaterThanOrEqual(0);
        // A tool with no options opens on the bottom bar instead of a side panel (F4/F5 P-3): it is all on screen.
        if (NO_OPTIONS.has(tool.slug)) await expectInViewport(page, page.locator("[data-ip-dock]"), "bottom bar (empty state)");
        else expect(dock.y + 120, "options panel: its first option is on the first screen").toBeLessThanOrEqual(height);
        await expectInViewport(page, page.getByTestId("drop-card"), "drop area");
        // Scroll the page to the end of the panel (every option read): the drop area and the primary stay in view.
        await page.evaluate(() => {
          const r = document.querySelector("[data-ip-dock]")!.getBoundingClientRect();
          // "instant": the checks below are about layout, so they never ride on a smooth scroll. Before #31 the
          // site-wide scroll-behavior: smooth turned this into an animation that the reset to 0 below did not
          // cancel (scrollY stayed at 2 or 3).
          window.scrollTo({ top: Math.max(0, window.scrollY + r.bottom - window.innerHeight + 20), behavior: "instant" });
        });
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (empty state, all options scrolled into view)");
        await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker (all options scrolled into view)");
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        const title = await page.getByRole("heading", { level: 1 }).boundingBox();
        expect(title!.height, "tool title fits on one line (the head has a fixed height)").toBeLessThanOrEqual(44);
        await noHorizontalScroll(page);

        await loadFiles(page, tool.slug);
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        // Loaded: the options fold into the compact bottom bar and the pages get most of the screen.
        await expect(page.locator("[data-ip-dock]")).toHaveAttribute("data-ip-dock", "bar");
        // A tool with few options shows them in the bar; one with many (density "full", Merge) shows
        // its Options button there, which opens them in a sheet.
        if (NO_OPTIONS.has(tool.slug)) await expect(page.locator("[data-ip-dock]").getByTestId("dock-options").or(page.getByTestId("options-button"))).toHaveCount(0);
        else await expectInViewport(page, page.locator("[data-ip-dock]").getByTestId("dock-options").or(page.getByTestId("options-button")), "options in the bottom bar");
        // Tools with a Files / Pages view (Merge opens on files): the pages checks below run on the pages.
        const pagesView = page.getByRole("radio", { name: "Pages", exact: true });
        if (await pagesView.count()) await pagesView.click();
        const pages = page.getByTestId("pages-scroll");
        await expectInViewport(page, pages, "pages area");
        const box = (await pages.boundingBox())!;
        expect(box.width, "pages use the full content width").toBeGreaterThanOrEqual(Math.min(width, 1280) - 120);
        expect(box.height, "pages get at least half of the screen height").toBeGreaterThanOrEqual(height * 0.5 - 40);
        // 60 pages overflow the area (wait for the grid to lay out, e.g. right after a view switch).
        await expect.poll(() => pages.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 3000);
        await expect.poll(() => pages.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        // Wheel well past the end of the pages: the scroll must stay inside the pages area
        // (overscroll-behavior: contain), so the page itself never moves.
        for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 20_000);
        await expect.poll(() => pages.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1)).toBe(true);
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.scrollY), "the page itself does not scroll").toBe(0);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded, pages scrolled)");
        await expectInViewport(page, page.getByRole("button", { name: /^(Add files|Replace file)$/ }), "add files (loaded, pages scrolled)");

        // The bigger page view fits too: its buttons are on screen.
        await openFirstPagePreview(page);
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Close" }), "Close in the page preview");
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Next" }), "Next in the page preview");
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

        // At the largest thumbnail size the pages area still ends above the bottom bar.
        await page.getByRole("slider", { name: "Thumbnail size" }).focus();
        await page.keyboard.press("End");
        await expect
          .poll(
            async () => {
              const scroller = (await pages.boundingBox())!;
              const bar = (await page.locator("[data-ip-dock]").boundingBox())!;
              return scroller.y + scroller.height <= bar.y + 1;
            },
            {
              message: "pages area (max thumbnails) ends above the bottom bar",
            },
          )
          .toBe(true);

        await page.getByTestId("primary-action").click();
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
        // The result scrolls the page back to the top: wait for the result to settle.
        await expect(async () => expectInViewport(page, page.getByRole("link", { name: "Download" }), "Download (result)")).toPass({ timeout: 5_000 });
        // F23 (AC-169): with cloud sources on, the result's second action (Save to…) fits beside Download.
        if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") {
          await expect(page.getByTestId("save-main")).toBeVisible();
          await expectInViewport(page, page.getByTestId("save-main"), "Save to cloud (result)");
        }
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
        // F23 (AC-156, from 390x664): with cloud sources on, the sources caret and the cloud row are on the first screen too.
        if (height >= 664 && (await page.getByTestId("cloud-caret").count())) {
          await expectInViewport(page, page.getByTestId("cloud-caret"), "sources caret (empty state)");
          await expectInViewport(page, page.getByTestId("cloud-row"), "cloud row (empty state)");
        }
        await noHorizontalScroll(page);

        await loadFiles(page, tool.slug);
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        await openFirstPagePreview(page);
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Close" }), "Close in the page preview");
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded, scrolled)");

        await page.getByTestId("primary-action").click();
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
        await expect(async () => expectInViewport(page, page.getByRole("link", { name: "Download" }), "Download (result)")).toPass({ timeout: 5_000 });
        // F23 (AC-169): with cloud sources on, the result's second action (Save to…) fits beside Download.
        if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") {
          await expect(page.getByTestId("save-main")).toBeVisible();
          await expectInViewport(page, page.getByTestId("save-main"), "Save to cloud (result)");
        }
      });
    }
  });
}
