/**
 * Page tiles rule (docs/design/berrypdf.md "Page tiles", owner 2026-11-26): the page fills at least
 * 90% of its tile's width (--ip-tile-fill), the tile's edge is at most 8px each side, and the tile has
 * no filled background (no pink tray). Checked at 1280x800, 390x844 and 320x568 on Rotate, Merge's files
 * view and Merge's pages view, with A4 portrait pages (the common and the narrowest case the rule covers),
 * and on the page tools: Split, Extract and Delete (with their states: part outlines and marks, picked
 * and marked pages), Organize, Combine & reorder, and Alternate & mix (its wide file cards follow rule 3
 * and rule 6; its read-only result view uses plain tiles). Below 1024 px no control may sit on a page
 * (rule 6), and Merge's toolbar fits a 320 px screen.
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
  if ((page.viewportSize()?.width ?? 1280) < 1024) await expect.poll(() => onPage(page, visual, what), { timeout: 5000 }).toEqual([]);
}

/**
 * PT-1 rule 6 below 1024 px: every control in the grid (buttons, menu triggers, insert points, the
 * selection mark) is clear of every page. The tile's own main button is the page itself and is skipped.
 */
async function onPage(page: Page, visual: string, what: string) {
  return page.evaluate(
    ({ visual, what }) => {
      const grid = document.querySelector("[data-testid=page-grid], [data-testid=segment-grid], [data-testid=file-grid]")!;
      const pages = [...grid.querySelectorAll(visual)].map((e) => e.getBoundingClientRect());
      const controls = [...grid.querySelectorAll<HTMLElement>("button, [data-testid=tile-select]")].filter(
        (e) => !e.matches("[data-main], [data-tile-button], [data-testid=add-tile]") && e.getClientRects().length > 0,
      );
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      return controls.flatMap((c) => {
        const r = c.getBoundingClientRect();
        return pages.some((p) => hit(r, p)) ? [`${what}: "${c.getAttribute("aria-label") ?? c.dataset.testid}" is on a page`] : [];
      });
    },
    { visual, what },
  );
}

for (const [w, h] of [
  [1280, 800],
  [390, 844],
  [320, 568],
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

    test(`Split, Extract and Delete: the page fills >= ${FILL * 100}% of its tile, with their states on`, async ({ page }) => {
      const tiles = "[role=listitem]:has([data-testid=page-tile])";
      for (const slug of ["split-pdf", "extract-pdf-pages", "delete-pdf-pages"]) {
        await page.goto(`/${slug}`);
        await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
        await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
        await expect(page.getByTestId("page-visual")).toHaveCount(3);
        // A state on the first page: Extract picks it, Delete marks it (a tap on the tile toggles both).
        if (slug !== "split-pdf") {
          await page.getByTestId("page-tile").first().locator("[data-tile-button]").click();
          await expect(page.locator(slug === "delete-pdf-pages" ? "[data-marked]" : "[data-picked]")).toHaveCount(1);
        }
        await check(page, tiles, "[data-testid=page-visual]", slug);
      }
    });

    test(`Organize and Combine & reorder: the page fills >= ${FILL * 100}% of its tile`, async ({ page }) => {
      for (const slug of ["organize-pdf", "combine-reorder-pdf"]) {
        await page.goto(`/${slug}`);
        await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
        await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("three-pages.pdf")]);
        await expect(page.locator("[data-uid] [data-tile-box] > span:first-child")).toHaveCount(6);
        await check(page, "[data-uid]", "[data-tile-box] > span:first-child", `${slug} pages`);
        await page.getByRole("radio", { name: "Files" }).click();
        await expect(page.locator("[data-testid=file-card] [data-card-box] > span:first-child")).toHaveCount(2);
        await check(page, "[data-testid=file-card]", "[data-card-box] > span:first-child", `${slug} files`);
      }
    });

    test("Alternate & mix: file cards keep controls off the page and the name under it; the result view uses plain tiles", async ({ page }) => {
      await page.goto("/alternate-mix-pdf");
      await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
      await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("three-pages.pdf")]);
      const box = "[data-card-box] > span:first-child";
      await expect(page.locator(`[data-testid=file-card] ${box}`)).toHaveCount(2);
      // Rule 6 at every width for the wide cards (their controls never float over the page), and rule 3.
      await expect.poll(() => onPage(page, box, "alternate cards"), { timeout: 5000 }).toEqual([]);
      const under = await page.getByTestId("file-card").evaluateAll((cards, box) =>
        cards.map((c) => c.querySelector("[data-testid=file-name]")!.getBoundingClientRect().top >= c.querySelector(box)!.getBoundingClientRect().bottom - 0.5),
      box);
      expect(under).toEqual([true, true]);
      await expect.poll(() => page.getByTestId("file-card").evaluateAll((cards) => cards.map((c) => getComputedStyle(c).backgroundColor)), { timeout: 5000 }).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
      await page.getByRole("radio", { name: "Pages" }).click();
      await expect(page.locator("[data-uid] [data-tile-box] > span:first-child")).toHaveCount(6);
      await check(page, "[data-uid]", "[data-tile-box] > span:first-child", "alternate result");
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
      // The tools row fits the panel: nothing runs past its edge and no two controls overlap.
      const row = await page
        .getByRole("radiogroup", { name: "View" })
        .locator("xpath=..")
        .evaluate((bar) => {
          const box = bar.getBoundingClientRect();
          // The view switch counts as one control; buttons inside it are its options.
          const kids = [...bar.querySelectorAll<HTMLElement>("[role=radiogroup], button")].filter((e) => e.getClientRects().length > 0 && (e.matches("[role=radiogroup]") || !e.closest("[role=radiogroup]")));
          const rects = kids.map((e) => e.getBoundingClientRect());
          const out = rects.filter((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5).length;
          let overlaps = 0;
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rects[i].left < rects[j].right - 0.5 && rects[j].left < rects[i].right - 0.5 && rects[i].top < rects[j].bottom - 0.5 && rects[j].top < rects[i].bottom - 0.5) overlaps++;
          return { out, overlaps, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
      expect(row, "merge toolbar fits").toEqual({ out: 0, overlaps: 0, scroll: 0 });
    });
  });
}
