/**
 * The result screen opens at the top (docs/design/berrypdf.md "Fit the first screen", rule 8), even when a
 * smooth scroll is still in flight as the result appears. An instant scrollTo does not cancel a smooth one,
 * and a smooth scroll that has started may still read scrollY 0, so a "reset only if scrolled" check let the
 * animation finish and carry Download off screen (CI: Download at top -143 and -348).
 */
import { expect, test } from "@playwright/test";
import { isUsable, tools } from "../../src/tools/registry";
import { fx } from "../support/flow";

const usable = tools.filter((t) => isUsable(t) && t.flow);

for (const tool of usable) {
  test(`${tool.slug}: a smooth scroll in flight when the result appears does not carry Download away`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one desktop run is enough");
    await page.setViewportSize({ width: 1366, height: 657 });
    await page.goto(`/${tool.slug}`);
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles(fx("sixty-pages.pdf"));
    await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
    // The moment the flow reports "done", start a smooth scroll down (what a late wheel or an anchor jump does).
    await page.evaluate(() => {
      const flow = document.querySelector("[data-testid=tool-flow]")!;
      new MutationObserver((_, obs) => {
        if (flow.getAttribute("data-state") !== "done") return;
        obs.disconnect();
        window.scrollTo({ top: 600, behavior: "smooth" });
      }).observe(flow, { attributes: true, attributeFilter: ["data-state"] });
    });
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
    // The page must be tall enough for the smooth scroll to go somewhere, or the test proves nothing.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), "the result page can scroll").toBeGreaterThan(0);
    // Let any smooth scroll run to its end.
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.scrollY), "the result stays at the top").toBe(0);
    const box = (await page.getByRole("link", { name: "Download" }).boundingBox())!;
    expect(box.y, "Download top is on screen").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "Download bottom is on screen").toBeLessThanOrEqual(657);
  });
}
