/** F8 Crop, Resize, Flip, N-up: spec docs/specs/f8-page-shape.md, AC-1000 onwards. The engines' geometry is unit tested. */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, fixtureBytes, flow, loadPlain, pick, primary, run, textsOf, tiles } from "../support/flow";

async function open(page: Page, slug: string, ...names: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}
const sizes = async (bytes: Uint8Array) => (await loadPlain(bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
const status = (page: Page) => page.getByTestId("dock-status");

test.describe("Flip", () => {
  test("AC-1000, AC-1004: the pages are shown mirrored and the file comes out with the same pages", async ({ page }) => {
    await open(page, "flip-pdf", "three-pages.pdf");
    await expect(primary(page)).toHaveText("Flip 3 pages");
    await expect(page.locator(".ip-flip--horizontal")).toHaveCount(3);
    await page.getByRole("radio", { name: "Top to bottom" }).click();
    await expect(page.locator(".ip-flip--vertical")).toHaveCount(3);
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("three-pages.pdf");
    expect(await textsOf(out.bytes)).toEqual(await textsOf(await fixtureBytes("three-pages.pdf")));
    expect(await sizes(out.bytes)).toEqual(await sizes(await fixtureBytes("three-pages.pdf")));
  });

  test("AC-1003: a picked page is the only one flipped", async ({ page }) => {
    await open(page, "flip-pdf", "three-pages.pdf");
    await tiles(page).nth(1).locator("[data-tile-button]").click();
    await expect(primary(page)).toHaveText("Flip 1 page");
    await expect(page.locator(".ip-flip--horizontal")).toHaveCount(1);
  });
});

test.describe("Resize", () => {
  test("AC-1012: every page goes onto the chosen paper", async ({ page }) => {
    await open(page, "resize-pdf", "mixed-sizes-f4.pdf");
    await page.getByLabel("Paper", { exact: true }).selectOption("letter");
    await run(page);
    const out = await sizes((await downloadResult(page)).bytes);
    // Upright pages get the paper upright, wide pages on its side.
    for (const s of out) expect([[612, 792], [792, 612]]).toContainEqual(s);
  });

  test("AC-1010, AC-1015: margins grow the page; a margin that is not a number keeps the button waiting", async ({ page }) => {
    await open(page, "resize-pdf", "three-pages.pdf");
    const before = await sizes(await fixtureBytes("three-pages.pdf"));
    await page.getByRole("radio", { name: "Margins" }).click();
    const field = page.getByLabel("Margin on every side, mm", { exact: true });
    await field.fill("abc");
    await expect(status(page)).toHaveText("Enter a margin");
    await expect(primary(page)).toBeDisabled();
    await field.fill("25.4");
    await expect(primary(page)).toBeEnabled();
    await run(page);
    const after = await sizes((await downloadResult(page)).bytes);
    expect(after).toEqual(before.map(([w, h]) => [w + 144, h + 144]));
  });
});

test.describe("N-up", () => {
  test("AC-1030, AC-1035: the status counts the sheets and the file has that many", async ({ page }) => {
    await open(page, "n-up-pdf", "twelve.pdf");
    await expect(status(page)).toHaveText("12 pages · 6 sheets");
    await page.getByRole("radio", { name: "4", exact: true }).click();
    await expect(status(page)).toHaveText("12 pages · 3 sheets");
    await run(page);
    const out = (await downloadResult(page)).bytes;
    const [w, h] = (await sizes(await fixtureBytes("twelve.pdf")))[0];
    expect(await sizes(out)).toEqual([[w * 2, h * 2], [w * 2, h * 2], [w * 2, h * 2]]);
    expect((await textsOf(out))[0]).toContain("Twelve 4");
  });
});

test.describe("Crop", () => {
  test("AC-1023, AC-1024: Trim margins measures every page, shows what stays and crops all pages alike", async ({ page }) => {
    await open(page, "crop-pdf", "twelve.pdf");
    await expect(status(page)).toHaveText("12 pages will be cropped");
    await expect(page.getByTestId("keep-area").first()).toBeVisible();
    await run(page);
    const out = await sizes((await downloadResult(page)).bytes);
    const [w, h] = (await sizes(await fixtureBytes("twelve.pdf")))[0];
    expect(out).toHaveLength(12);
    expect(new Set(out.map((s) => s.join("x"))).size).toBe(1);
    expect(out[0][0]).toBeLessThan(w / 2);
    expect(out[0][1]).toBeLessThan(h / 4);
  });

  test("AC-1020, AC-1025: Choose area waits for a box; Fit to content sets it; the result is that size", async ({ page }) => {
    await open(page, "crop-pdf", "twelve.pdf");
    await page.getByRole("radio", { name: "Choose area" }).click();
    await expect(status(page)).toHaveText("Set the crop area");
    await expect(primary(page)).toBeDisabled();
    await page.getByTestId("choose-area").click();
    await expect(page.getByTestId("area-text")).toHaveText(/^Result: \d+ × \d+ mm$/);
    const first = await page.getByTestId("area-text").innerText();
    await page.getByTestId("fit-content").click();
    await expect(page.getByTestId("area-text")).not.toHaveText(first);
    await expectNoSeriousAxeViolations(page, "Crop, area dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
    await expect(primary(page)).toBeEnabled();
    await run(page);
    const out = await sizes((await downloadResult(page)).bytes);
    const [w, h] = (await sizes(await fixtureBytes("twelve.pdf")))[0];
    expect(out[0][0]).toBeLessThan(w / 2);
    expect(out[0][1]).toBeLessThan(h / 4);
  });

  test("AC-1026: a page with nothing to trim says so", async ({ page }) => {
    await open(page, "crop-pdf", "full-bleed.pdf");
    await expect(status(page)).toHaveText("No white margins to trim");
    await expect(primary(page)).toBeDisabled();
  });
});
