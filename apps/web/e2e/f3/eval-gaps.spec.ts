/**
 * F3 Merge: fixes for the parity evaluation's gap list (docs/evals/f3-merge.md, G-2, G-3, G-4, G-7).
 * Spec: docs/specs/f3-merge.md (M-3 toolbar, §6 output name, M-6 focus).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { cloudOn, downloadResult, flow, fromFileItem, fx, isDesktop, openMerge, pickMerge, run, runAndDownload, setMergeOptions, tileLabels, tileMain } from "./support";

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

/** Toolbar buttons whose accessible name starts with "Add" that a visitor can see. */
const visibleAddButtons = (page: Page) =>
  page
    .getByRole("button", { name: /^Add/ })
    .filter({ visible: true })
    // F23's cloud caret is the second half of the Add files split, not another Add control.
    .evaluateAll((els) => els.filter((e) => !e.closest("[data-testid=segment-grid],[data-testid=page-grid],[data-testid=cloud-caret-toolbar]")).map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim() ?? ""));

/** The toolbar's Add files button (the grid's end tile has the same name). */
const toolbarAddFiles = (page: Page) => page.getByRole("button", { name: "Add files", exact: true }).and(page.locator(":not([data-testid=add-tile])"));

const outlineWidth = (el: Locator) => el.evaluate((e) => (getComputedStyle(e).outlineStyle === "none" ? 0 : parseFloat(getComputedStyle(e).outlineWidth)));

// ---------------------------------------------------------------- G-2: one Add menu on phones

test.describe("G-2: below 640 px the toolbar has one Add menu", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({}, info) => {
    test.skip(!isDesktop(info.project.name), "this block sets its own 390 px touch context; running it once is enough");
  });

  test("M-3: one + Add button (word visible, 44 px), Files… / Pages from a file… / Blank page", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf");
    expect(await visibleAddButtons(page)).toEqual(["Add"]);
    const add = page.getByRole("button", { name: "Add", exact: true });
    await expect(add).toHaveText("Add");
    await expect(add.locator("svg")).toBeVisible();
    const box = (await add.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await add.tap();
    // With F23 on, the sheet groups Files (This device + clouds) and Pages (spec U-2 E4); e2e/f23 checks the clouds.
    if (cloudOn) await expect(page.getByRole("menuitem")).toHaveText([/^This device/, /^Google Drive/, /^Dropbox/, /^OneDrive/, /^Pages from a file/, "Blank page"]);
    else await expect(page.getByRole("menuitem")).toHaveText(["Files…", "Pages from a file…", "Blank page"]);
    // Files… opens the multi-file picker and appends.
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: cloudOn ? "This device" : "Files…", exact: true }).tap()]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles(fx("echo.pdf"));
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("file-name")).toHaveText(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
    // Blank page works from the files view: it switches to the pages view.
    await add.tap();
    await page.getByRole("menuitem", { name: "Blank page" }).tap();
    await expect(page.getByTestId("page-grid")).toBeVisible();
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2", "C1", "Blank"]);
    // Pages from a file… opens the single-file page picker.
    await add.tap();
    if (cloudOn) await page.getByRole("menuitem", { name: "Pages from a file" }).tap();
    const [single] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: cloudOn ? "This device" : "Pages from a file…", exact: true }).tap()]);
    expect(single.isMultiple()).toBe(false);
    await single.setFiles(fx("three-pages.pdf"));
    await expect(page.getByRole("dialog")).toContainText("Add pages from three-pages.pdf");
    // Still one Add control in the pages view.
    await page.keyboard.press("Escape");
    expect(await visibleAddButtons(page)).toEqual(["Add"]);
  });
});

test("G-2: at 640 px and wider the toolbar keeps Add files and Add pages, and no Add menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pickMerge(page, "alpha.pdf");
  expect(await visibleAddButtons(page)).toEqual(["Add files", "Add pages"]);
  await page.setViewportSize({ width: 640, height: 900 });
  expect(await visibleAddButtons(page)).toEqual(["Add files", "Add pages"]);
  await page.setViewportSize({ width: 639, height: 900 });
  expect(await visibleAddButtons(page)).toEqual(["Add"]);
});

// ---------------------------------------------------------------- G-3: output name

test("G-3, AC-66: the download follows the reference's name, alpha_merged.pdf", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await run(page);
  await expect(page.getByTestId("result-name")).toHaveText("alpha_merged.pdf");
  expect((await downloadResult(page)).name).toBe("alpha_merged.pdf");
});

// ---------------------------------------------------------------- G-4: contents page readability

test("G-4: the downloaded contents page has 14 pt entries with dot leaders, and the links still work", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { toc: "File names" });
  const out = await runAndDownload(page);
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: out.bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const toc = await doc.getPage(1);
  const items = (await toc.getTextContent()).items.flatMap((it) =>
    "str" in it && it.str.trim() ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, size: Math.hypot(it.transform[0], it.transform[1]), w: it.width }] : [],
  );
  const find = (s: string) => items.find((it) => it.str.includes(s))!;
  for (const s of ["alpha.pdf", "bravo.pdf"]) expect(find(s).size, s).toBeGreaterThanOrEqual(14);
  expect(find("Contents").size).toBeGreaterThan(find("alpha.pdf").size);
  // One round-dotted stroke per entry, drawn between the name's end and the page number.
  const ops = await toc.getOperatorList();
  const dots = ops.fnArray.filter((fn, i) => fn === OPS.setDash && (ops.argsArray[i] as [number[]])[0].length === 2 && (ops.argsArray[i] as [number[]])[0][0] === 0);
  expect(dots).toHaveLength(2);
  expect(items.map((it) => it.str).join("")).not.toMatch(/\.{3}/);
  // Links: each entry still goes to its file's first page.
  const links = (await toc.getAnnotations()).filter((a) => a.subtype === "Link");
  const targets = await Promise.all(links.map(async (a) => 1 + (await doc.getPageIndex((a.dest as unknown[])[0] as never))));
  expect(targets).toEqual([2, 5]);
  // Each link covers its whole row, name and number included.
  const numberOf = (n: string) => items.find((it) => it.str.trim() === n)!;
  for (const [i, [name, num]] of [["alpha.pdf", "2"], ["bravo.pdf", "5"]].entries()) {
    const [x1, y1, x2, y2] = links[i].rect as number[];
    expect(x1).toBeLessThanOrEqual(find(name).x);
    expect(x2).toBeGreaterThanOrEqual(numberOf(num).x + numberOf(num).w);
    expect(y1).toBeLessThan(find(name).y);
    expect(y2).toBeGreaterThan(find(name).y + find(name).size * 0.7);
  }
  await task.destroy();
});

// ---------------------------------------------------------------- G-7: focus after picks

test.describe("G-7: focus after picks", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(!isDesktop(info.project.name), "mouse and keyboard focus checked on desktop");
  });

  test("a mouse pick moves focus to Add files without a ring; the keyboard brings the ring back", async ({ page }) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("drop-card").getByRole("button", { name: "Choose files" }).click()]);
    await chooser.setFiles([fx("alpha.pdf"), fx("bravo.pdf")]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    const addFiles = toolbarAddFiles(page);
    await expect(addFiles).toBeFocused();
    await page.waitForTimeout(200);
    expect(await outlineWidth(addFiles), "no focus ring after a mouse pick").toBe(0);
    // Marked quiet, so no browser shows a ring for this script focus move (Safari and Firefox
    // decide :focus-visible for script focus differently from Chromium).
    await expect(addFiles).toHaveAttribute("data-quiet-focus", "");
    // Keyboard users: Tab away and back, the ring shows.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(addFiles).toBeFocused();
    await expect(addFiles).not.toHaveAttribute("data-quiet-focus");
    expect(await outlineWidth(addFiles)).toBeGreaterThanOrEqual(2);
  });

  test("a keyboard pick moves focus to Add files with the ring", async ({ page }) => {
    page.on("filechooser", () => {});
    await page.getByTestId("drop-card").getByRole("button", { name: "Choose files" }).focus();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
    await chooser.setFiles([fx("alpha.pdf")]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    const addFiles = toolbarAddFiles(page);
    await expect(addFiles).toBeFocused();
    expect(await outlineWidth(addFiles)).toBeGreaterThanOrEqual(2);
    await expect(addFiles).not.toHaveAttribute("data-quiet-focus");
  });

  test("M-6: after the page picker adds pages, focus is on the first new tile (mouse and keyboard)", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf");
    // Mouse, from the files view: the pages view opens and the first new tile has focus.
    await page.getByRole("button", { name: "Add pages", exact: true }).click();
    await page.getByRole("menuitem", { name: fromFileItem, exact: true }).click();
    await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
    let dialog = page.getByRole("dialog");
    await dialog.getByTestId("picker-tile").nth(1).click();
    await dialog.getByTestId("picker-tile").nth(2).click({ modifiers: ["ControlOrMeta"] });
    await dialog.getByTestId("picker-confirm").click();
    await expect(dialog).toHaveCount(0);
    await expect(tileMain(page, "C2")).toBeFocused();
    await page.waitForTimeout(300); // and it stays there (the dialog does not hand focus back)
    await expect(tileMain(page, "C2")).toBeFocused();
    // Keyboard, already in the pages view.
    page.on("filechooser", () => {});
    await page.getByRole("button", { name: "Add pages", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: fromFileItem, exact: true })).toBeFocused();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
    await chooser.setFiles(fx("echo.pdf"));
    dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("picker-tile").first()).toBeFocused();
    await page.keyboard.press("Space");
    await dialog.getByTestId("picker-confirm").focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(tileMain(page, "D1")).toBeFocused();
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2", "C2", "C3", "D1"]);
  });
});
