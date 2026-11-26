/** F5 Organize (`/organize-pdf`). Spec: docs/specs/f4-f5-page-tools.md §3e, §6d, §7 (AC-490 to AC-502), I-9, I-10 (AC-546 to AC-550). */
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { outlineOf } from "../../src/lib/pdf/page-tool-fixtures";
import {
  dragTo,
  downloadResult,
  flow,
  label,
  live,
  open,
  organizeMenu,
  pickF5,
  primary,
  redoButton,
  run,
  showFiles,
  showPages,
  textsOf,
  tile,
  tileAction,
  tileLabels,
  tileMain,
  toolbarOverflow,
  undoButton,
} from "./support";

const A = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `A${from + i}`);
const selectedLabels = (page: import("@playwright/test").Page) =>
  page.locator("[data-uid]:has([data-testid=page-tile][data-selected])").getByTestId("tile-label").allTextContents();
const quarterTurns = async (page: import("@playwright/test").Page, label: string) =>
  ((Number(await tile(page, label).getByTestId("page-tile").getAttribute("data-rotation")) / 90) % 4 + 4) % 4;
const words = async (bytes: Uint8Array) => (await textsOf(bytes)).map(label);
async function runAndDownload(page: import("@playwright/test").Page) {
  await run(page);
  return downloadResult(page);
}

test.beforeEach(async ({ page }) => {
  await open(page, "organize-pdf");
});

test("AC-490: pick order, pages view, A1–A12 then B1–B3; no Merge options; Save PDF", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await expect(page.getByTestId("page-grid")).toBeVisible();
  expect(await tileLabels(page)).toEqual([...A(1, 12), "B1", "B2", "B3"]);
  await expect(page.getByTestId("dock-options")).toHaveCount(0);
  await expect(page.getByTestId("options-button")).toHaveCount(0);
  await expect(page.getByText("Contents page")).toHaveCount(0);
  await expect(primary(page)).toHaveText("Save PDF");
  await expect(page.getByTestId("dock-status")).toHaveText("15 pages · 2 files");
});

test("P-3: empty state has no side panel: drop card and the bar with the disabled Save PDF", async ({ page }) => {
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.locator("[data-ip-dock]")).toHaveAttribute("data-ip-dock", "bar");
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByTestId("dock-status")).toHaveText("Add files to start");
  await expect(page.getByTestId("history")).toHaveCount(0);
});

test("AC-491: Select all (menu and Ctrl/Cmd+A) selects 15; Select none and Escape clear", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await organizeMenu(page, "Select", "Select all");
  await expect(page.getByTestId("selection-count")).toHaveText("15 selected");
  await organizeMenu(page, "Select", "Select none");
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);
  await tileMain(page, "A3").focus();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByTestId("selection-count")).toHaveText("15 selected");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);
});

test("AC-492: Invert with A1 and A2 selected leaves the other 13", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await tileMain(page, "A1").click();
  await expect(page.getByTestId("selection-count")).toHaveText("1 selected");
  await tileMain(page, "A2").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("selection-count")).toHaveText("2 selected");
  await organizeMenu(page, "Select", "Invert selection");
  expect(await selectedLabels(page)).toEqual([...A(3, 12), "B1", "B2", "B3"]);
});

test("AC-493: Reverse with nothing selected reverses all; the output follows", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await organizeMenu(page, "Sort", "Reverse order");
  expect(await tileLabels(page)).toEqual(["B3", "B2", "B1", ...A(1, 12).reverse()]);
  const out = await runAndDownload(page);
  expect(await words(out.bytes)).toEqual(["Page 3", "Page 2", "Page 1", ...Array.from({ length: 12 }, (_, i) => `Twelve ${12 - i}`)]);
});

test("AC-494, AC-495: Reverse mirrors a consecutive selection in place and swaps a scattered one end for end", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await tileMain(page, "A2").click();
  await expect(page.getByTestId("selection-count")).toHaveText("1 selected");
  await tileMain(page, "A4").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-count")).toHaveText("3 selected");
  expect(await selectedLabels(page)).toEqual(["A2", "A3", "A4"]);
  await organizeMenu(page, "Sort", "Reverse order");
  expect(await tileLabels(page)).toEqual(["A1", "A4", "A3", "A2", ...A(5, 12)]);
  await undoButton(page).click();
  await organizeMenu(page, "Select", "Select none");
  await tileMain(page, "A1").click();
  await expect(page.getByTestId("selection-count")).toHaveText("1 selected");
  await tileMain(page, "A3").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("selection-count")).toHaveText("2 selected");
  await tileMain(page, "A5").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("selection-count")).toHaveText("3 selected");
  await organizeMenu(page, "Sort", "Reverse order");
  expect(await tileLabels(page)).toEqual(["A5", "A2", "A3", "A4", "A1", ...A(6, 12)]);
});

test("AC-496: Keep only twelve.pdf leaves A1–A12; the notice's Undo brings B1–B3 back at the end", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await organizeMenu(page, "Remove", "Keep only twelve.pdf");
  expect(await tileLabels(page)).toEqual(A(1, 12));
  await page.getByTestId("notice").filter({ hasText: "Removed 3 pages." }).getByRole("button", { name: "Undo" }).click();
  expect(await tileLabels(page)).toEqual([...A(1, 12), "B1", "B2", "B3"]);
});

test("AC-497: Remove all returns to the empty state with Undo, which restores all 15 in order", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await organizeMenu(page, "Remove", "Remove all");
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("drop-card").getByRole("button", { name: "Choose files" })).toBeFocused();
  await page.getByTestId("notice").filter({ hasText: "Removed 15 pages." }).getByRole("button", { name: "Undo" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  expect(await tileLabels(page)).toEqual([...A(1, 12), "B1", "B2", "B3"]);
});

test("AC-498: Add pages from a loaded file marks pages in use; the picked page goes to the end", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await tileMain(page, "A5").focus();
  await page.keyboard.press("Delete");
  expect(await tileLabels(page)).not.toContain("A5");
  const wide = (page.viewportSize()?.width ?? 1280) >= 1024;
  await page.getByRole("button", { name: wide ? "Add pages" : "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "From a loaded file: twelve.pdf" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("picker-tile")).toHaveCount(12);
  const inUse = await dialog.getByTestId("picker-tile").evaluateAll((els) => els.map((e) => e.hasAttribute("data-in-use")));
  expect(inUse).toEqual(Array.from({ length: 12 }, (_, i) => i !== 4));
  await expect(dialog.getByTestId("picker-tile").nth(0)).toHaveAccessibleName(/in use$/);
  await dialog.getByTestId("picker-tile").nth(4).click();
  await dialog.getByTestId("picker-confirm").click();
  expect((await tileLabels(page)).at(-1)).toBe("A5");
  const out = await runAndDownload(page);
  const texts = await words(out.bytes);
  expect(texts).toHaveLength(15);
  expect(texts.at(-1)).toBe("Twelve 5");
});

test("AC-499: no edits gives twelve_organized.pdf, 15 pages, Rotate 0, not encrypted", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  const out = await runAndDownload(page);
  expect(out.name).toBe("twelve_organized.pdf");
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual(Array(15).fill(0));
  expect(await words(out.bytes)).toEqual([...Array.from({ length: 12 }, (_, i) => `Twelve ${i + 1}`), "Page 1", "Page 2", "Page 3"]);
});

test("AC-500: bookmarks follow a move of A12 to the front", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await tileAction(page, "A12", "Move to position…");
  await page.getByRole("dialog").getByRole("spinbutton").or(page.getByRole("dialog").getByRole("textbox")).first().fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Move", exact: true }).click();
  expect((await tileLabels(page))[0]).toBe("A12");
  const out = await runAndDownload(page);
  const marks = await outlineOf(out.bytes);
  expect(marks.map((m) => [m.title, m.page])).toEqual([
    ["Intro", 2],
    ["Middle", 6],
    ["End", 11],
  ]);
  expect(marks[1].children.map((m) => [m.title, m.page])).toEqual([["Detail", 7]]);
});

test("AC-501: one file shows the view toggle; the files view shows one card with 12 pages", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await expect(page.getByRole("radio", { name: "Files" })).toBeVisible();
  await showFiles(page);
  await expect(page.getByTestId("file-card")).toHaveCount(1);
  await expect(page.getByTestId("file-meta")).toHaveText(["12 pages"]);
});

// Open decision for the lead: the files view joins every run of one file's pages into one card
// (lib/page-list segmentsOf, F3 §3 "maximal runs ... from the same source"), so A12 moved in front of
// A1–A11 stays one card. Splitting where the page order goes backwards changes segmentsOf, which
// merge.ts also uses for contents entries and double-sided padding. Not changed in this build.
test.fixme("AC-501: after moving A12 to the front the files view shows 2 cards (page 12; pages 1–11)", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await tileAction(page, "A12", "Move to position…");
  await page.getByRole("dialog").getByRole("spinbutton").or(page.getByRole("dialog").getByRole("textbox")).first().fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Move", exact: true }).click();
  await showFiles(page);
  await expect(page.getByTestId("file-card")).toHaveCount(2);
  await expect(page.getByTestId("file-meta")).toHaveText(["Page 12 of 12", "Pages 1–11 of 12"]);
});

test("AC-502: an image and a PDF give 13 tiles and 13 pages, the first holding the image", async ({ page }) => {
  await pickF5(page, "charlie.png", "twelve.pdf");
  expect(await tileLabels(page)).toEqual(["A1", ...Array.from({ length: 12 }, (_, i) => `B${i + 1}`)]);
  const out = await runAndDownload(page);
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getPageCount()).toBe(13);
  expect((await words(out.bytes))[0]).toBe("blank"); // an image page has no text
  expect((await words(out.bytes))[1]).toBe("Twelve 1");
});

test("AC-546: odd and even positions; rotating the even ones gives /Rotate 90 on output pages 2, 4 … 14", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await organizeMenu(page, "Select", /^Odd positions/);
  expect(await selectedLabels(page)).toEqual(["A1", "A3", "A5", "A7", "A9", "A11", "B1", "B3"]);
  await organizeMenu(page, "Select", /^Even positions/);
  expect(await selectedLabels(page)).toEqual(["A2", "A4", "A6", "A8", "A10", "A12", "B2"]);
  await page.getByRole("button", { name: "Rotate selected pages right" }).click();
  const out = await runAndDownload(page);
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual(Array.from({ length: 15 }, (_, i) => (i % 2 === 1 ? 90 : 0)));
});

test("AC-547: two-sided scan order fixes a fronts-then-backs scan; Undo restores the scan order", async ({ page }) => {
  await pickF5(page, "duplex-scan.pdf");
  await organizeMenu(page, "Sort", "Two-sided scan order");
  expect(await tileLabels(page)).toEqual(["A1", "A6", "A2", "A5", "A3", "A4"]);
  await undoButton(page).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
  await redoButton(page).click();
  const out = await runAndDownload(page);
  expect(await words(out.bytes)).toEqual(["Front 1", "Back 1", "Front 2", "Back 2", "Front 3", "Back 3"]);
});

test("AC-548: an odd count ends with a front; a selection reorders only its positions", async ({ page }) => {
  await pickF5(page, "duplex-scan-odd.pdf");
  await organizeMenu(page, "Sort", "Two-sided scan order");
  const out = await runAndDownload(page);
  expect(await words(out.bytes)).toEqual(["Front 1", "Back 1", "Front 2", "Back 2", "Front 3"]);

  await open(page, "organize-pdf");
  await pickF5(page, "twelve.pdf", "duplex-scan.pdf");
  await tileMain(page, "B1").click();
  await tileMain(page, "B6").click({ modifiers: ["Shift"] });
  await organizeMenu(page, "Sort", "Two-sided scan order");
  expect(await tileLabels(page)).toEqual([...A(1, 12), "B1", "B6", "B2", "B5", "B3", "B4"]);
});

test("Two-sided scan order has its tooltip as the item's description", async ({ page }) => {
  await pickF5(page, "duplex-scan.pdf");
  const wide = (page.viewportSize()?.width ?? 1280) >= 768;
  await page.getByRole("button", { name: wide ? "Sort" : "Page tools", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Two-sided scan order" })).toHaveAccessibleDescription("For a scan of all fronts, then all backs in reverse");
  await page.keyboard.press("Escape");
});

test("AC-549: six edits undone one by one with Ctrl/Cmd+Z, redone with Ctrl/Cmd+Shift+Z; a new edit clears redo", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  const states: string[][] = [await tileLabels(page)];
  const rotations = async () => page.getByTestId("page-tile").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-rotation")) % 360));
  const rots: number[][] = [await rotations()];
  const snap = async () => {
    states.push(await tileLabels(page));
    rots.push(await rotations());
  };
  // 1 move A12 to the front (keyboard)
  await tileMain(page, "A12").focus();
  await page.keyboard.press("Alt+Home");
  await snap();
  // 2 rotate A1 right
  await tile(page, "A1").hover();
  await page.getByRole("button", { name: "Rotate A1 right" }).click();
  await snap();
  // 3 duplicate A2
  await tileAction(page, "A2", "Duplicate");
  await snap();
  // 4 blank page after A3
  await tileAction(page, "A3", "Blank page after");
  await snap();
  // 5 remove A5
  await tileMain(page, "A5").focus();
  await page.keyboard.press("Delete");
  await snap();
  // 6 reverse
  await organizeMenu(page, "Sort", "Reverse order");
  await snap();
  const after = states[6];

  for (let i = 5; i >= 0; i--) {
    await page.keyboard.press("ControlOrMeta+z");
    expect(await tileLabels(page)).toEqual(states[i]);
    expect(await rotations()).toEqual(rots[i]);
  }
  // Adding the file is the one step left (AC-550).
  await expect(undoButton(page)).not.toHaveAttribute("aria-disabled", "true");
  for (let i = 1; i <= 6; i++) {
    await page.keyboard.press(i % 2 ? "ControlOrMeta+Shift+z" : "Control+y");
    expect(await tileLabels(page)).toEqual(states[i]);
    expect(await rotations()).toEqual(rots[i]);
  }
  expect(await tileLabels(page)).toEqual(after);
  await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");
  // A new edit after an undo clears the redo steps.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(redoButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await tile(page, "A4").hover();
  await page.getByRole("button", { name: "Rotate A4 right" }).click();
  await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await tileLabels(page)).toEqual(states[5]);
});

test("AC-549: Ctrl/Cmd+Z in the move-to-position field edits the text, not the page list", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await tileMain(page, "A12").focus();
  await page.keyboard.press("Alt+Home");
  const before = await tileLabels(page);
  await tileAction(page, "A3", "Move to position…");
  const field = page.getByRole("dialog").getByRole("spinbutton").or(page.getByRole("dialog").getByRole("textbox")).first();
  await field.fill("7");
  await field.press("ControlOrMeta+z");
  expect(await tileLabels(page)).toEqual(before);
  await page.keyboard.press("Escape");
  expect(await tileLabels(page)).toEqual(before);
});

test("AC-550: Undo│Redo in the bar: disabled states, announced steps, survive the view switch and Back to options; Start over clears", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  // Adding files is a step.
  await expect(undoButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("group", { name: "History" })).toBeVisible();
  await tile(page, "A1").hover();
  await page.getByRole("button", { name: "Rotate A1 right" }).click();
  await undoButton(page).click();
  await expect(live(page)).toHaveText(/Undone: rotate/);
  await expect(undoButton(page)).toBeFocused();
  await redoButton(page).click();
  await expect(live(page)).toHaveText(/Redone: rotate/);
  await showFiles(page);
  await showPages(page);
  await undoButton(page).click();
  expect(await quarterTurns(page, "A1")).toBe(0);
  await redoButton(page).click();
  await run(page);
  await page.getByRole("button", { name: "Back to options" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await undoButton(page).click();
  expect(await quarterTurns(page, "A1")).toBe(0);
  await run(page);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await pickF5(page, "twelve.pdf");
  // Only the new "add files" step is there.
  await undoButton(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("history")).toBeVisible();
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
});

test("AC-550: history keeps at least 50 steps", async ({ page }) => {
  await pickF5(page, "twelve.pdf");
  await tileMain(page, "A1").focus();
  for (let i = 0; i < 60; i++) await page.keyboard.press("]");
  for (let i = 0; i < 55; i++) await page.keyboard.press("ControlOrMeta+z");
  await expect(undoButton(page)).not.toHaveAttribute("aria-disabled", "true");
  expect(await quarterTurns(page, "A1")).toBe(1); // 60 - 55 = 5 quarter turns
});

test("AC-482: sixty-pages.pdf loads without a limit message and gives 60 pages", async ({ page }) => {
  await pickF5(page, "sixty-pages.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(60);
  // (Next's route announcer is an empty role=alert: only a message with text counts.)
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByTestId("notice")).toHaveCount(0);
  const out = await runAndDownload(page);
  expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(60);
});

test("F3 drag still works on Organize (B1 between A1 and A2)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 640, "mouse drag on desktop");
  // Few pages, so both tiles are on screen at once.
  await pickF5(page, "three-pages.pdf", "short.pdf");
  await dragTo(page, '[data-uid]:has([data-testid=tile-label]:text-is("B1")) [data-tile-box]', '[data-uid]:has([data-testid=tile-label]:text-is("A2")) [data-tile-box]', "before");
  expect((await tileLabels(page)).slice(0, 3)).toEqual(["A1", "B1", "A2"]);
  await undoButton(page).click();
  expect((await tileLabels(page)).slice(0, 3)).toEqual(["A1", "A2", "A3"]);
});

test("one-row toolbar and no sideways scroll at every width (P-3)", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  for (const width of [320, 360, 390, 640, 768, 1023, 1024, 1280, 1366]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator("[data-testid=pages-scroll]")).toBeVisible();
    expect(await toolbarOverflow(page), `controls outside the tools row at ${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `overflow at ${width}`).toBe(0);
    const narrow = width < 768;
    await expect(page.getByRole("button", { name: "Page tools", exact: true })).toBeVisible({ visible: narrow });
    await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible({ visible: !narrow });
    const addVisible = await page.getByTestId("add-menu").isVisible();
    expect(addVisible, `one Add menu below 1024 at ${width}`).toBe(width < 1024);
  }
});

test("the selection bar sits above the bottom bar (P-3 bug fix) at 1366x657", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 657 });
  await pickF5(page, "twelve.pdf");
  await tileMain(page, "A1").click();
  const bar = (await page.getByTestId("selection-bar").boundingBox())!;
  const dock = (await page.locator("[data-ip-dock]").boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(dock.y);
});

test("AC-481: owner-restricted.pdf loads with no prompt and gives 3 pages that open without a password", async ({ page }) => {
  await pickF5(page, "owner-restricted.pdf");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const out = await runAndDownload(page);
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(3);
});
