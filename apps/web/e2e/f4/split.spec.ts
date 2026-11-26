/** F4 Split (`/split-pdf`): spec docs/specs/f4-f5-page-tools.md §3b, §6a, AC-420 to AC-439, AC-545. */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import {
  closeMore,
  currentSplitMode,
  field,
  fieldError,
  fx,
  isDesktop,
  leftOutPages,
  loadPlain,
  mark,
  openMore,
  openReady,
  openTool,
  outlineOf,
  pageCountOf,
  primary,
  runDownload,
  splitMode,
  status,
  stepper,
  textsOf,
  tileButton,
  typeRange,
} from "./support";

const twelve = (n: number) => `Twelve ${n}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test.beforeEach(async ({ page }) => {
  // Remembered options must not leak between tests.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("f4-keep")) localStorage.removeItem("berrypdf:split-pdf-options");
  });
});

test("AC-401, AC-420, AC-545: Every page shows 12 parts at once; the run gives twelve-split.zip with twelve-1 … twelve-12", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(12);
  expect(await currentSplitMode(page)).toBe("Every page");
  await expect(status(page)).toContainText("12 files");
  await expect(primary(page)).toHaveText("Split into 12 files");
  await expect(primary(page)).toHaveAccessibleName("Split into 12 files");
  await expect(page.getByTestId("part-disc")).toHaveCount(12);
  await expect(page.getByTestId("cut-line")).toHaveCount(11);
  await openMore(page);
  await expect(page.getByTestId("part-row")).toHaveCount(12);
  await closeMore(page);
  const out = await runDownload(page);
  expect(out.name).toBe("twelve-split.zip");
  expect(out.entries!.map(([n]) => n)).toEqual(range(1, 12).map((n) => `twelve-${n}.pdf`));
  for (const [i, [, bytes]] of out.entries!.entries()) expect(await textsOf(bytes)).toEqual([twelve(i + 1)]);
});

test("AC-421, AC-545: Every N pages starts at 2 (6 parts); N = 5 gives 1-5, 6-10, 11-12", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Every N pages");
  await expect(stepper(page)).toHaveValue("2");
  await expect(primary(page)).toHaveText("Split into 6 files");
  await stepper(page).fill("5");
  await expect(primary(page)).toHaveText("Split into 3 files");
  const out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve-1-5.pdf", "twelve-6-10.pdf", "twelve-11-12.pdf"]);
  expect(await textsOf(out.entries![0][1])).toEqual(range(1, 5).map(twelve));
  expect(await textsOf(out.entries![1][1])).toEqual(range(6, 10).map(twelve));
  expect(await textsOf(out.entries![2][1])).toEqual([twelve(11), twelve(12)]);
});

test("AC-422, AC-545: a bad N shows an inline error and disables the run; N = 12 or 20 is one part", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Every N pages");
  for (const bad of ["0", "-1", "2.5", "x", ""]) {
    await stepper(page).fill(bad);
    await expect(fieldError(page), bad).toHaveText("Use a whole number from 1");
    await expect(stepper(page)).toHaveAttribute("aria-invalid", "true");
    await expect(primary(page)).toBeDisabled();
    await expect(primary(page), "no count while invalid").toHaveText("Split PDF");
  }
  for (const n of ["12", "20"]) {
    await stepper(page).fill(n);
    await expect(fieldError(page)).toHaveCount(0);
    await expect(primary(page)).toHaveText("Split into 1 file");
  }
  // Arrow keys step by 1, PageUp by 10; − stops at 1.
  await stepper(page).fill("3");
  await stepper(page).press("ArrowUp");
  await expect(stepper(page)).toHaveValue("4");
  await stepper(page).press("PageUp");
  await expect(stepper(page)).toHaveValue("14");
  await stepper(page).fill("1");
  await expect(page.getByRole("button", { name: "Fewer pages per file" })).toHaveAttribute("aria-disabled", "true");
});

test("AC-423: Spreads gives 7 parts: 1, 2-3, …, 10-11, 12", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Spreads");
  await expect(primary(page)).toHaveText("Split into 7 files");
  const out = await runDownload(page);
  const counts = await Promise.all(out.entries!.map(([, b]) => pageCountOf(b)));
  expect(counts).toEqual([1, 2, 2, 2, 2, 2, 1]);
  const firsts = await Promise.all(out.entries!.map(async ([, b]) => (await textsOf(b))[0]));
  expect(firsts).toEqual([1, 2, 4, 6, 8, 10, 12].map(twelve));
});

test("AC-424, AC-425, AC-429, AC-433: marks after 4 and 10 make 1-4, 5-10, 11-12; the list matches the ZIP; bookmarks follow", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await expect(primary(page)).toHaveText("Split into 1 file");
  await expect(mark(page, 4)).toHaveAttribute("aria-pressed", "false");
  await mark(page, 4).click();
  await mark(page, 10).click();
  await expect(field(page)).toHaveValue("1-4, 5-10, 11-12");
  await expect(primary(page)).toHaveText("Split into 3 files");
  await expect(tileButton(page, "Page 1, part 1 of 3")).toBeVisible();
  await expect(tileButton(page, "Page 4, part 1 of 3")).toBeVisible();
  await expect(tileButton(page, "Page 5, part 2 of 3")).toBeVisible();
  await expect(tileButton(page, "Page 10, part 2 of 3")).toBeVisible();
  await expect(tileButton(page, "Page 12, part 3 of 3")).toBeVisible();
  // AC-429: the parts list (More options) shows the count and each part's name and range.
  await openMore(page);
  await expect(page.getByRole("heading", { name: /Files\s*3/ })).toBeVisible();
  const rows = await page.getByTestId("part-row").allInnerTexts();
  expect(rows.map((r) => r.replace(/\s+/g, " ").trim())).toEqual(["1 twelve-1-4 .pdf 1-4", "2 twelve-5-10 .pdf 5-10", "3 twelve-11-12 .pdf 11-12"]);
  await closeMore(page);
  const out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve-1-4.pdf", "twelve-5-10.pdf", "twelve-11-12.pdf"]);
  expect(await Promise.all(out.entries!.map(([, b]) => pageCountOf(b)))).toEqual([4, 6, 2]);
  // AC-433
  expect(await outlineOf(out.entries![0][1])).toEqual([{ title: "Intro", page: 1, children: [] }]);
  expect(await outlineOf(out.entries![1][1])).toEqual([
    { title: "Middle", page: 1, children: [{ title: "Detail", page: 2, children: [] }] },
    { title: "End", page: 6, children: [] },
  ]);
  expect(await outlineOf(out.entries![2][1])).toEqual([]);
});

test("AC-425: marks are buttons reached by Tab after the tile's Enlarge; Enter and Space toggle them", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "keyboard flow, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await tileButton(page, "Page 4, part 1 of 1").focus();
  // The roving tab stop follows focus after a render; wait for it before tabbing on.
  await expect(page.getByRole("button", { name: "Enlarge page 4" })).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Enlarge page 4" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(mark(page, 4)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(mark(page, 4)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(mark(page, 10)).toBeFocused();
  await page.keyboard.press(" ");
  await expect(field(page)).toHaveValue("1-4, 5-10, 11-12");
  // Toggling the mark after 4 off joins 1-4 and 5-10.
  await mark(page, 4).click();
  await expect(field(page)).toHaveValue("1-10, 11-12");
  await expect(mark(page, 4)).toHaveAttribute("aria-pressed", "false");
});

test("AC-426: typed 1-3, 8-9, 12 leaves 4-7, 10, 11 out (dashed, no marks); the run gives 3 parts", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await typeRange(page, "1-3, 8-9, 12");
  await expect(primary(page)).toHaveText("Split into 3 files");
  expect(await leftOutPages(page)).toEqual([4, 5, 6, 7, 10, 11]);
  await expect(tileButton(page, "Page 5, not in any part")).toBeVisible();
  await expect(status(page)).toHaveText("6 of 12 pages in 3 files");
  for (const n of [3, 4, 5, 6, 7, 9, 10, 11]) await expect(mark(page, n), `mark after ${n}`).toHaveCount(0);
  const out = await runDownload(page);
  expect(await Promise.all(out.entries!.map(([, b]) => textsOf(b)))).toEqual([range(1, 3).map(twelve), [twelve(8), twelve(9)], [twelve(12)]]);
});

test("AC-427: overlapping 1-4, 3-6 gives two parts that both hold 3 and 4", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await typeRange(page, "1-4, 3-6");
  await expect(primary(page)).toHaveText("Split into 2 files");
  const out = await runDownload(page);
  expect(await textsOf(out.entries![0][1])).toEqual(range(1, 4).map(twelve));
  expect(await textsOf(out.entries![1][1])).toEqual(range(3, 6).map(twelve));
});

test("AC-428: a mark in Every N = 4 switches to Custom with 1-4, 5-6, 7-8, 9-12", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Every N pages");
  await stepper(page).fill("4");
  await expect(primary(page)).toHaveText("Split into 3 files");
  await mark(page, 6).click();
  expect(await currentSplitMode(page)).toBe("Custom");
  await expect(field(page)).toHaveValue("1-4, 5-6, 7-8, 9-12");
  await expect(primary(page)).toHaveText("Split into 4 files");
});

test("AC-430: renaming a part in More options names its entry; a slash becomes a dash", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await typeRange(page, "1-4, 5-10, 11-12");
  await openMore(page);
  await page.getByRole("button", { name: "Rename twelve-1-4.pdf" }).click();
  const input = page.getByRole("textbox", { name: "Rename twelve-1-4.pdf" });
  await input.fill("ignored");
  await input.press("Escape");
  await expect(page.getByTestId("more-options-dialog"), "Escape cancels the rename, not the dialog").toBeVisible();
  await expect(page.getByRole("button", { name: "Rename twelve-1-4.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Rename twelve-1-4.pdf" }).click();
  await input.fill("intro");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Rename intro.pdf" })).toBeVisible();
  await expect(page.getByTestId("more-options")).toHaveAccessibleName("More options, 1 changed");
  await closeMore(page);
  let out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["intro.pdf", "twelve-5-10.pdf", "twelve-11-12.pdf"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await openMore(page);
  await page.getByRole("button", { name: "Rename intro.pdf" }).click();
  await page.getByRole("textbox", { name: "Rename intro.pdf" }).fill("a/b");
  await page.getByRole("textbox", { name: "Rename intro.pdf" }).press("Enter");
  await closeMore(page);
  out = await runDownload(page);
  expect(out.entries![0][0]).toBe("a-b.pdf");
});

test("AC-431, AC-432: the name pattern defaults to {name}-{pages}; {name}_part{n} and {name} with Every N = 4", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Every N pages");
  await stepper(page).fill("4");
  await openMore(page);
  const pattern = page.getByRole("textbox", { name: "Name pattern" });
  await expect(pattern).toHaveValue("{name}-{pages}");
  await pattern.fill("{name}_part{n}");
  await closeMore(page);
  let out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve_part1.pdf", "twelve_part2.pdf", "twelve_part3.pdf"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await openMore(page);
  await page.getByRole("textbox", { name: "Name pattern" }).fill("{name}");
  await closeMore(page);
  out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve.pdf", "twelve (2).pdf", "twelve (3).pdf"]);
});

test("AC-434: with Remove bookmarks on, no part has an outline", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await typeRange(page, "1-4, 5-10, 11-12");
  await openMore(page);
  await page.getByRole("switch", { name: "Remove bookmarks" }).check();
  await closeMore(page);
  const out = await runDownload(page);
  for (const [, b] of out.entries!) expect(await outlineOf(b)).toEqual([]);
});

test("AC-435: Every page on the mixed-sizes file keeps each page's box and /Rotate, as text", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "mixed-sizes-f4.pdf");
  const out = await runDownload(page);
  expect(out.entries).toHaveLength(4);
  const boxes = [];
  for (const [, b] of out.entries!) {
    const p = (await loadPlain(b)).getPage(0);
    const m = p.getMediaBox();
    boxes.push([m.width, m.height, p.getRotation().angle]);
  }
  expect(boxes).toEqual([
    [595, 842, 0],
    [792, 612, 0],
    [420, 595, 0],
    [595, 842, 90],
  ]);
  for (const [i, [, b]] of out.entries!.entries()) {
    expect(await textsOf(b)).toEqual([`Mixed ${i + 1}`]);
    // Copied, not drawn as an image: no image XObject on the page.
    const doc = await PDFDocument.load(b);
    const xobjects = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    expect(xobjects?.keys().length ?? 0).toBe(0);
  }
});

test("AC-436, AC-545: exactly one part (Custom 2-5) downloads a single PDF twelve-2-5.pdf", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await typeRange(page, "2-5");
  await expect(primary(page)).toHaveText("Split into 1 file");
  const out = await runDownload(page);
  expect(out.name).toBe("twelve-2-5.pdf");
  expect(await textsOf(out.bytes)).toEqual(range(2, 5).map(twelve));
});

test("AC-437: two files with Every N = 2 give berrypdf-split.zip with 8 entries in order", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf", "three-pages.pdf");
  await splitMode(page, "Every N pages");
  await expect(primary(page)).toHaveText("Split into 8 files");
  const out = await runDownload(page);
  expect(out.name).toBe("berrypdf-split.zip");
  expect(out.entries!.map(([n]) => n)).toEqual([
    "twelve-1-2.pdf",
    "twelve-3-4.pdf",
    "twelve-5-6.pdf",
    "twelve-7-8.pdf",
    "twelve-9-10.pdf",
    "twelve-11-12.pdf",
    "three-pages-1-2.pdf",
    "three-pages-3.pdf",
  ]);
});

test("AC-438: every part of sixty-pages.pdf is a fraction of the input", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  const input = (await readFile(fx("sixty-pages.pdf"))).length;
  await openReady(page, "split-pdf", "sixty-pages.pdf");
  const out = await runDownload(page);
  expect(out.entries).toHaveLength(60);
  let sum = 0;
  for (const [name, b] of out.entries!) {
    expect(b.length, name).toBeLessThan(input * 0.25);
    sum += b.length;
  }
  expect(sum).toBeLessThanOrEqual(input * 3);
});

test("AC-439: switching modes keeps the file and updates the count (12, 6, 7, 1)", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  const expectCount = async (n: number) => {
    await expect(primary(page)).toHaveText(n === 1 ? "Split into 1 file" : `Split into ${n} files`);
    await expect(page.getByTestId("page-tile")).toHaveCount(12);
  };
  await expectCount(12);
  await splitMode(page, "Every N pages");
  await expectCount(6);
  await splitMode(page, "Spreads");
  await expectCount(7);
  await splitMode(page, "Custom");
  await expectCount(1);
  await splitMode(page, "Every page");
  await expectCount(12);
});

test("AC-403 (Split): bad parts show the error naming the item and disable the run; 2 clears it", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  const cases: [string, string][] = [
    ["abc", "“abc”: not a page number"],
    ["0", "“0”: pages start at 1"],
    ["13", "“13”: this file has 12 pages"],
    ["5-3", "“5-3”: start is after end"],
    ["2-x", "“2-x”: not a page number"],
  ];
  for (const [text, message] of cases) {
    await typeRange(page, text);
    await expect(fieldError(page), text).toHaveText(message);
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(primary(page)).toBeDisabled();
    await expect(primary(page)).toHaveText("Split PDF");
  }
  await typeRange(page, "2");
  await expect(fieldError(page)).toHaveCount(0);
  await expect(field(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(primary(page)).toBeEnabled();
});

test("AC-409 (Split): mode, N, pattern and Remove bookmarks survive a reload; bookmarks start off", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await openMore(page);
  await expect(page.getByRole("switch", { name: "Remove bookmarks" })).not.toBeChecked();
  await closeMore(page);
  await splitMode(page, "Every N pages");
  await stepper(page).fill("3");
  await openMore(page);
  await page.getByRole("textbox", { name: "Name pattern" }).fill("{name}_{n}");
  await page.getByRole("switch", { name: "Remove bookmarks" }).check();
  await closeMore(page);
  await page.evaluate(() => sessionStorage.setItem("f4-keep", "1"));
  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await openReady(page, "split-pdf", "twelve.pdf");
  expect(await currentSplitMode(page)).toBe("Every N pages");
  await expect(stepper(page)).toHaveValue("3");
  await openMore(page);
  await expect(page.getByRole("textbox", { name: "Name pattern" })).toHaveValue("{name}_{n}");
  await expect(page.getByRole("switch", { name: "Remove bookmarks" })).toBeChecked();
  await expect(page.getByTestId("more-options")).toHaveAccessibleName("More options, 2 changed");
});

test("ZIP result: each part downloads on its own from the list, Download comes first", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Every N pages");
  await stepper(page).fill("4");
  await runDownload(page);
  const entries = page.getByTestId("result-entries");
  await expect(entries.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("result")).toContainText("3 files");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download twelve-5-8.pdf" }).click()]);
  expect(dl.suggestedFilename()).toBe("twelve-5-8.pdf");
  const bytes = new Uint8Array(await readFile((await dl.path())!));
  expect(await textsOf(bytes)).toEqual(range(5, 8).map(twelve));
});

test("ZIP result: more than 4 entries show 4 (3 on a phone), then Show all grows the list in place and focuses the first new row", async ({ page }, info) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await runDownload(page);
  const rows = page.getByTestId("result-entries").getByRole("listitem");
  await expect(rows).toHaveCount(isDesktop(info.project.name) ? 4 : 3);
  await page.getByRole("button", { name: "Show all 12" }).click();
  await expect(rows).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Download twelve-12.pdf" })).toBeVisible();
  // Show all removes itself; focus lands on the first row it revealed, not on the page body.
  await expect(page.getByRole("button", { name: isDesktop(info.project.name) ? "Download twelve-5.pdf" : "Download twelve-4.pdf" })).toBeFocused();
});

test("Fit the first screen: at 1366x657 the empty side panel shows More options right under the steps, above the status", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "side panel layout, desktop");
  await page.setViewportSize({ width: 1366, height: 657 });
  await openTool(page, "split-pdf");
  const group = page.getByRole("radiogroup", { name: "Split" });
  const more = (await page.getByTestId("more-options").boundingBox())!;
  const tiles = (await group.getByRole("radio", { name: "Custom" }).boundingBox())!;
  const st = (await status(page).boundingBox())!;
  expect(more.y, "More options follows the step tiles").toBeGreaterThan(tiles.y + tiles.height);
  expect(more.y - (tiles.y + tiles.height), "no empty slot between the steps and More options").toBeLessThan(48);
  expect(more.y + more.height, "More options sits fully above the pinned status").toBeLessThanOrEqual(st.y);
  expect(st.y + st.height, "the footer fits the screen").toBeLessThanOrEqual(657);
  const lines = await group.getByRole("radio", { name: /Every N/ }).evaluate((tile) => {
    // The visible label's text node: one line box means no wrap.
    const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(".sr-only") || !n.textContent?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const node = walker.nextNode()!;
    const r = document.createRange();
    r.selectNodeContents(node);
    return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size;
  });
  expect(lines, "the Every N tile label stays on one line").toBe(1);
});

test("More options on a 320x640 phone: only the parts list scrolls, the sheet body does not", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "phone sheet");
  await page.setViewportSize({ width: 320, height: 640 });
  await openReady(page, "split-pdf", "twelve.pdf");
  await openMore(page);
  // The sheet rises 32px as it opens (dialog.css mp-sheet-in): measure where it comes to rest.
  await page.getByRole("dialog").evaluate((d) => Promise.all(d.getAnimations({ subtree: true }).map((a) => a.finished)));
  const metrics = await page.getByTestId("more-options-dialog").evaluate((d) => {
    const body = d.closest("[data-ip-scroll=overlay]") as HTMLElement;
    const list = d.querySelector("[data-testid=parts-scroller]") as HTMLElement;
    return { body: body.scrollHeight - body.clientHeight, list: list.scrollHeight - list.clientHeight, sheetBottom: body.closest("dialog")!.getBoundingClientRect().bottom };
  });
  expect(metrics.body, "the sheet body never scrolls").toBeLessThanOrEqual(1);
  expect(metrics.list, "twelve parts scroll inside their own list").toBeGreaterThan(0);
  expect(metrics.sheetBottom).toBeLessThanOrEqual(641);
});
