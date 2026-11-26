/** F5 page tools, shared checks on all three routes. Spec: docs/specs/f4-f5-page-tools.md §7 (AC-480, AC-481, AC-483), UI P-3, P-12. */
import { expect, test } from "@playwright/test";
import { f5fx, flow, open, pickF5, toolbarOverflow } from "./support";

const routes = [
  { slug: "organize-pdf", h1: /Organize PDF/i },
  { slug: "combine-reorder-pdf", h1: /Combine/i },
  { slug: "alternate-mix-pdf", h1: /Alternate/i },
] as const;

for (const { slug, h1 } of routes) {
  test.describe(`/${slug}`, () => {
    test("AC-480: shows the tool; the file input takes several files of the accepted types", async ({ page }) => {
      await open(page, slug);
      await expect(page.locator("h1")).toHaveText(h1);
      const input = page.getByTestId("file-input");
      await expect(input).toHaveAttribute("multiple", "");
      const accept = (await input.getAttribute("accept")) ?? "";
      for (const ext of [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"]) expect(accept).toContain(ext);
    });

    test("AC-481: owner-restricted.pdf loads with no prompt", async ({ page }) => {
      await open(page, slug);
      await pickF5(page, "owner-restricted.pdf");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("file-card").or(page.getByTestId("page-tile")).first()).toBeVisible();
    });

    test("AC-483: 51 copies load 50 and give the 50-file cap @serial", async ({ page }) => {
      test.slow();
      await open(page, slug);
      const one = await f5fx("three-pages.pdf");
      await page.getByTestId("file-input").setInputFiles(Array.from({ length: 51 }, (_, i) => ({ ...one, name: `copy-${i + 1}.pdf` })));
      await expect(page.getByTestId("notice").filter({ hasText: "50" }).first()).toBeVisible();
      await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
      await expect(page.getByTestId("dock-status")).toHaveText(/150 pages · 50 files/);
    });

    test("P-3: the toolbar is one row and nothing scrolls sideways at 320 px", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, slug);
      await pickF5(page, "three-pages.pdf", "short.pdf");
      for (const view of ["Pages", "Files"]) {
        await page.getByRole("radio", { name: view, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll (${view})`).toBe(0);
        expect(await toolbarOverflow(page), `controls outside the tools row (${view})`).toEqual([]);
      }
    });
  });
}
