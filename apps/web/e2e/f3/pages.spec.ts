/** F3 Merge: pages view and one model for both views. Spec: docs/specs/f3-merge.md §7 */
import { expect, test, type Page } from "@playwright/test";
import {
  cardNames,
  chooseMenu,
  downloadResult,
  firstWord,
  flow,
  fx,
  isDesktop,
  openMerge,
  outputDoc,
  pickMerge,
  run,
  showFiles,
  showPages,
  textsOf,
  tile,
  tileAction,
  tileLabels,
  tileMain,
} from "./support";

const live = (page: Page) => page.locator("[aria-live=polite]").first();

async function texts(page: Page) {
  await run(page);
  const out = await downloadResult(page);
  return { texts: (await textsOf(out.bytes)).map(firstWord), doc: await outputDoc(out.bytes) };
}

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

test("AC-17: the pages view labels tiles A1…B2 with file names in their names", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  await expect(tileMain(page, "B1")).toHaveAccessibleName(/B1, page 1 of bravo\.pdf/);
});

test("AC-18: with one file the view toggle is shown and the pages view has 3 tiles", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await showPages(page);
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3"]);
});

test("AC-19, AC-36: dragging B1 between A1 and A2; the files view shows 4 segments; same output from both views", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "pointer drag with a mouse");
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await page.mouse.move(0, 0);
  const from = (await tile(page, "B1").locator("[data-tile-box]").boundingBox())!;
  const to = (await tile(page, "A2").locator("[data-tile-box]").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 15, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width * 0.2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  expect(await tileLabels(page)).toEqual(["A1", "B1", "A2", "A3", "B2"]);
  await expect(live(page)).toContainText("B1 moved to position 2 of 5");
  await showFiles(page);
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "alpha.pdf", "bravo.pdf"]);
  await expect(page.getByTestId("file-meta").nth(2)).toHaveText("pages 2–3 of 3");
  const fromFiles = await texts(page);
  expect(fromFiles.texts).toEqual(["Alpha 1", "Bravo 1", "Alpha 2", "Alpha 3", "Bravo 2"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await showPages(page);
  expect((await texts(page)).texts).toEqual(fromFiles.texts);
});

test("AC-20: Alt+Home on B2 moves it first and announces it", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "B2").focus();
  await page.keyboard.press("Alt+Home");
  expect((await tileLabels(page))[0]).toBe("B2");
  await expect(tileMain(page, "B2")).toBeFocused();
  await expect(live(page)).toContainText("B2 moved to position 1 of 5");
  expect((await texts(page)).texts[0]).toBe("Bravo 2");
});

test("AC-21, AC-22: click, Ctrl+click, Shift+click, Space, count, Clear and Escape", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "A2").click();
  await expect(tileMain(page, "A2")).toHaveAttribute("aria-pressed", "true");
  await tileMain(page, "B1").click({ modifiers: ["ControlOrMeta"] });
  await expect(tileMain(page, "B1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText("2 selected");
  await tileMain(page, "A3").click();
  await tileMain(page, "A1").click({ modifiers: ["Shift"] });
  for (const l of ["A1", "A2", "A3"]) await expect(tileMain(page, l)).toHaveAttribute("aria-pressed", "true");
  await expect(tileMain(page, "B1")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("selection-count")).toHaveText("3 selected");
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);
  // Space toggles (AC-22); Escape clears.
  await tileMain(page, "B2").focus();
  await page.keyboard.press("Space");
  await expect(tileMain(page, "B2")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(tileMain(page, "B2")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(tileMain(page, "B2")).toHaveAttribute("aria-pressed", "false");
});

test("AC-23: dragging a selected tile moves the whole selection", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "pointer drag with a mouse");
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "A1").click();
  await tileMain(page, "A3").click({ modifiers: ["ControlOrMeta"] });
  await page.mouse.move(0, 0);
  const from = (await tile(page, "A3").locator("[data-tile-box]").boundingBox())!;
  const to = (await tile(page, "B2").locator("[data-tile-box]").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  expect(await tileLabels(page)).toEqual(["A2", "B1", "B2", "A1", "A3"]);
});

test("AC-24: Move to position moves B2 first; 99, 0 and x keep the dialog open and move nothing", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileAction(page, "B2", "Move to position…");
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("New position (1–5)");
  for (const bad of ["99", "0", "x"]) {
    await field.fill(bad);
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("alert")).toHaveText(/Enter a whole number from 1 to 5/);
    await expect(dialog).toBeVisible();
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  }
  await field.fill("1");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect((await tileLabels(page))[0]).toBe("B2");
});

test("AC-25: removing A2 leaves 4 pages without Alpha 2", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "A2").hover();
  await page.getByRole("button", { name: "Remove A2" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A3", "B1", "B2"]);
  const out = await texts(page);
  expect(out.texts).toEqual(["Alpha 1", "Alpha 3", "Bravo 1", "Bravo 2"]);
});

test("AC-26, AC-79: remove with others selected asks; Only this page vs All selected; undo restores", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "A1").click();
  await tileMain(page, "B1").click({ modifiers: ["ControlOrMeta"] });
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Remove A3" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("A3 is one of 3 selected pages.");
  await expect(dialog.getByRole("button", { name: "Only this page" })).toBeFocused();
  await dialog.getByRole("button", { name: "Only this page" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "B1", "B2"]);
  await page.getByTestId("notice").getByRole("button", { name: "Undo" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  await tileMain(page, "A1").click();
  await tileMain(page, "B1").click({ modifiers: ["ControlOrMeta"] });
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Remove A3" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Remove all 3 selected/ }).click();
  expect(await tileLabels(page)).toEqual(["A2", "B2"]);
  await page.getByTestId("notice").getByRole("button", { name: "Undo" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
});

test("AC-27, AC-28: duplicate A1 and rotate B1", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "B1").hover();
  await page.getByRole("button", { name: "Rotate B1 right" }).click();
  await tileAction(page, "A1", "Duplicate");
  expect(await tileLabels(page)).toEqual(["A1", "A1", "A2", "A3", "B1", "B2"]);
  const out = await texts(page);
  expect(out.texts).toEqual(["Alpha 1", "Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
  expect(out.doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 0, 0, 90, 0]);
});

test("AC-29: insert point between A3 and B1 -> Blank page here", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Insert here, after A3" }).click();
  await page.getByRole("menuitem", { name: "Blank page here" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "Blank", "B1", "B2"]);
  const out = await texts(page);
  expect(out.texts[3]).toBe("blank");
  expect([out.doc.getPage(3).getWidth(), out.doc.getPage(3).getHeight()]).toEqual([595, 842]);
});

test("AC-30: toolbar blank page goes at the end, or after the selection", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await chooseMenu(page, "Add pages", "Blank page");
  await expect(page.getByTestId("page-grid")).toBeVisible(); // switches to the pages view
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2", "Blank"]);
  await tileMain(page, "A1").click();
  await chooseMenu(page, "Add pages", "Blank page");
  expect(await tileLabels(page)).toEqual(["A1", "Blank", "A2", "A3", "B1", "B2", "Blank"]);
  const out = await texts(page);
  expect([out.doc.getPage(6).getWidth(), out.doc.getPage(6).getHeight()]).toEqual([792, 612]);
});

test("AC-31, AC-33, AC-39: Add pages from a file opens the picker; C1 and C3 go at the end", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await chooseMenu(page, "Add pages", "Pages from a file…");
  await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Add pages from three-pages.pdf");
  const tiles = dialog.getByTestId("picker-tile");
  await expect(tiles).toHaveCount(3);
  await expect(tiles.first()).toHaveAccessibleName(/^C1/);
  const confirm = dialog.getByTestId("picker-confirm");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Select all" }).click();
  await expect(confirm).toHaveText("Add 3 pages");
  await dialog.getByRole("button", { name: "Select none" }).click();
  await tiles.nth(0).click();
  await tiles.nth(2).click({ modifiers: ["ControlOrMeta"] });
  await expect(confirm).toHaveText("Add 2 pages");
  await confirm.click();
  await expect(page.getByTestId("page-grid")).toBeVisible();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2", "C1", "C3"]);
  await showFiles(page);
  await expect(page.getByTestId("file-meta").nth(2)).toHaveText("pages 1, 3 of 3");
  const out = await texts(page);
  expect(out.texts.slice(5)).toEqual(["Page 1", "Page 3"]);
});

test("AC-33: Cancel or Escape adds nothing", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await chooseMenu(page, "Add pages", "Pages from a file…");
  await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("dock-status")).toHaveText("3 pages · 1 file · add more to merge");
});

test("AC-32, AC-34: picker and files from an insert point go there", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "A1").hover();
  await page.getByRole("button", { name: "Insert here, after A1" }).click();
  await page.getByRole("menuitem", { name: "Files here…" }).click();
  await page.getByTestId("insert-file-input").setInputFiles(fx("echo.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect.poll(() => tileLabels(page)).toEqual(["A1", "C1", "A2", "A3", "B1", "B2"]);
  await tile(page, "A1").hover();
  await page.getByRole("button", { name: "Insert here, after A1" }).click();
  await page.getByRole("menuitem", { name: "Pages from a file here…" }).click();
  await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("They go after A1.");
  await dialog.getByTestId("picker-tile").nth(1).click();
  await dialog.getByTestId("picker-confirm").click();
  const out = await texts(page);
  expect(out.texts).toEqual(["Alpha 1", "Page 2", "Echo 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
});

test("AC-35, AC-37: sorting in either view; the views never disagree", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await chooseMenu(page, "Sort", "Name Z to A");
  await showPages(page);
  expect(await tileLabels(page)).toEqual(["B1", "B2", "A1", "A2", "A3"]);
  await chooseMenu(page, "Sort", "Name A to Z");
  await tileMain(page, "B1").focus();
  await page.keyboard.press("Alt+Home");
  expect(await tileLabels(page)).toEqual(["B1", "A1", "A2", "A3", "B2"]);
  await chooseMenu(page, "Sort", "Name A to Z");
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
});

test("AC-38: options are available in the pages view and apply", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  // Loaded: the bottom bar holds Merge's Options button at every width (fold fit).
  await page.getByTestId("options-button").click();
  await page.getByRole("radio", { name: /File names|Names/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  const out = await texts(page);
  expect(out.doc.getPageCount()).toBe(6);
});

test("AC-78: reverse order in the pages view reverses segments", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "B1").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await tileLabels(page)).toEqual(["A1", "B1", "A2", "A3", "B2"]);
  await chooseMenu(page, "Sort", "Reverse order");
  expect(await tileLabels(page)).toEqual(["B2", "A2", "A3", "B1", "A1"]);
  expect((await texts(page)).texts).toEqual(["Bravo 2", "Alpha 2", "Alpha 3", "Bravo 1", "Alpha 1"]);
});

test("AC-68: combined edits match the pages view exactly", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileAction(page, "A1", "Duplicate");
  await tile(page, "B2").hover();
  await page.getByRole("button", { name: "Rotate B2 right" }).click();
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Insert here, after A3" }).click();
  await page.getByRole("menuitem", { name: "Blank page here" }).click();
  await tile(page, "A2").hover();
  await page.getByRole("button", { name: "Remove A2" }).click();
  await tileMain(page, "B1").focus();
  await page.keyboard.press("Alt+Home");
  expect(await tileLabels(page)).toEqual(["B1", "A1", "A1", "A3", "Blank", "B2"]);
  const out = await texts(page);
  expect(out.texts).toEqual(["Bravo 1", "Alpha 1", "Alpha 1", "Alpha 3", "blank", "Bravo 2"]);
  expect(out.doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 0, 0, 0, 90]);
});

test("AC-45 (F1) adapted: Back to options keeps page edits", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tileMain(page, "B2").focus();
  await page.keyboard.press("Alt+Home");
  await run(page);
  await page.getByRole("button", { name: "Back to options" }).click();
  await expect(page.getByTestId("page-grid")).toBeVisible();
  expect((await tileLabels(page))[0]).toBe("B2");
});
