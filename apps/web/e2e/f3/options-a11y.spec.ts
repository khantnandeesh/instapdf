/** F3 Merge: options, accessibility, keyboard-only flow and small screens. Spec: docs/specs/f3-merge.md §7 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
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
  showPages,
  tabTo,
  textsOf,
  tile,
  tileLabels,
  tileMain,
  chooseAddPages,
} from "./support";
import { cardAction } from "../support/flow";

/** Presses Shift+Tab until `target` has focus. */
async function backTabTo(page: Page, target: ReturnType<Page["locator"]>, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Shift+Tab");
  }
  await expect(target).toBeFocused();
}

/**
 * Opens the options. With files loaded the dock is the bottom bar (fold fit), so Merge's many
 * options sit behind the Options button there at every width; inline only in the empty side panel.
 */
/** The options surface: the sheet below 1024 px, the More options popover from 1024 px (F25 §3.3). */
const optionsSurface = (page: Page) => page.getByTestId("options-sheet").or(page.getByTestId("options-popover"));
async function options(page: Page) {
  if (await page.getByTestId("options-button").isVisible()) {
    await page.getByTestId("options-button").click();
    await expect(optionsSurface(page)).toBeVisible();
    return optionsSurface(page);
  }
  return page.getByTestId("merge-options");
}
async function closeOptions(page: Page) {
  if (await optionsSurface(page).isVisible()) await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
}

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

test("AC-40: first-visit defaults", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  const panel = await options(page);
  await expect(panel.getByRole("radio", { name: "None" })).toHaveAttribute("aria-checked", "true");
  for (const name of ["First file is a cover", "Add file name to the footer", "Make all pages the same width", "Pad for double-sided printing"]) {
    await expect(panel.getByRole("switch", { name })).not.toBeChecked();
  }
  await expect(panel.getByLabel("Bookmarks")).toHaveValue("keep");
  await expect(panel.getByLabel("Form fields")).toHaveValue("rename");
});

test("AC-42: options are remembered after a reload", async ({ page }, info) => {
  await pickMerge(page, "alpha.pdf");
  let panel = await options(page);
  await panel.getByRole("radio", { name: /^(File names|Names)$/ }).click();
  await panel.getByRole("switch", { name: "Pad for double-sided printing" }).check();
  await closeOptions(page);
  // F25 §3.3: from 1024 the trigger is named "More options" (the bottom bar keeps "Options").
  await expect(page.getByTestId("options-button")).toHaveAccessibleName(`${info.project.name === "desktop" ? "More options" : "Options"}, 2 changed`);
  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pickMerge(page, "alpha.pdf");
  panel = await options(page);
  await expect(panel.getByRole("radio", { name: /^(File names|Names)$/ })).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByRole("switch", { name: "Pad for double-sided printing" })).toBeChecked();
  await panel.getByRole("button", { name: "Reset options" }).click();
  await expect(panel.getByRole("radio", { name: "None" })).toHaveAttribute("aria-checked", "true");
});

test("AC-48, AC-54: contents page and footer through the UI", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  const panel = await options(page);
  await panel.getByRole("radio", { name: /^(File names|Names)$/ }).click();
  await panel.getByRole("switch", { name: "Add file name to the footer" }).check();
  await panel.getByLabel("Bookmarks").selectOption("perFile");
  await closeOptions(page);
  await run(page);
  const out = await downloadResult(page);
  const t = await textsOf(out.bytes);
  expect(t.length).toBe(6);
  expect(t[0]).toMatch(/alpha\.pdf\s*2.*bravo\.pdf\s*5/);
  expect(t[1]).toContain("alpha.pdf");
  expect(t[5]).toContain("bravo.pdf");
});

test("AC-57 (UI): a non-Latin name in the footer goes through the font phase and comes out exactly", async ({ page }) => {
  // Playwright drops a non-ASCII file *path* silently, so the bytes go in with their name.
  await page.getByTestId("file-input").setInputFiles({ name: "résumé-日本.pdf", mimeType: "application/pdf", buffer: readFileSync(fx("résumé-日本.pdf")) });
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  const panel = await options(page);
  await panel.getByRole("switch", { name: "Add file name to the footer" }).check();
  await closeOptions(page);
  await run(page);
  // Headless Chromium reports a non-ASCII download name as "download"; the result screen shows the real one.
  await expect(page.getByTestId("result-name")).toHaveText("résumé-日本_merged.pdf");
  const out = await downloadResult(page);
  expect((await textsOf(out.bytes))[0]).toContain("résumé-日本.pdf");
});

test("AC-62..AC-65 (UI): form field modes", async ({ page }) => {
  await pickMerge(page, "form-a.pdf", "form-b.pdf");
  let panel = await options(page);
  await panel.getByLabel("Form fields").selectOption("flatten");
  await closeOptions(page);
  await run(page);
  let out = await downloadResult(page);
  const t = await textsOf(out.bytes);
  expect(t[0]).toContain("Ann");
  expect(t[1]).toContain("Ben");
  expect((await outputDoc(out.bytes)).getForm().getFields()).toHaveLength(0);
  await page.getByRole("button", { name: "Back to editing" }).click();
  panel = await options(page);
  await panel.getByLabel("Form fields").selectOption("rename");
  await closeOptions(page);
  await run(page);
  out = await downloadResult(page);
  expect((await outputDoc(out.bytes)).getForm().getFields().map((f) => f.getName()).sort()).toEqual(["agree", "name", "name_2"]);
});

test("F1 AC-5 adapted: nothing is uploaded, with every option on and an image", async ({ page }) => {
  const posts: number[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(r.postDataBuffer()?.length ?? 0);
  });
  await pickMerge(page, "alpha.pdf", "charlie.png");
  const panel = await options(page);
  await panel.getByRole("radio", { name: /^(File names|Names)$/ }).click();
  for (const name of ["Add file name to the footer", "Pad for double-sided printing", "Make all pages the same width", "First file is a cover"]) await panel.getByRole("switch", { name }).check();
  await panel.getByLabel("Form fields").selectOption("flatten");
  await closeOptions(page);
  await run(page);
  expect(posts.every((n) => n <= 10 * 1024)).toBe(true);
});

test("AC-73: the whole flow works with the keyboard alone", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "keyboard flow checked on desktop");
  // Playwright turns on file-chooser interception asynchronously; attach a listener first (as F1 does).
  page.on("filechooser", () => {});
  await page.evaluate(() => 0);
  // Pick files: the file chooser opens from the keyboard.
  await tabTo(page, page.getByRole("button", { name: "Choose files" }));
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
  await chooser.setFiles([fx("alpha.pdf"), fx("bravo.pdf")]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  // Reorder a card.
  await tabTo(page, page.getByTestId("card-main").first());
  await page.keyboard.press("Alt+ArrowRight");
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf"]);
  // Pages view (the toggle is before the grid: Shift+Tab back to it).
  await backTabTo(page, page.getByRole("radio", { name: "Files" }));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("page-grid")).toBeVisible();
  // Move and remove a page.
  await tabTo(page, page.getByTestId("tile-main").first());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Alt+Home");
  expect((await tileLabels(page))[0]).toBe("B2");
  await page.keyboard.press("Delete");
  expect(await tileLabels(page)).toEqual(["B1", "A1", "A2", "A3"]);
  // Insert a blank page through an insert point.
  await tabTo(page, page.getByRole("button", { name: /^Insert here, after/ }).first());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(await tileLabels(page)).toContain("Blank");
  // Open and use the picker.
  await backTabTo(page, page.getByRole("button", { name: "Add pages", exact: true }));
  await page.keyboard.press("Enter");
  const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
  await chooser2.setFiles(fx("three-pages.pdf"));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("picker-tile").first()).toBeFocused();
  await page.keyboard.press("Space");
  await tabTo(page, dialog.getByTestId("picker-confirm"));
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  // Set an option (loaded: the bottom bar's Options button opens the sheet), run, download.
  await tabTo(page, page.getByTestId("options-button"));
  await page.keyboard.press("Enter");
  await expect(optionsSurface(page)).toBeVisible();
  await tabTo(page, page.getByRole("switch", { name: "Pad for double-sided printing" }));
  await page.keyboard.press("Space");
  await tabTo(page, page.getByRole("dialog").getByRole("button", { name: "Done" }));
  await page.keyboard.press("Enter");
  await expect(optionsSurface(page)).toBeHidden();
  await expect(page.getByTestId("options-button")).toBeFocused();
  await tabTo(page, page.getByTestId("primary-action"));
  await page.keyboard.press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Download" })).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(download.suggestedFilename()).toBe("bravo_merged.pdf");
});

test("AC-74: no serious axe violations in the Merge states", async ({ page }) => {
  await expectNoSeriousAxeViolations(page, "merge empty");
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await expectNoSeriousAxeViolations(page, "merge files view");
  await showPages(page);
  await tileMain(page, "A1").click();
  await tileMain(page, "B1").click({ modifiers: ["ControlOrMeta"] });
  await expectNoSeriousAxeViolations(page, "merge pages view with a selection");
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Remove A3" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousAxeViolations(page, "remove-selected confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await tile(page, "B2").hover();
  await tile(page, "B2").getByTestId("tile-more").click();
  await expectNoSeriousAxeViolations(page, "page More menu");
  await page.getByRole("menuitem", { name: /Move to position/ }).click();
  // The dialog is a lazy chunk: wait for it, so settled() sees its fade-in instead of running before it starts.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousAxeViolations(page, "move dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await chooseAddPages(page, "Pages from a file…");
  await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousAxeViolations(page, "page picker");
  await page.keyboard.press("Escape");
  await options(page);
  await expectNoSeriousAxeViolations(page, "options sheet");
});

test("AC-75: at 375 px no horizontal scroll, the primary is visible, actions are 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noScroll()).toBe(true);
  await expect(page.getByTestId("primary-action")).toBeInViewport();
  const targets = async (selector: string) =>
    page.locator(selector).evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null && !(e as HTMLButtonElement).disabled)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }),
    );
  for (const s of await targets("[data-testid=file-card] button")) expect(s).toBeGreaterThanOrEqual(44);
  await showPages(page);
  expect(await noScroll()).toBe(true);
  for (const s of await targets("[data-testid=page-tile] [data-no-drag] button:not([aria-haspopup=menu][class*='rounded-full'])")) expect(s).toBeGreaterThanOrEqual(44);
  await page.getByTestId("options-button").click();
  await expect(optionsSurface(page)).toBeVisible();
  expect(await noScroll()).toBe(true);
  expect(await page.getByRole("dialog").evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
});

test("first-load: pdf-lib and the merge engine never load on the main page", async ({ page }) => {
  const scripts: string[] = [];
  const all: string[] = [];
  page.on("response", (r) => {
    all.push(r.url());
    if (r.request().resourceType() === "script") scripts.push(r.url());
  });
  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pickMerge(page, "alpha.pdf");
  const bodies = await Promise.all(scripts.map((u) => page.request.get(u).then((r) => r.text()).catch(() => "")));
  for (const b of bodies) expect(b).not.toContain("github.com/Hopding/pdf-lib"); // pdf-lib lives only in the worker
  // Fonts are fetched only by the worker during a footer/contents run with non-WinAnsi names.
  expect(all.some((u) => u.includes("/fonts/noto/"))).toBe(false);
});

test("AC-79: Ctrl+Z restores, focus returns to the restored card", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await cardAction(page, "alpha.pdf", "Remove");
  expect(await cardNames(page)).toEqual(["bravo.pdf"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
  await expect(page.getByTestId("card-main").first()).toBeFocused();
  // Sort is undoable too (M-11 #3); a later edit replaces the notice.
  await chooseMenu(page, "Sort", "Name Z to A");
  await expect(page.getByTestId("notice").filter({ hasText: "Sorted by name, Z to A" })).toBeVisible();
  await page.getByRole("button", { name: "Move bravo.pdf later" }).click();
  await expect(page.getByTestId("notice").filter({ hasText: "Sorted by name" })).toHaveCount(0);
  const out = await (async () => {
    await run(page);
    return downloadResult(page);
  })();
  expect((await textsOf(out.bytes)).map(firstWord)[0]).toBe("Alpha 1");
});
