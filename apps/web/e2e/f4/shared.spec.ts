/** F4 shared checks (spec docs/specs/f4-f5-page-tools.md, "F4 shared"): AC-400, AC-401, AC-407, AC-411, AC-412 (in part). */
import { expect, test } from "@playwright/test";
import {
  dialog,
  downloadResult,
  fileInput,
  flow,
  isDesktop,
  loadPlain,
  openReady,
  openTool,
  pageCountOf,
  pick,
  pressedPages,
  primary,
  rotateRight,
  run,
  runDownload,
  tileButton,
  tiles,
  type F4Slug,
} from "./support";

const slugs: F4Slug[] = ["split-pdf", "extract-pdf-pages", "delete-pdf-pages"];

for (const slug of slugs) {
  test(`AC-400: /${slug} shows the tool; its input takes several PDFs`, async ({ page }) => {
    await openTool(page, slug);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/coming soon/i);
    await expect(fileInput(page)).toHaveAttribute("accept", /\.pdf|application\/pdf/);
    await expect(fileInput(page)).toHaveAttribute("multiple", "");
  });

  test(`AC-401: /${slug} reaches ready with twelve.pdf, 12 tiles and the primary in view`, async ({ page }) => {
    await openReady(page, slug, "twelve.pdf");
    await expect(tiles(page)).toHaveCount(12);
    for (let n = 1; n <= 12; n++) await expect(page.locator(`[data-page-index="${n - 1}"]`)).toContainText(String(n));
    await expect(primary(page)).toBeInViewport();
  });

  test(`AC-407: /${slug} loads twelve.pdf and three-pages.pdf together with the view toggle`, async ({ page }) => {
    await openReady(page, slug, "twelve.pdf", "three-pages.pdf");
    await expect(tiles(page)).toHaveCount(15);
    await expect(flow(page).getByText(/upgrade|only one file|single file/i)).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /^Pages$/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Files$/ })).toBeVisible();
  });
}

test("AC-411: owner-restricted.pdf loads with no password prompt; every output opens without one", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  const plain = async (bytes: Uint8Array) => {
    const doc = await loadPlain(bytes);
    expect(doc.isEncrypted).toBe(false);
    return doc.getPageCount();
  };
  await openReady(page, "extract-pdf-pages", "owner-restricted.pdf");
  await expect(dialog(page)).toHaveCount(0);
  await tileButton(page, "Page 1 of 3").click();
  let out = await runDownload(page);
  expect(await plain(out.bytes)).toBe(1);

  await openReady(page, "delete-pdf-pages", "owner-restricted.pdf");
  await expect(dialog(page)).toHaveCount(0);
  await tileButton(page, "Remove page 1").click();
  out = await runDownload(page);
  expect(await plain(out.bytes)).toBe(2);

  await openReady(page, "split-pdf", "owner-restricted.pdf");
  await expect(dialog(page)).toHaveCount(0);
  out = await runDownload(page);
  expect(out.entries).toHaveLength(3);
  for (const [, bytes] of out.entries!) expect(await plain(bytes)).toBe(1);
});

test("AC-412 (F4 part): Rotate continues to Split, Extract pages and Delete pages; Delete opens ready with the rotated file", async ({ page }) => {
  await page.goto("/rotate-pdf");
  await pick(page, "three-pages.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await rotateRight(page).click();
  await run(page);
  const keep = page.getByRole("heading", { name: "Keep going with this file" }).locator("..");
  for (const name of ["Split", "Extract pages", "Delete pages"]) await expect(keep.getByRole("button", { name, exact: true })).toBeVisible();
  await keep.getByRole("button", { name: "Delete pages", exact: true }).click();
  await expect(page).toHaveURL(/\/delete-pdf-pages$/);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  // The loaded file is Rotate's output: its pages are landscape on screen.
  const b = (await page.getByTestId("page-visual").first().boundingBox())!;
  expect(b.width).toBeGreaterThan(b.height);
});

test("Extract's single PDF continues into Delete pages with that file", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await page.getByTestId("range-field").fill("1-4");
  await expect.poll(() => pressedPages(page)).toEqual([1, 2, 3, 4]);
  await run(page);
  await page.getByRole("button", { name: "Delete pages", exact: true }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(4);
  await tileButton(page, "Remove page 1").click();
  await run(page);
  const out = await downloadResult(page);
  expect(await pageCountOf(out.bytes)).toBe(3);
});
