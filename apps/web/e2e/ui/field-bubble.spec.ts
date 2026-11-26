/**
 * The page tools' hint and error bubbles stay inside the screen on the narrowest phone (visual review
 * 2026-11-26): a field near the right edge slides its bubble left, and the tail still points at the field.
 * Spec F4/F5 UI P-4 `FieldBubble`, P-5.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { isDesktop } from "../support/flow";
import { openReady } from "../f4/support";

test.use({ viewport: { width: 320, height: 640 } });

async function insideScreen(page: Page, bubble: Locator) {
  await expect(bubble).toBeVisible();
  // Let the 120ms entrance finish before measuring.
  await page.waitForTimeout(200);
  const r = (await bubble.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(r.x, "left edge").toBeGreaterThanOrEqual(15.5);
  expect(r.x + r.width, "right edge").toBeLessThanOrEqual(vw - 15.5);
}

test("Extract at 320: the error bubble for an out-of-range page is inside the screen", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "a phone width; once is enough");
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await page.getByRole("radio", { name: "Custom" }).click();
  await page.getByTestId("range-field").fill("2-6, 13");
  await page.getByTestId("range-field").blur();
  await insideScreen(page, page.getByTestId("field-error"));
});

test("Split at 320: the error bubble for unreadable parts is inside the screen", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "a phone width; once is enough");
  await openReady(page, "split-pdf", "twelve.pdf");
  await page.getByRole("combobox", { name: "Split" }).selectOption({ label: "Custom" });
  await page.getByTestId("range-field").fill("1-3, 2-x");
  await page.getByTestId("range-field").blur();
  await insideScreen(page, page.getByTestId("field-error"));
});
