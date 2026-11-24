/** F23 with the flag off (the default build): tool pages are exactly as before F23. Spec: AC-120 */
import { expect, test } from "@playwright/test";
import { openMerge, pickMerge, runAndDownload } from "../f3/support";
import { cloudOn, openRotate, pickReady, run } from "./support";

test.skip(cloudOn, "checks the build without NEXT_PUBLIC_CLOUD_SOURCES=1");

const PROVIDERS = /Google Drive|Dropbox|OneDrive/;

test("AC-120: no sources trigger or provider name on /rotate-pdf, empty, ready or done", async ({ page }) => {
  await openRotate(page);
  const none = async (what: string) => {
    for (const id of ["cloud-caret", "cloud-caret-toolbar", "cloud-row", "save-main"]) await expect(page.getByTestId(id), `${what}: ${id}`).toHaveCount(0);
    expect(await page.locator("body").innerText(), what).not.toMatch(PROVIDERS);
    await expect(page.locator("[aria-haspopup=menu]").filter({ hasText: PROVIDERS }), what).toHaveCount(0);
  };
  await none("empty");
  await pickReady(page, "alpha.pdf");
  await none("ready");
  await run(page);
  await none("result");
});

test("AC-120: no sources trigger or provider name on /merge-pdf, in any menu", async ({ page }) => {
  await openMerge(page);
  expect(await page.locator("body").innerText()).not.toMatch(PROVIDERS);
  await expect(page.getByTestId("cloud-row")).toHaveCount(0);
  await expect(page.getByTestId("cloud-caret")).toHaveCount(0);
  await pickMerge(page, "alpha.pdf");
  // Open every menu the workspace has: none lists a provider.
  // A filter, not a visible pseudo-class in the selector: Tailwind scans this file and would read that as a class.
  for (const trigger of await page.locator("[aria-haspopup=menu]").filter({ visible: true }).all()) {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await page.getByRole("menu").innerText()).not.toMatch(PROVIDERS);
    await page.keyboard.press("Escape");
  }
  await expect(page.getByTestId("cloud-caret-toolbar")).toHaveCount(0);
  await runAndDownload(page);
  expect(await page.locator("body").innerText()).not.toMatch(PROVIDERS);
});

test("AC-120: the HTML and the first-load scripts carry no cloud code", async ({ request }) => {
  for (const path of ["/rotate-pdf", "/merge-pdf"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/cloud-row|cloud-caret|data-cloud-last|berrypdf:cloud/);
    expect(html, path).not.toMatch(PROVIDERS);
    for (const src of html.match(/\/_next\/static\/chunks\/[^"]+\.js/g) ?? []) {
      const js = await (await request.get(src)).text();
      expect(js, `${path} ${src}`).not.toMatch(/berrypdf:cloud|\/cloud\/mock|BroadcastChannel\("cloud:/);
    }
  }
});
