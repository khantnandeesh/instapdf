/** F5 Combine & reorder (`/combine-reorder-pdf`). Spec: docs/specs/f4-f5-page-tools.md §3f, §7 (AC-510 to AC-513), I-10. */
import { expect, test } from "@playwright/test";
import { dragTo, downloadResult, firstWord, flow, mergeOptions, closeMergeOptions, open, pickF5, primary, redoButton, run, textsOf, tileLabels, tileMain, undoButton } from "./support";

test("AC-510: bravo + alpha in one batch open in the Pages view, alpha first, with Merge's options", async ({ page }) => {
  await open(page, "combine-reorder-pdf");
  await pickF5(page, "bravo.pdf", "alpha.pdf");
  await expect(page.getByTestId("page-grid")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Pages" })).toHaveAttribute("aria-checked", "true");
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  const panel = await mergeOptions(page);
  await expect(panel.getByRole("switch", { name: "Pad for double-sided printing" })).toBeVisible();
  await closeMergeOptions(page);
  await expect(primary(page)).toHaveText(/^Combine PDF/);
});

test("AC-511: B1 dragged between A1 and A2 gives alpha_merged.pdf in that order", async ({ page }, info) => {
  await open(page, "combine-reorder-pdf");
  await pickF5(page, "alpha.pdf", "bravo.pdf");
  if (info.project.name === "desktop") {
    await dragTo(page, '[data-uid]:has([data-testid=tile-label]:text-is("B1")) [data-tile-box]', '[data-uid]:has([data-testid=tile-label]:text-is("A2")) [data-tile-box]', "before");
  } else {
    // Touch: the same move by keyboard (F3 AC-20 covers touch drag on Merge).
    await tileMain(page, "B1").focus();
    for (let i = 0; i < 2; i++) await page.keyboard.press("Alt+ArrowLeft");
  }
  expect(await tileLabels(page)).toEqual(["A1", "B1", "A2", "A3", "B2"]);
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("alpha_merged.pdf");
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Alpha 1", "Bravo 1", "Alpha 2", "Alpha 3", "Bravo 2"]);
});

test("AC-512: options are shared with Merge; a contents page there works here", async ({ page }) => {
  await page.goto("/merge-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pickF5(page, "alpha.pdf");
  let panel = await mergeOptions(page);
  await panel.getByRole("switch", { name: "Pad for double-sided printing" }).check();
  await closeMergeOptions(page);
  await open(page, "combine-reorder-pdf");
  await pickF5(page, "alpha.pdf", "bravo.pdf");
  panel = await mergeOptions(page);
  await expect(panel.getByRole("switch", { name: "Pad for double-sided printing" })).toBeChecked();
  await panel.getByRole("switch", { name: "Pad for double-sided printing" }).uncheck();
  await panel.getByRole("radio", { name: /^(File names|Names)$/ }).click();
  await closeMergeOptions(page);
  await run(page);
  const t = await textsOf((await downloadResult(page)).bytes);
  expect(t.length).toBe(6);
  expect(t[0]).toMatch(/alpha\.pdf\s*2.*bravo\.pdf\s*5/);
});

test("AC-513: its own h1, title, description and canonical", async ({ page }) => {
  await page.goto("/merge-pdf");
  const merge = {
    h1: await page.locator("h1").first().textContent(),
    title: await page.title(),
    description: await page.locator('meta[name="description"]').getAttribute("content"),
  };
  await page.goto("/combine-reorder-pdf");
  const h1 = await page.locator("h1").first().textContent();
  expect(h1).not.toBe(merge.h1);
  expect(await page.title()).not.toBe(merge.title);
  expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toBe(merge.description);
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).pathname).toBe("/combine-reorder-pdf");
});

test("I-10: Combine & reorder and Merge have Undo│Redo in the bar", async ({ page }) => {
  await open(page, "combine-reorder-pdf");
  await pickF5(page, "alpha.pdf", "bravo.pdf");
  await tileMain(page, "B2").focus();
  await page.keyboard.press("Alt+Home");
  await tileMain(page, "A3").focus();
  await page.keyboard.press("Alt+Home");
  expect((await tileLabels(page)).slice(0, 2)).toEqual(["A3", "B2"]);
  await undoButton(page).click();
  await undoButton(page).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  await redoButton(page).click();
  expect((await tileLabels(page))[0]).toBe("B2");

  await page.goto("/merge-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pickF5(page, "alpha.pdf", "bravo.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("history")).toBeVisible();
  await page.getByRole("radio", { name: "Pages", exact: true }).click();
  await tileMain(page, "B2").focus();
  await page.keyboard.press("Alt+Home");
  expect((await tileLabels(page))[0]).toBe("B2");
  await undoButton(page).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  await redoButton(page).click();
  expect((await tileLabels(page))[0]).toBe("B2");
});
