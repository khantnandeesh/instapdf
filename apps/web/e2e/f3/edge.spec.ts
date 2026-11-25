/**
 * F3 Merge: edge cases (limits, mixed inputs, undo, keyboard-only reorder, touch alternatives,
 * dark mode). Every run asserts on the downloaded file. Spec: docs/specs/f3-merge.md §5, §7, M-7, M-8, M-11.
 *
 * Browser coverage: only Chromium is installed in this environment. The Alt+Arrow "no history
 * Back" checks (M-11 #2) are verified on Chromium only; Firefox and WebKit are unverified.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import {
  card,
  cardNames,
  cards,
  chooseMenu,
  firstWord,
  flow,
  fx,
  isDesktop,
  loadPlain,
  mergeOptions,
  closeMergeOptions,
  openMerge,
  pickBuffers,
  pickMerge,
  runAndDownload,
  showFiles,
  showPages,
  textsOf,
  tile,
  tileAction,
  tileLabels,
  tileMain,
  chooseAddPages,
} from "./support";

const live = (page: Page) => page.locator("[aria-live=polite]").first();
const words = async (bytes: Uint8Array) => (await textsOf(bytes)).map(firstWord);
const notice = (page: Page, text: string | RegExp) => page.getByTestId("notice").filter({ hasText: text });

/** A one-page-per-number PDF with "Big n" on each page (built at test time, never committed). */
async function bigPdf(pages: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`Big ${i}`, { x: 72, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
}

// ================================================================ limits and mixed inputs

test.describe("limits and mixed inputs", () => {
  test.beforeEach(async ({ page }) => {
    await openMerge(page);
  });

  test("AC-70: with 50 files loaded, Add files with one more says 50 is the cap and adds nothing", { tag: "@serial" }, async ({ page }) => {
    test.setTimeout(120_000);
    const echo = await readFile(fx("echo.pdf"));
    await pickBuffers(page, Array.from({ length: 50 }, (_, i) => ({ name: `f${String(i + 1).padStart(2, "0")}.pdf`, buffer: echo })));
    await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await expect(cards(page)).toHaveCount(50);
    await expect(page.getByRole("alert").filter({ hasText: "up to 50 files" })).toHaveCount(0);
    await page.getByTestId("file-input").setInputFiles(fx("alpha.pdf"));
    await expect(page.getByRole("alert").filter({ hasText: "up to 50 files" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "up to 50 files" })).toContainText("alpha.pdf");
    await expect(cards(page)).toHaveCount(50);
    expect(await cardNames(page)).not.toContain("alpha.pdf");
    await expect(page.getByTestId("dock-status")).toHaveText("50 pages · 50 files");
    const out = await runAndDownload(page);
    const t = await textsOf(out.bytes);
    expect(t).toHaveLength(50);
    expect(t.every((x) => x.includes("Echo 1"))).toBe(true);
  });

  test("AC-71: user-pw.pdf then alpha.pdf: unlock with test, Page 1-3 then Alpha 1-3, no password on the output", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fx("user-pw.pdf"));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password", { exact: true }).fill("test");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    await pickMerge(page, "alpha.pdf");
    expect(await cardNames(page)).toEqual(["user-pw.pdf", "alpha.pdf"]);
    const out = await runAndDownload(page);
    await loadPlain(out.bytes); // throws if encrypted
    expect(await words(out.bytes)).toEqual(["Page 1", "Page 2", "Page 3", "Alpha 1", "Alpha 2", "Alpha 3"]);
  });

  test("Edge: a user-password file among plain ones: Skip drops only it; Unlock keeps it in sorted order", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("user-pw.pdf"), fx("bravo.pdf")]);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("user-pw.pdf");
    await dialog.getByRole("button", { name: "Skip this file" }).click();
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
    let out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("user-pw.pdf"), fx("bravo.pdf")]);
    await dialog.getByLabel("Password", { exact: true }).fill("wrong");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(dialog).toBeVisible(); // a wrong password keeps the prompt open
    await dialog.getByLabel("Password", { exact: true }).fill("test");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "user-pw.pdf"]);
    out = await runAndDownload(page);
    await loadPlain(out.bytes);
    expect(await words(out.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2", "Page 1", "Page 2", "Page 3"]);
  });

  test("Edge: corrupt and empty PDFs among valid ones are named and skipped; the rest merge", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([fx("alpha.pdf"), fx("corrupt.pdf"), fx("empty.pdf"), fx("bravo.pdf"), fx("notes.txt")]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    for (const name of ["corrupt.pdf", "empty.pdf", "notes.txt"]) await expect(page.getByRole("alert").filter({ hasText: name }).first()).toBeVisible();
    expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf"]);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
  });

  test("Edge: PNG, JPG, TIFF, GIF, BMP and WebP mixed with PDFs: one page per image (two for the TIFF), in card order", async ({ page }) => {
    await pickMerge(page, "bravo.pdf", "tiny.webp", "fox.tiff", "alpha.pdf", "delta.jpg", "tiny.gif", "charlie.png", "tiny.bmp");
    expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "charlie.png", "delta.jpg", "fox.tiff", "tiny.bmp", "tiny.gif", "tiny.webp"]);
    await expect(page.getByTestId("dock-status")).toHaveText("12 pages · 8 files");
    // Move an image to the front with the card buttons, then check the pages view agrees.
    await page.getByRole("button", { name: "Move delta.jpg earlier" }).click();
    await page.getByRole("button", { name: "Move delta.jpg earlier" }).click();
    await page.getByRole("button", { name: "Move delta.jpg earlier" }).click();
    expect((await cardNames(page))[0]).toBe("delta.jpg");
    await showPages(page);
    await expect(page.getByTestId("tile-label")).toHaveCount(12);
    const out = await runAndDownload(page);
    const doc = await loadPlain(out.bytes);
    expect(doc.getPageCount()).toBe(12);
    const w = await words(out.bytes);
    expect(w[0]).toBe("blank"); // delta.jpg: an image page has no text
    expect(w.slice(1, 6)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
    expect(w.slice(6)).toEqual(Array(6).fill("blank"));
    // Image pages are A4 (either orientation) and each draws one image.
    const { PDFName, PDFDict } = await import("pdf-lib");
    for (const i of [0, 6, 7, 8, 9, 10, 11]) {
      const p = doc.getPage(i);
      expect([p.getWidth(), p.getHeight()].sort((a, b) => a - b), `page ${i + 1}`).toEqual([595, 842]);
      const xo = p.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      expect(xo?.keys().length ?? 0, `page ${i + 1} images`).toBe(1);
    }
  });

  test("Edge: near the 1,000-page cap: 997 + 3 pages load, one page more is refused, the 1,000-page merge is right", { tag: "@serial" }, async ({ page }) => {
    test.setTimeout(180_000);
    await pickBuffers(page, [{ name: "big.pdf", buffer: await bigPdf(997) }]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
    await pickMerge(page, "alpha.pdf");
    await expect(page.getByTestId("dock-status")).toHaveText("1,000 pages · 2 files");
    await page.getByTestId("file-input").setInputFiles(fx("echo.pdf"));
    await expect(page.getByRole("alert").filter({ hasText: "echo.pdf" })).toContainText("past 1,000 pages");
    expect(await cardNames(page)).toEqual(["big.pdf", "alpha.pdf"]);
    await page.getByRole("button", { name: "Move alpha.pdf earlier" }).click();
    // The pages view renders all 1,000 tiles (thumbnails are lazy).
    await showPages(page);
    await expect(page.getByTestId("tile-label")).toHaveCount(1000, { timeout: 30_000 });
    const out = await runAndDownload(page);
    const t = await textsOf(out.bytes);
    expect(t).toHaveLength(1000);
    expect(t.slice(0, 4).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Big 1"]);
    expect(t[999]).toContain("Big 997");
  });

  test("Edge: at 1,000 pages, Blank page and Duplicate are refused with a notice; the output stays at 1,000", { tag: "@serial" }, async ({ page }) => {
    test.setTimeout(180_000);
    const doc = await PDFDocument.create();
    for (let i = 0; i < 1000; i++) doc.addPage([200, 200]);
    await pickBuffers(page, [{ name: "k.pdf", buffer: Buffer.from(await doc.save()) }]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
    await expect(page.getByTestId("dock-status")).toContainText("1,000 pages");
    const capNotice = notice(page, "past 1,000 pages, so nothing was added");
    await chooseAddPages(page, "Blank page");
    await expect(capNotice).toBeVisible();
    await expect(page.getByTestId("dock-status")).toContainText("1,000 pages");
    await page.getByRole("button", { name: /Dismiss/ }).first().click().catch(() => {});
    await showPages(page);
    await tileAction(page, "A1", "Duplicate");
    await expect(capNotice.first()).toBeVisible();
    await expect(page.getByTestId("dock-status")).toContainText("1,000 pages");
    // The picker is capped at intake.
    await chooseAddPages(page, "Pages from a file…");
    await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
    await expect(page.getByRole("alert").filter({ hasText: "three-pages.pdf" })).toContainText("past 1,000 pages");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const out = await runAndDownload(page);
    expect((await loadPlain(out.bytes)).getPageCount()).toBe(1000);
  });

  test("Edge: a file over 1,000 pages on its own is refused with the cap", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fx("too-many-pages.pdf"));
    await expect(page.getByRole("alert").filter({ hasText: "too-many-pages.pdf" })).toContainText("1,000 pages");
    await expect(flow(page)).toHaveAttribute("data-state", "empty");
  });
});

// ================================================================ undo

test.describe("undo", () => {
  test.beforeEach(async ({ page }) => {
    await openMerge(page);
  });

  test("AC-79: Undo after Sort and after Reverse restores the manual order (files view)", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
    await page.getByRole("button", { name: "Move echo.pdf earlier" }).click();
    expect(await cardNames(page)).toEqual(["alpha.pdf", "echo.pdf", "bravo.pdf"]);
    await chooseMenu(page, "Sort", "Name Z to A");
    expect(await cardNames(page)).toEqual(["echo.pdf", "bravo.pdf", "alpha.pdf"]);
    await notice(page, "Sorted by name, Z to A").getByRole("button", { name: "Undo" }).click();
    expect(await cardNames(page)).toEqual(["alpha.pdf", "echo.pdf", "bravo.pdf"]);
    await chooseMenu(page, "Sort", "Reverse order");
    expect(await cardNames(page)).toEqual(["bravo.pdf", "echo.pdf", "alpha.pdf"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await cardNames(page)).toEqual(["alpha.pdf", "echo.pdf", "bravo.pdf"]);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Echo 1", "Bravo 1", "Bravo 2"]);
  });

  test("AC-79: undo is single level: two removals, Undo brings back only the last one", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
    await page.getByRole("button", { name: "Remove alpha.pdf" }).click();
    await page.getByRole("button", { name: "Remove echo.pdf" }).click();
    await expect(notice(page, "Removed alpha.pdf.")).toHaveCount(0);
    await notice(page, "Removed echo.pdf.").getByRole("button", { name: "Undo" }).click();
    expect(await cardNames(page)).toEqual(["bravo.pdf", "echo.pdf"]);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z"); // nothing left to undo
    expect(await cardNames(page)).toEqual(["bravo.pdf", "echo.pdf"]);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Bravo 1", "Bravo 2", "Echo 1"]);
  });

  test("AC-79: pages view: Delete removes a tile, Ctrl+Z restores it in place with focus; Reverse is undoable", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf");
    await showPages(page);
    await tile(page, "B1").hover();
    await page.getByRole("button", { name: "Rotate B1 right" }).click();
    await tileMain(page, "B1").focus();
    await page.keyboard.press("Delete");
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B2"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    await expect(tileMain(page, "B1")).toBeFocused();
    await expect(tileMain(page, "B1")).toHaveAccessibleName(/rotated 90°/);
    await chooseMenu(page, "Sort", "Reverse order");
    expect(await tileLabels(page)).toEqual(["B1", "B2", "A1", "A2", "A3"]);
    await notice(page, "Order reversed").getByRole("button", { name: "Undo" }).click();
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
    expect((await loadPlain(out.bytes)).getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 0, 90, 0]);
  });
});

// ================================================================ keyboard-only reorder

test.describe("keyboard-only reorder", () => {
  test.beforeEach(async ({ page }) => {
    // A real history entry behind the tool, so a stray Alt+Left "Back" would leave the page.
    await page.goto("/");
    await openMerge(page);
  });

  const stillHere = async (page: Page) => {
    expect(new URL(page.url()).pathname).toBe("/merge-pdf");
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
  };

  test("AC-10: files view: Alt+Arrow/Home/End move the focused card, focus follows, Back never fires (Chromium)", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
    const main = (n: string) => card(page, n).getByTestId("card-main");
    await main("alpha.pdf").focus();
    await page.keyboard.press("Alt+ArrowLeft"); // already first: no move, no Back
    await stillHere(page);
    await expect(live(page)).toContainText("alpha.pdf is already first.");
    expect(await cardNames(page)).toEqual(["alpha.pdf", "bravo.pdf", "echo.pdf"]);
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    expect(await cardNames(page)).toEqual(["bravo.pdf", "echo.pdf", "alpha.pdf"]);
    await expect(main("alpha.pdf")).toBeFocused();
    await expect(live(page)).toContainText("alpha.pdf moved to position 3 of 3");
    await page.keyboard.press("Alt+ArrowLeft");
    await stillHere(page);
    expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf", "echo.pdf"]);
    // Plain arrows move focus without moving cards.
    await page.keyboard.press("ArrowRight");
    await expect(main("echo.pdf")).toBeFocused();
    await page.keyboard.press("Alt+Home");
    expect(await cardNames(page)).toEqual(["echo.pdf", "bravo.pdf", "alpha.pdf"]);
    await expect(main("echo.pdf")).toBeFocused();
    await page.keyboard.press("Alt+End");
    expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf", "echo.pdf"]);
    await stillHere(page);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Bravo 1", "Bravo 2", "Alpha 1", "Alpha 2", "Alpha 3", "Echo 1"]);
  });

  test("AC-20: pages view: Alt+Arrow/Home/End move the focused tile, focus follows, Back never fires (Chromium)", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf");
    await showPages(page);
    await tileMain(page, "A1").focus();
    await page.keyboard.press("Alt+ArrowLeft");
    await stillHere(page);
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    await page.keyboard.press("Alt+ArrowRight");
    expect(await tileLabels(page)).toEqual(["A2", "A1", "A3", "B1", "B2"]);
    await expect(tileMain(page, "A1")).toBeFocused();
    await expect(live(page)).toContainText("A1 moved to position 2 of 5");
    await page.keyboard.press("Alt+End");
    expect(await tileLabels(page)).toEqual(["A2", "A3", "B1", "B2", "A1"]);
    await expect(tileMain(page, "A1")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tileMain(page, "B2")).toBeFocused();
    await page.keyboard.press("Alt+Home");
    expect(await tileLabels(page)).toEqual(["B2", "A2", "A3", "B1", "A1"]);
    await page.keyboard.press("Alt+ArrowLeft");
    await stillHere(page);
    // The files view shows the same order as segments.
    await showFiles(page);
    expect(await cardNames(page)).toEqual(["bravo.pdf", "alpha.pdf", "bravo.pdf", "alpha.pdf"]);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Bravo 2", "Alpha 2", "Alpha 3", "Bravo 1", "Alpha 1"]);
  });
});

// ================================================================ 375 px touch alternatives

test.describe("375 px touch: move buttons instead of drag", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "this block sets its own 375 px touch context; running it once is enough");
    await openMerge(page);
  });

  test("AC-11, AC-75: cards: tapping Move earlier / later reorders, targets are 44 px, the merge follows", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
    const later = page.getByRole("button", { name: "Move alpha.pdf later" });
    await expect(later).toBeVisible();
    const box = (await later.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await later.tap();
    await page.getByRole("button", { name: "Move echo.pdf earlier" }).tap();
    await page.getByRole("button", { name: "Move echo.pdf earlier" }).tap();
    expect(await cardNames(page)).toEqual(["echo.pdf", "bravo.pdf", "alpha.pdf"]);
    await expect(page.getByRole("button", { name: "Move echo.pdf earlier" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Echo 1", "Bravo 1", "Bravo 2", "Alpha 1", "Alpha 2", "Alpha 3"]);
  });

  test("AC-75: tiles: the More menu's Move earlier / Move later / Move to position work by tap", async ({ page }) => {
    await pickMerge(page, "alpha.pdf", "bravo.pdf");
    await showPages(page);
    const more = tile(page, "B2").getByTestId("tile-more");
    const box = (await more.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await more.tap();
    await page.getByRole("menuitem", { name: "Move earlier" }).tap();
    expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "B2", "B1"]);
    await tile(page, "A1").getByTestId("tile-more").tap();
    await page.getByRole("menuitem", { name: "Move later" }).tap();
    expect(await tileLabels(page)).toEqual(["A2", "A1", "A3", "B2", "B1"]);
    await tile(page, "B1").getByTestId("tile-more").tap();
    await page.getByRole("menuitem", { name: "Move to position…" }).tap();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("New position (1–5)").fill("1");
    await dialog.getByRole("button", { name: "Move", exact: true }).tap();
    await expect(dialog).toBeHidden();
    expect(await tileLabels(page)).toEqual(["B1", "A2", "A1", "A3", "B2"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const out = await runAndDownload(page);
    expect(await words(out.bytes)).toEqual(["Bravo 1", "Alpha 2", "Alpha 1", "Alpha 3", "Bravo 2"]);
  });
});

// ================================================================ dark mode

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("AC-74: OS dark mode: the light BerryPDF palette stays and axe finds no serious or critical violations in every state", async ({ page }) => {
    await openMerge(page);
    // BerryPDF defines no dark theme yet (docs/design/berrypdf.md "Dark mode"): an OS dark preference keeps the light grid paper.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 253, 251)");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    await expectNoSeriousAxeViolations(page, "dark: empty");
    await pickMerge(page, "alpha.pdf", "bravo.pdf", "charlie.png");
    await expectNoSeriousAxeViolations(page, "dark: files view");
    await page.getByRole("button", { name: "Remove charlie.png" }).click();
    await expect(notice(page, "Removed charlie.png.")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark: undo notice");
    await showPages(page);
    await tileMain(page, "A1").click();
    await tileMain(page, "B1").click({ modifiers: ["ControlOrMeta"] });
    await expectNoSeriousAxeViolations(page, "dark: pages view with a selection");
    await tile(page, "A3").hover();
    await page.getByRole("button", { name: "Remove A3" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark: remove-selected confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.keyboard.press("Escape");
    await tileAction(page, "B2", "Move to position…");
    // The Move dialog is a lazy component on first use: it opens a render after the click, so wait for it
    // before settled() looks for its entrance (otherwise axe can catch its fade-in, CI on the cloud build).
    await expect(page.getByRole("dialog", { name: "Move B2" })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark: move dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await chooseAddPages(page, "Pages from a file…");
    await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByTestId("picker-tile").first().click();
    await expectNoSeriousAxeViolations(page, "dark: page picker");
    await page.keyboard.press("Escape");
    await mergeOptions(page);
    await expectNoSeriousAxeViolations(page, "dark: options");
    await closeMergeOptions(page);
    await runAndDownload(page);
    await expectNoSeriousAxeViolations(page, "dark: result");
  });
});

// ================================================================ catalogue (F2 hand-off)

test("AC-77: the catalogue card and the menu entry link to /merge-pdf with Beta, not Coming soon; the tool renders", async ({ page }) => {
  const { openHydrated, openMenu, menu } = await import("../f2/support");
  await page.setViewportSize({ width: 1366, height: 900 });
  await openHydrated(page, "/");
  const catalogueLink = page.locator('[data-testid=catalogue] [data-testid=category] a[href="/merge-pdf"]');
  await expect(catalogueLink).toHaveCount(1);
  await expect(catalogueLink).toHaveAccessibleName(/Beta/);
  await expect(catalogueLink).not.toHaveAccessibleName(/Coming soon/);
  await openMenu(page);
  const entry = menu(page).locator('nav a[href="/merge-pdf"]');
  await expect(entry).toHaveAccessibleName(/Beta/);
  await expect(entry).not.toHaveAccessibleName(/Coming soon/);
  await entry.click();
  await expect(page).toHaveURL(/\/merge-pdf$/);
  await expect(page.getByTestId("coming-soon")).toHaveCount(0);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  // A planned tool still renders the coming-soon page (F2's planned-tool tests use split-pdf).
  await page.goto("/split-pdf");
  await expect(page.getByTestId("coming-soon")).toBeVisible();
});
