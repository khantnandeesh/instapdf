/** F1 shared flow, sections "Accessibility and mobile" (AC-48 to AC-51) and improvements AC-52, AC-53. Spec: docs/specs/f1-shared-flow.md */
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  dialog,
  downloadLink,
  downloadResult,
  flow,
  fx,
  isDesktop,
  openRotate,
  passwordField,
  pick,
  pickReady,
  primary,
  rotateRight,
  rotationsOf,
  run,
  tabTo,
  tiles,
} from "../support/flow";

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("AC-48: the whole flow works by keyboard alone, and the password modal traps and returns focus", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "keyboard path checked on desktop");
  // Playwright turns on file-chooser interception asynchronously when the first listener is
  // added; attach one now so it is active before the first keyboard activation below.
  page.on("filechooser", () => {});
  await page.evaluate(() => 0);
  const chooseButton = page.getByRole("button", { name: "Choose PDF files" });

  // Modal: focus trap and return.
  await tabTo(page, chooseButton);
  let chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(fx("user-pw.pdf"));
  await expect(passwordField(page)).toBeFocused();
  // Native modal: the page behind is inert. Focus may pass through the browser's own UI
  // (seen as <body> from the page), which the spec accepts; it must never reach a page control.
  let insideCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body ? "browser" : el.closest("dialog[open]") ? "dialog" : el.outerHTML.slice(0, 80);
    });
    expect(["dialog", "browser"], `Tab ${i + 1} reached a control behind the modal`).toContain(where);
    if (where === "dialog") insideCount++;
  }
  expect(insideCount).toBeGreaterThanOrEqual(8); // it cycles back into the dialog
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await page.waitForTimeout(300); // focus must stay on the trigger, not just pass through it
  await expect(chooseButton).toBeFocused();

  // Pick, rotate, run, download, start over.
  chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await tabTo(page, rotateRight(page));
  await page.keyboard.press("Enter");
  await expect(tiles(page).nth(0)).toHaveAttribute("data-rotation", "90");
  await tabTo(page, primary(page));
  await page.keyboard.press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  await expect(downloadLink(page)).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(await rotationsOf(new Uint8Array(await readFile((await download.path())!)))).toEqual([90, 90, 90]);
  await tabTo(page, page.getByRole("button", { name: "Start over" }));
  await page.keyboard.press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(chooseButton).toBeFocused();
});

test.describe("AC-49 at 375 px", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("AC-49: empty, ready and result have no horizontal scroll; the primary is visible without scrolling when ready", async ({ page }) => {
    await expect(flow(page)).toHaveAttribute("data-state", "empty");
    expect(await noHorizontalScroll(page)).toBe(true);

    await pickReady(page, "three-pages.pdf");
    await expect(tiles(page)).toHaveCount(3);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(primary(page)).toBeInViewport({ ratio: 1 });
    await expect(primary(page)).toBeEnabled();

    // Long names and several files must not widen the page either.
    await pick(page, "sixty-pages.pdf");
    await page.getByRole("radio", { name: "Files" }).click();
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(primary(page)).toBeInViewport({ ratio: 1 });

    await page.getByRole("button", { name: "Remove sixty-pages.pdf" }).click();
    await rotateRight(page).click();
    await run(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    const out = await downloadResult(page);
    expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
  });
});

test("AC-50: axe finds no critical or serious violations in empty, password, ready and result states", async ({ page }) => {
  const check = async (state: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => `${state}: ${v.id} ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
  };
  await check("empty");
  await pick(page, "user-pw.pdf");
  await expect(dialog(page)).toBeVisible();
  await check("password");
  await passwordField(page).fill("test");
  await page.keyboard.press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await check("ready");
  await run(page);
  await check("result");
});

test("AC-51: with files loaded, leaving the page asks for confirmation (and not when empty)", async ({ page }) => {
  // Empty: no prompt.
  await page.getByRole("button", { name: "Choose PDF files" }).hover();
  let prompted = false;
  page.on("dialog", (d) => {
    prompted = true;
    void d.accept();
  });
  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  expect(prompted).toBe(false);

  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click(); // a real user gesture: browsers only ask after one
  page.removeAllListeners("dialog");
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const d = await asked;
  expect(d.type()).toBe("beforeunload");
  await d.accept();
});

test("AC-52: with 60 pages at 1280x800 the primary is enabled while at most 30 tiles hold an image", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the AC fixes a 1280x800 viewport");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    const w = window as unknown as { __ac52?: number };
    const obs = new MutationObserver(() => {
      const btn = document.querySelector<HTMLButtonElement>("[data-testid=primary-action]");
      const root = document.querySelector("[data-testid=tool-flow]");
      if (w.__ac52 !== undefined || !btn || btn.disabled || root?.getAttribute("data-state") !== "ready") return;
      w.__ac52 = document.querySelectorAll("[data-testid=page-tile] canvas, [data-testid=page-tile] img[src]").length;
      obs.disconnect();
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await pick(page, "sixty-pages.pdf");
  await expect(primary(page)).toBeEnabled();
  const rendered = await page.evaluate(() => (window as unknown as { __ac52?: number }).__ac52);
  expect(rendered).toBeDefined();
  expect(rendered!).toBeLessThanOrEqual(30);
  // Placeholders are full size: all 60 tiles share one box size, so scrolling does not jump.
  const sizes = await page.getByTestId("page-visual").evaluateAll((els) => els.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  expect(sizes).toHaveLength(60);
  expect(new Set(sizes).size).toBe(1);
  expect(sizes[0]).not.toBe("0x0");
  // Still lazy once settled: tiles far below the fold have no image.
  await page.waitForTimeout(500);
  expect(await page.locator("[data-testid=page-tile] canvas").count()).toBeLessThanOrEqual(30);
});

test("AC-53: scrolling to page 60 renders it within 2 s, with rotations applied earlier; output is all 90", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "same 1280x800 setup as AC-52");
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickReady(page, "sixty-pages.pdf");
  await rotateRight(page).click();
  const last = tiles(page).last();
  await expect(last.locator("canvas")).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator("canvas")).toBeVisible({ timeout: 2000 });
  await expect(last).toHaveAttribute("data-rotation", "90");
  await expect(page.getByTestId("page-visual").last()).toHaveAttribute("style", /rotate\(90deg\)/);
  await run(page);
  const out = await downloadResult(page);
  expect(await rotationsOf(out.bytes)).toEqual(Array(60).fill(90));
});
