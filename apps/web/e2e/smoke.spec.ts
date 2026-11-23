import { expect, test } from "@playwright/test";
import { tools } from "../src/tools/registry";

test("home lists every tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const t of tools) {
    const link = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
    await expect(link).toBeVisible();
    await expect(link).toContainText(t.name);
  }
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});
