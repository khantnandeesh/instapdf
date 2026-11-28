/**
 * Fold fit (docs/design/berrypdf.md "Fit the first screen", F25): on every usable tool page the title
 * and the picker card are visible on load without scrolling; after a file loads the options and the
 * primary join the top row (from 1024) or the bottom dock, the pages scroll in their own area (desktop)
 * or the page scrolls (phones) and the primary stays in view; Download is in view on the result.
 *
 * Desktop sizes include real browser viewports (screen minus browser chrome), which are shorter
 * than the screen resolution: a 1366x768 laptop shows about 1366x657 of page.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { isUsable, tools } from "../../src/tools/registry";
import { fx, makeRunnable, toolFixtures } from "../support/flow";

const usable = tools.filter((t) => isUsable(t) && t.flow);
/** Tools with no options at all (F4/F5 §3e, §3g): their bar holds the status, history and primary only. */
const NO_OPTIONS = new Set(["organize-pdf", "alternate-mix-pdf", "pdf-to-text", "extract-images", "unlock-pdf", "repair-pdf"]);
/** Settings tools (F25 §4): from 1024 px the options are a side panel beside the pages, under the top row. */
const SIDE_PANEL = 340;
/** Loads the test file (and a second one where the tool needs it). */
async function loadFiles(page: Page, slug: string) {
  await page.getByTestId("file-input").setInputFiles(toolFixtures(slug));
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
  [1024, 768], // tablet landscape, first width with the top row
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
 * Opens the bigger view of the first page. Tools on the shared page grid have a "Page 1 …" tile
 * button that opens it (Rotate "Page 1 of N", Split "Page 1, part 1 of N"); where the tile toggles
 * the page instead (Extract, Delete: it carries aria-pressed), its "Enlarge page 1" button opens it
 * (spec F4/F5 UI decision 12). Merge opens it from its file card (files view) or a page tile's More
 * menu (pages view).
 */
async function openFirstPagePreview(page: Page) {
  const pageButton = page.getByRole("button", { name: /^Page 1\b/ }).and(page.locator("[data-tile-button]:not([aria-pressed])"));
  if (await pageButton.count()) return pageButton.first().click();
  const enlarge = page.getByRole("button", { name: "Enlarge page 1", exact: true });
  if (await enlarge.count()) return enlarge.first().click();
  const card = page.getByTestId("card-main").first();
  if (await card.isVisible()) return card.click();
  // The whole tile: below 1024 px its More button sits in the row under the page (PT-1 rule 6).
  const tile = page.locator("[data-uid]").first();
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

// One test per tool and screen size, each on a page of its own: the file's tests are shared out among the
// workers, so the file does not take longer on one machine with every tool added.
test.describe.configure({ mode: "parallel" });

for (const tool of usable) {
  test.describe(`fold fit: ${tool.slug}`, () => {
    for (const [width, height] of DESKTOP) {
      test(`desktop ${width}x${height}: picker card on load, options join the top row and pages fill the screen, page preview and Download fit`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "desktop sizes run in the desktop project");
        await page.setViewportSize({ width, height });
        await open(page, tool.slug);
        // F25 §2 (AC-600): the empty state is the picker card alone: no primary, no dock, no options panel.
        await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker");
        await expect(page.getByTestId("primary-action")).toHaveCount(0);
        await expect(page.locator("[data-ip-dock]")).toHaveCount(0);
        if (await page.getByTestId("cloud-caret").count()) {
          await expectInViewport(page, page.getByTestId("cloud-caret"), "sources caret (empty state)");
          await expectInViewport(page, page.getByTestId("cloud-caret"), "cloud caret (empty state)");
        }
        await expectInViewport(page, page.getByTestId("privacy-intro"), "privacy line (empty state)");
        expect(await page.evaluate(() => window.scrollY), "the empty state needs no scroll").toBe(0);
        const title = await page.getByRole("heading", { level: 1 }).boundingBox();
        expect(title!.height, "tool title fits on one line (the head has a fixed height)").toBeLessThanOrEqual(44);
        await noHorizontalScroll(page);

        await loadFiles(page, tool.slug);
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        // Loaded (F25 §3): from 1024 the options join the sticky top row beside the h1, and the pages get the
        // rest of the screen. A tool with few options shows them inline; one with many (density "full",
        // Merge) shows More options there, which opens them in a popover.
        const row = page.locator("[data-ip-dock]");
        await expect(row).toHaveAttribute("data-ip-dock", "row");
        await expectInViewport(page, row, "top row (loaded)");
        const rowBox = (await row.boundingBox())!;
        const settings = tool.flow?.layout === "settings";
        if (settings) await expectInViewport(page, page.getByTestId("dock-options"), "options in the side panel");
        else if (NO_OPTIONS.has(tool.slug)) await expect(row.getByTestId("dock-options").or(page.getByTestId("options-button"))).toHaveCount(0);
        // Inline options, a full-density tool's row options (from 1280 px) or its More options trigger.
        else await expectInViewport(page, row.locator(":is([data-testid=dock-options], [data-testid=dock-row-options], [data-testid=options-button]):visible").first(), "options in the top row");
        // Tools with a Files / Pages view (Merge opens on files): the pages checks below run on the pages.
        const pagesView = page.getByRole("radio", { name: "Pages", exact: true });
        if (await pagesView.count()) await pagesView.click();
        const pages = page.getByTestId("pages-scroll");
        await expectInViewport(page, pages, "pages area");
        const box = (await pages.boundingBox())!;
        expect(box.width, "pages use the full content width").toBeGreaterThanOrEqual(Math.min(width, 1280) - 120 - (settings ? SIDE_PANEL : 0));
        // From 1440 the row and the stage widen past the 1280 column, up to 1856px with 32px gutters (G-14).
        if (width >= 1440) {
          const wide = Math.min(width - 64, 1856);
          const toolRow = (await page.getByTestId("tool-intro").boundingBox())!;
          expect(toolRow.width, "the top row widens on a large screen").toBeGreaterThanOrEqual(wide - 2);
          expect(box.width, "the pages widen with it").toBeGreaterThanOrEqual(wide - 120 - (settings ? SIDE_PANEL : 0));
        }
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

        // At the largest thumbnail size the pages area still sits under the top row and ends above the fold.
        await page.getByRole("slider", { name: "Thumbnail size" }).focus();
        await page.keyboard.press("End");
        await expect
          .poll(
            async () => {
              const scroller = (await pages.boundingBox())!;
              return scroller.y >= rowBox.y + rowBox.height - 1 && scroller.y + scroller.height <= height + 1;
            },
            {
              message: "pages area (max thumbnails) lies between the top row and the fold",
            },
          )
          .toBe(true);

        await makeRunnable(page);
        await page.getByTestId("primary-action").click();
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
        // The result scrolls the page back to the top: wait for the result to settle.
        await expect(async () => expectInViewport(page, page.getByRole("link", { name: "Download" }), "Download (result)")).toPass({ timeout: 5_000 });
        // F23 (AC-169): with cloud sources on, the result's second action (Save to…) fits beside Download.
        if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") {
          await expect(page.getByTestId("save-cloud")).toBeVisible();
          await expectInViewport(page, page.getByTestId("save-cloud"), "Save to cloud (result)");
        }
      });
    }

    for (const [width, height] of PHONE) {
      test(`phone/tablet ${width}x${height}: picker card on load, primary in the bottom dock once loaded`, async ({ page }, info) => {
        test.skip(info.project.name !== "mobile", "phone sizes run in the mobile project");
        await page.setViewportSize({ width, height });
        await open(page, tool.slug);
        // F25 §2 (AC-600): the picker card alone, no primary and no dock until a file is in.
        await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker");
        await expect(page.getByTestId("primary-action")).toHaveCount(0);
        await expect(page.locator("[data-ip-dock]")).toHaveCount(0);
        await expectInViewport(page, page.getByTestId("privacy-intro"), "privacy line");
        // F23 (AC-156, from 390x664): with cloud sources on, the sources caret and the cloud row are on the first screen too.
        if (height >= 664 && (await page.getByTestId("cloud-caret").count())) {
          await expectInViewport(page, page.getByTestId("cloud-caret"), "sources caret (empty state)");
          await expectInViewport(page, page.getByTestId("cloud-caret"), "cloud caret (empty state)");
        }
        await noHorizontalScroll(page);

        await loadFiles(page, tool.slug);
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded)");
        // Below 1024 the options, status and primary stay in the bottom dock (F25 §3.2).
        await expect(page.locator("[data-ip-dock]")).toHaveAttribute("data-ip-dock", "bar");
        await openFirstPagePreview(page);
        await expectInViewport(page, page.getByRole("dialog").getByRole("button", { name: "Close" }), "Close in the page preview");
        await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expectInViewport(page, page.getByTestId("primary-action"), "primary action (loaded, scrolled)");

        await makeRunnable(page);
        await page.getByTestId("primary-action").click();
        await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
        await expect(async () => expectInViewport(page, page.getByRole("link", { name: "Download" }), "Download (result)")).toPass({ timeout: 5_000 });
        // F25 §7: below 1024 Download sits in the bottom dock's action slot.
        await expect(page.locator("[data-ip-dock=bar]").getByRole("link", { name: "Download" })).toBeVisible();
        // F23 (AC-169): with cloud sources on, the result's second action (Save to…) fits beside Download.
        if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") {
          await expect(page.getByTestId("save-cloud")).toBeVisible();
          await expectInViewport(page, page.getByTestId("save-cloud"), "Save to cloud (result)");
        }
      });
    }
  });
}

// Edit PDF (F25 §5, eval G-1): at rest and with the navbar slid away (pages scrolled down), the editor bar,
// Download, the page strip and the view controls are on screen and uncovered, and the page never scrolls.
test.describe("fold fit: edit-pdf", () => {
  for (const [width, height] of DESKTOP) {
    test(`desktop ${width}x${height}: the editor fits at rest and with the navbar slid away`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "desktop sizes run in the desktop project");
      await page.setViewportSize({ width, height });
      await page.goto("/edit-pdf");
      await expect(page.locator("[data-testid=editor][data-hydrated]")).toBeVisible();
      await expectInViewport(page, page.getByTestId("drop-card").getByRole("button").first(), "file picker");
      await page.getByTestId("editor-input").setInputFiles(fx("sixty-pages.pdf"));
      await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
      const check = async (state: string) => {
        await expectInViewport(page, page.getByTestId("download"), `Download (${state})`);
        await expectInViewport(page, page.getByRole("button", { name: "Undo" }), `Undo (${state})`);
        await expectInViewport(page, page.getByTestId("editor-strip"), `page strip (${state})`);
        await expectInViewport(page, page.locator("[data-region=view]"), `view controls (${state})`);
        const bar = (await page.locator(".ed-top").boundingBox())!;
        const canvas = (await page.getByTestId("canvas").boundingBox())!;
        expect(canvas.y + canvas.height, `canvas ends at the fold (${state})`).toBeLessThanOrEqual(height + 1);
        expect(bar.y + bar.height, `editor bar above the pages (${state})`).toBeLessThanOrEqual(height / 3);
        expect(await page.evaluate(() => window.scrollY), `the page itself never scrolls (${state})`).toBe(0);
        await noHorizontalScroll(page);
        return bar;
      };
      await check("at rest");
      await page.getByTestId("canvas").evaluate((el) => el.scrollBy(0, 900));
      if (process.env.NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE !== "0" && height > 600) {
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.edNav ?? "shown")).toBe("hidden");
        await page.waitForTimeout(300); // the slide
        const bar = await check("navbar away");
        expect(bar.y, "the editor bar takes the navbar's place").toBeLessThanOrEqual(1);
      } else await check("scrolled");
    });
  }
});
