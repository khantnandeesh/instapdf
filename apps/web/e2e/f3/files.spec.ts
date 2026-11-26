/** F3 Merge: intake, files view and output basics. Spec: docs/specs/f3-merge.md §7 */
import { expect, test } from "@playwright/test";
import {
  card,
  cardNames,
  cards,
  chooseMenu,
  downloadResult,
  dropFixtures,
  firstWord,
  flow,
  fx,
  hugePngPayload,
  isDesktop,
  openMerge,
  outputDoc,
  pickMerge,
  primary,
  run,
  textsOf,
} from "./support";
import { cardAction } from "../support/flow";

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

test("AC-1: /merge-pdf is the tool with a multi-file input for PDFs and images", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Merge PDF");
  await expect(page.getByTestId("coming-soon")).toHaveCount(0);
  const input = page.getByTestId("file-input");
  await expect(input).toHaveAttribute("multiple", "");
  const accept = (await input.getAttribute("accept"))!;
  for (const ext of [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"]) expect(accept).toContain(ext);
  await expect(page.getByRole("button", { name: "Choose files" })).toBeVisible();
});

test("AC-2, AC-41, AC-66: two PDFs give two cards in order, and a 5-page alpha_merged.pdf", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
  await expect(page.getByTestId("file-meta").first()).toContainText("3 pages");
  await expect(page.getByTestId("file-meta").nth(1)).toContainText("2 pages");
  expect(await page.getByTestId("source-badge").allTextContents()).toEqual(["A", "B"]);
  await expect(page.getByRole("radio", { name: "Files" })).toHaveAttribute("aria-checked", "true");
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("alpha_merged.pdf");
  const doc = await outputDoc(out.bytes);
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle])).toEqual([
    [595, 842, 0],
    [595, 842, 0],
    [595, 842, 0],
    [792, 612, 0],
    [792, 612, 0],
  ]);
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
});

test("AC-3: the first batch is sorted naturally and case-insensitively", async ({ page }) => {
  await pickMerge(page, "File10.pdf", "file2.pdf", "bravo.pdf", "alpha.pdf");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "file2.pdf", "File10.pdf"]);
});

test("AC-4: Add files appends after the existing cards", async ({ page }) => {
  await pickMerge(page, "bravo.pdf", "echo.pdf");
  await pickMerge(page, "alpha.pdf");
  expect(await cardNames(page)).toEqual(["bravo.pdf", "echo.pdf", "alpha.pdf"]);
});

test("AC-5: an image becomes a one-page card with a thumbnail; the run has 4 pages", async ({ page }) => {
  await pickMerge(page, "charlie.png", "alpha.pdf");
  await expect(card(page, "charlie.png").getByTestId("file-meta")).toHaveText("Image · 1 page");
  await expect(card(page, "charlie.png").locator("canvas")).toBeVisible();
  await run(page);
  const out = await downloadResult(page);
  expect((await outputDoc(out.bytes)).getPageCount()).toBe(4);
});

test("AC-6: an unreadable image is named in an error and the PDF stays", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([fx("broken.png"), fx("alpha.pdf")]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByRole("alert").filter({ hasText: "broken.png" })).toBeVisible();
  expect(await cardNames(page)).toEqual(["alpha.pdf"]);
});

test("AC-7: a 64-megapixel image is refused fast, naming the 50-megapixel cap", { tag: "@serial" }, async ({ page }) => {
  const started = Date.now();
  await page.getByTestId("file-input").setInputFiles(await hugePngPayload());
  await expect(page.getByRole("alert").filter({ hasText: /huge\.png.*50 megapixels/ })).toBeVisible({ timeout: 3000 });
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
});

test("AC-8: a 2-frame TIFF gives a 2-page card and 2 pages", async ({ page }) => {
  await pickMerge(page, "fox.tiff");
  await expect(card(page, "fox.tiff").getByTestId("file-meta")).toHaveText("Image · 2 pages");
  await run(page);
  expect((await outputDoc((await downloadResult(page)).bytes)).getPageCount()).toBe(2);
});

test("AC-9: dragging the bravo card in front of alpha reorders the merge", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "pointer drag with a mouse; touch uses the buttons");
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await page.mouse.move(0, 0);
  const b = card(page, "bravo.pdf").locator("[data-card-box]");
  const a = card(page, "alpha.pdf").locator("[data-card-box]");
  const bb = (await b.boundingBox())!;
  const ab = (await a.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 - 20, bb.y + 30, { steps: 4 });
  await page.mouse.move(ab.x + ab.width * 0.2, ab.y + ab.height / 2, { steps: 10 });
  await expect(page.getByTestId("slot-bar")).toBeVisible();
  await page.mouse.up();
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf"]);
  await expect(page.locator("[aria-live=polite]").first()).toContainText("bravo.pdf moved to position 1 of 2");
  await run(page);
  expect((await textsOf((await downloadResult(page)).bytes)).map(firstWord)).toEqual(["Bravo 1", "Bravo 2", "Alpha 1", "Alpha 2", "Alpha 3"]);
});

test("AC-76: a pointer drag announces its start and can be cancelled with Escape", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "pointer drag with a mouse");
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  const bb = (await card(page, "bravo.pdf").locator("[data-card-box]").boundingBox())!;
  const ab = (await card(page, "alpha.pdf").locator("[data-card-box]").boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20);
  await page.mouse.down();
  await page.mouse.move(ab.x + 20, ab.y + ab.height / 2, { steps: 10 });
  await expect(page.locator("[aria-live=polite]").first()).toContainText("Moving bravo.pdf. Press Escape to cancel.");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[aria-live=polite]").first()).toContainText("Move cancelled.");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
});

test("AC-10: Alt+ArrowRight on a focused card moves it, keeps focus and announces it", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  const main = card(page, "alpha.pdf").getByTestId("card-main");
  await main.focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf"]);
  await expect(card(page, "alpha.pdf").getByTestId("card-main")).toBeFocused();
  await expect(page.locator("[aria-live=polite]").first()).toContainText("alpha.pdf moved to position 2 of 2");
  expect(new URL(page.url()).pathname).toBe("/merge-pdf"); // Alt+Left/Right never navigates
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
  expect(new URL(page.url()).pathname).toBe("/merge-pdf");
  await page.keyboard.press("Alt+End");
  await run(page);
  expect((await textsOf((await downloadResult(page)).bytes)).map(firstWord)[0]).toBe("Bravo 1");
});

test("AC-11: Move earlier / later buttons, disabled at the ends", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await expect(page.getByRole("button", { name: "Move alpha.pdf earlier" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move bravo.pdf later" })).toBeDisabled();
  await page.getByRole("button", { name: "Move alpha.pdf later" }).click();
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf"]);
});

test("AC-12, AC-78: sort by name both ways, and reverse twice restores", async ({ page }) => {
  await pickMerge(page, "bravo.pdf");
  await pickMerge(page, "alpha.pdf");
  await pickMerge(page, "echo.pdf");
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf", "echo.pdf"]);
  await chooseMenu(page, "Sort", "Name Z to A");
  expect(await cardNames(page)).toEqual(["echo.pdf", "bravo.pdf", "alpha.pdf"]);
  await chooseMenu(page, "Sort", "Name A to Z");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
  await expect(page.getByRole("button", { name: "Sort", exact: true })).toBeFocused();
  await chooseMenu(page, "Sort", "Reverse order");
  expect(await cardNames(page)).toEqual(["echo.pdf", "bravo.pdf", "alpha.pdf"]);
  await chooseMenu(page, "Sort", "Reverse order");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
  await run(page);
  expect((await textsOf((await downloadResult(page)).bytes)).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2", "Echo 1"]);
});

test("AC-13: sort by last modified both ways (dropped files with set dates)", async ({ page }) => {
  const bytes = await import("node:fs/promises").then((fs) => fs.readFile(fx("echo.pdf")));
  await page.evaluate((b64) => {
    const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer();
    for (const [name, t] of [["c3.pdf", 3000], ["a1.pdf", 1000], ["b2.pdf", 2000]] as const) dt.items.add(new File([data], name, { type: "application/pdf", lastModified: t }));
    for (const type of ["dragenter", "dragover", "drop"]) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes.toString("base64"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await chooseMenu(page, "Sort", "Newest first");
  expect(await cardNames(page)).toEqual(["c3.pdf", "b2.pdf", "a1.pdf"]);
  await chooseMenu(page, "Sort", "Oldest first");
  expect(await cardNames(page)).toEqual(["a1.pdf", "b2.pdf", "c3.pdf"]);
});

test("AC-14: rotating the bravo card rotates only its pages", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await card(page, "bravo.pdf").hover();
  await page.getByRole("button", { name: "Rotate bravo.pdf right" }).click();
  await expect(card(page, "bravo.pdf").getByTestId("card-main")).toHaveAccessibleName(/rotated 90°/);
  await run(page);
  const doc = await outputDoc((await downloadResult(page)).bytes);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 0, 90, 90]);
});

test("AC-15, AC-79: remove a card, undo it, and removing the last card empties the tool", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
  await card(page, "bravo.pdf").hover();
  await page.getByRole("button", { name: "Rotate bravo.pdf right" }).click();
  await cardAction(page, "bravo.pdf", "Remove");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "echo.pdf"]);
  const notice = page.getByTestId("notice").filter({ hasText: "Removed bravo.pdf." });
  await expect(notice).toBeVisible();
  await page.waitForTimeout(8000);
  await expect(notice).toBeVisible(); // at least 8 s
  await notice.getByRole("button", { name: "Undo" }).click();
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
  await expect(card(page, "bravo.pdf").getByTestId("card-main")).toBeFocused();
  await run(page);
  const out = await downloadResult(page);
  const doc = await outputDoc(out.bytes);
  expect(doc.getPageCount()).toBe(6);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 0, 90, 90, 0]);
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2", "Echo 1"]);

  await page.getByRole("button", { name: "Back to options" }).click();
  for (const n of ["alpha.pdf", "bravo.pdf", "echo.pdf"]) await cardAction(page, n, "Remove");
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await page.keyboard.press("Control+z");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  expect(await cardNames(page)).toEqual(["echo.pdf"]);
});

test("AC-16: Enlarge on a card previews its page 1, and Next shows page 2", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await card(page, "alpha.pdf").hover();
  await cardAction(page, "alpha.pdf", "Enlarge");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Page 1 of 3");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog).toContainText("Page 2 of 3");
});

test("AC-72: one file is enough to run, and the status gives the counts", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await expect(primary(page)).toBeEnabled();
  await expect(page.getByTestId("dock-status")).toHaveText("3 pages · 1 file · add more to merge");
  await pickMerge(page, "bravo.pdf");
  await expect(page.getByTestId("dock-status")).toHaveText("5 pages · 2 files");
});

test("AC-80: the same file added twice is added, with a notice; another file shows none", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await pickMerge(page, "bravo.pdf");
  await expect(page.getByTestId("notice").filter({ hasText: "added twice" })).toHaveCount(0);
  await pickMerge(page, "alpha.pdf");
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "alpha.pdf"]);
  const notice = page.getByTestId("notice").filter({ hasText: "alpha.pdf was added twice" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Remove the copy" }).click();
  expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
});

test("AC-70 / F1 AC-18 adapted: 51 files load 50 and say so", { tag: "@serial" }, async ({ page }) => {
  const bytes = await import("node:fs/promises").then((fs) => fs.readFile(fx("echo.pdf")));
  const files = Array.from({ length: 51 }, (_, i) => ({ name: `f${String(i + 1).padStart(2, "0")}.pdf`, mimeType: "application/pdf", buffer: bytes }));
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(cards(page)).toHaveCount(50);
  await expect(page.getByRole("alert").filter({ hasText: "up to 50 files" })).toBeVisible();
});

test("F1 AC-28 adapted, AC-71: owner-restricted loads without a prompt; user-pw merges after unlock", async ({ page }) => {
  await pickMerge(page, "owner-restricted.pdf", "alpha.pdf");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await run(page);
  expect((await outputDoc((await downloadResult(page)).bytes)).getPageCount()).toBe(6);
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByTestId("file-input").setInputFiles([fx("user-pw.pdf"), fx("alpha.pdf")]);
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill("test");
  await page.getByRole("dialog").getByRole("button", { name: "Unlock" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await run(page);
  const out = await downloadResult(page);
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Page 1", "Page 2", "Page 3"]);
});

test("F1 AC-12 adapted: the wrong-type message names PDFs and images", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([fx("notes.txt")]);
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toContainText("PDFs and JPG, PNG, GIF, BMP, WebP and TIFF images");
});

test("F1 AC-43 adapted: the result offers Merge and Rotate; Rotate opens with the merged file", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await run(page);
  const keep = page.getByRole("heading", { name: "Keep going with this file" }).locator("..");
  await expect(keep.getByRole("button", { name: "Merge" })).toBeVisible();
  await keep.getByRole("button", { name: "Rotate" }).click();
  await expect(page).toHaveURL(/\/rotate-pdf$/);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("dock-status")).toContainText("5 pages");
});

test("drop adds files at the end (F1 AC-3 / AC-8)", async ({ page }) => {
  await pickMerge(page, "bravo.pdf");
  await dropFixtures(page, ["alpha.pdf"]);
  await expect(cards(page)).toHaveCount(2);
  expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf"]);
});
