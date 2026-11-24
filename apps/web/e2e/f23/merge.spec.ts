/** F23 cloud sources on Merge: multi-file picks, Add files, Add pages, caps, mixed sources. Spec: docs/specs/f23-cloud-pickers.md §7 */
import { expect, test } from "@playwright/test";
import { cardNames, chooseMenu, isPhoneToolbar, openMerge, outputDoc, pickMerge, runAndDownload, showPages, tileLabels, textsOf } from "../f3/support";
import { cards, mockLog, mockPick, needsCloud, openWindow, pickFromRow, reachPicker } from "./support";

needsCloud();

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await openMerge(page);
});

test("AC-133, AC-135: three files from Google Drive arrive as three cards, in pick order", async ({ page }) => {
  await pickFromRow(page, "Google Drive", ["alpha.pdf", "bravo.pdf", "echo.pdf"]);
  await expect.poll(() => cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
  const log = (await mockLog(page))!;
  expect(log.requests.at(-1)!.multiple).toBe(true);
  expect(log.requests.at(-1)!.accept).toEqual(expect.arrayContaining([".pdf", ".png", ".jpg"]));
});

test("AC-133: a slow first file keeps its place: order follows the pick, not the arrival", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["alpha.pdf", "bravo.pdf", "echo.pdf"], { slow: "alpha.pdf" });
  await expect(cards(page).filter({ hasText: "alpha.pdf" })).toBeVisible();
  await expect.poll(() => cardNames(page), { timeout: 15_000 }).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
});

test("AC-137: with the slow file last, the fast files are in before it finishes", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["alpha.pdf", "bravo.pdf", "echo.pdf"], { slow: "echo.pdf" });
  await expect.poll(() => cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
  await expect(cards(page).filter({ hasText: "echo.pdf" })).toBeVisible();
  await expect.poll(() => cardNames(page), { timeout: 15_000 }).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
});

test("AC-138: Stop on a downloading file removes it; the others still load", async ({ page }) => {
  await pickFromRow(page, "OneDrive", ["alpha.pdf", "echo.pdf"], { slow: "echo.pdf" });
  const slow = cards(page).filter({ hasText: "echo.pdf" });
  await slow.getByRole("button", { name: "Stop downloading echo.pdf" }).click();
  await expect(slow).toHaveCount(0);
  await expect.poll(() => cardNames(page)).toEqual(["alpha.pdf"]);
  await page.waitForTimeout(3500);
  expect(await cardNames(page)).toEqual(["alpha.pdf"]);
});

test("AC-122: in the ready state, Add files offers the providers and appends after alpha", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  if (isPhoneToolbar(page)) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /^Dropbox/ })).toBeVisible();
    const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Dropbox/ }).click());
    await mockPick(win, ["bravo.pdf"]);
  } else {
    const caret = page.getByTestId("cloud-caret-toolbar");
    await expect(caret).toHaveAccessibleName("Add files from Google Drive, Dropbox or OneDrive");
    await caret.click();
    const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Dropbox/ }).click());
    await mockPick(win, ["bravo.pdf"]);
  }
  await expect.poll(() => cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
});

test("AC-123, AC-167: Add pages from a cloud file opens the page picker; on phones the step opens in place with Back", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await showPages(page);
  let win;
  if (isPhoneToolbar(page)) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Pages from a file" }).click();
    await expect(page.getByRole("menuitem").first()).toHaveAccessibleName(/Back/);
    win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  } else {
    await page.getByRole("button", { name: "Add pages", exact: true }).click();
    await expect(page.getByRole("group", { name: "From a file" }).getByRole("menuitem")).toHaveCount(4);
    win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  }
  await reachPicker(win);
  await expect(win.getByRole("radio")).not.toHaveCount(0); // one file only
  await mockPick(win, ["bravo.pdf"]);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Add pages from bravo.pdf");
  await expect(dialog.getByTestId("picker-tile")).toHaveCount(2);
  await dialog.getByTestId("picker-tile").first().click();
  await dialog.getByTestId("picker-confirm").click();
  await expect.poll(() => tileLabels(page)).toEqual(["A1", "A2", "A3", "B1"]);
  expect((await mockLog(page))!.requests.at(-1)!.multiple).toBe(false);
});

test("AC-148: 51 files from the cloud load 50 and show the local over-the-cap message", async ({ page }) => {
  test.setTimeout(120_000);
  const win = await openWindow(page, () => page.getByTestId("cloud-row").getByRole("button", { name: /^Choose from Google Drive/ }).click());
  await reachPicker(win);
  await win.getByRole("button", { name: "51 files" }).click();
  await expect.poll(async () => (await cardNames(page)).length, { timeout: 60_000 }).toBe(50);
  await expect(page.getByRole("alert").filter({ hasText: /50/ })).toBeVisible();
});

test("AC-139: local, Google Drive, Dropbox and OneDrive files merge in card order", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  for (const [p, f] of [["Google Drive", "bravo.pdf"], ["Dropbox", "echo.pdf"], ["OneDrive", "charlie.png"]] as const) {
    if (isPhoneToolbar(page)) {
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const win = await openWindow(page, () => page.getByRole("menuitem", { name: new RegExp(`^${p}`) }).click());
      await mockPick(win, [f]);
    } else {
      await page.getByTestId("cloud-caret-toolbar").click();
      const win = await openWindow(page, () => page.getByRole("menuitem", { name: new RegExp(`^${p}`) }).click());
      await mockPick(win, [f]);
    }
    await expect.poll(async () => (await cardNames(page)).includes(f)).toBe(true);
  }
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf", "charlie.png"]);
  const { bytes } = await runAndDownload(page);
  const doc = await outputDoc(bytes);
  expect(doc.getPageCount()).toBe(3 + 2 + 1 + 1);
  const texts = await textsOf(bytes);
  expect(texts[0]).toContain("Alpha");
  expect(texts[3]).toContain("Bravo");
  expect(texts[5]).toContain("Echo");
  void chooseMenu;
});
