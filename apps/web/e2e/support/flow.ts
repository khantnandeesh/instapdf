/**
 * Shared helpers for the F1 shared-flow e2e suite (Rotate as the vehicle tool).
 * Every assertion about output reads the downloaded file with libraries that
 * are independent of the app: upstream pdf-lib (cannot decrypt, so loading
 * proves "no password") and pdf.js (text).
 */
import { readFile } from "node:fs/promises";
import { expect, type Download, type Locator, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

export const fx = (name: string) => `tests/fixtures/${name}`;

/**
 * The files that bring a tool to its loaded state, for the guards that visit every tool: `pdf` for most,
 * a second file where the tool needs two, pictures where it takes only images.
 */
export function toolFixtures(slug: string, pdf = "sixty-pages.pdf"): string[] {
  // Enough pictures to overflow the pages area, like the 60-page PDF does.
  if (slug === "jpg-to-pdf") return Array.from({ length: 30 }, (_, i) => fx(["delta.jpg", "charlie.png", "fox.tiff"][i % 3]));
  // Unlock needs a protected file, or its run ends in "nothing to remove".
  if (slug === "unlock-pdf") return [fx(pdf), fx("owner-restricted.pdf")];
  // Extract images needs a file that has images, or its run ends in "none found".
  if (slug === "extract-images") return [fx(pdf), fx("with-images.pdf")];
  // Split by bookmarks needs a file with bookmarks, or the button waits with "no bookmarks".
  if (slug === "split-pdf-by-bookmarks") return [fx(pdf), fx("bookmarks.pdf")];
  // Remove annotations needs a file that has some, or its run ends in "nothing to remove".
  if (slug === "remove-pdf-annotations") return [fx(pdf), fx("annotated.pdf")];
  // Split by text needs a file whose text changes from page to page.
  if (slug === "split-pdf-by-text") return [fx(pdf), fx("invoices.pdf")];
  // Deskew needs a file with tilted pages, or the button waits with "every page is straight".
  if (slug === "deskew-pdf") return [fx(pdf), fx("tilted.pdf")];
  // OCR needs pages that are pictures of text, or its run ends in "nothing was changed"; its long file is
  // typed, since a page that holds only its number is read again (rightly), and sixty of those take a while.
  if (slug === "ocr-pdf") return [fx(pdf === "sixty-pages.pdf" ? "typed-sixty.pdf" : pdf), fx("scan.pdf")];
  // Rename: the first file has text where the box starts, so the name shown changes.
  if (slug === "rename-pdf") return [fx("invoices.pdf"), fx(pdf)];
  return slug === "alternate-mix-pdf" ? [fx(pdf), fx("three-pages.pdf")] : [fx(pdf)];
}

/**
 * F23: true when the server under test was built with cloud sources on (NEXT_PUBLIC_CLOUD_SOURCES=1,
 * the CI "cloud" job). A few F1/F3 checks of the original menus branch on it.
 */
export const cloudOn = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1";

export const flow = (page: Page) => page.getByTestId("tool-flow");
export const primary = (page: Page) => page.getByTestId("primary-action");
export const tiles = (page: Page) => page.getByTestId("page-tile");
export const fileInput = (page: Page) => page.getByTestId("file-input");
export const dialog = (page: Page) => page.getByRole("dialog");
export const passwordField = (page: Page) => dialog(page).getByLabel("Password", { exact: true });
export const rotateRight = (page: Page) => page.getByRole("button", { name: "Rotate right", exact: true });
export const rotateLeft = (page: Page) => page.getByRole("button", { name: "Rotate left", exact: true });
export const scope = (page: Page, which: "All" | "Odd" | "Even") => page.getByRole("radio", { name: new RegExp(`^${which}( pages)?$`) });
export const downloadLink = (page: Page) => page.getByRole("link", { name: "Download" });

/** Opens /rotate-pdf and waits until drop/paste/hand-off listeners are live. */
export async function openRotate(page: Page) {
  await page.goto("/rotate-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

export async function pick(page: Page, ...names: string[]) {
  await fileInput(page).setInputFiles(names.map((n) => (n.includes("/") ? n : fx(n))));
}

/** Picks files and waits for the ready state. */
export async function pickReady(page: Page, ...names: string[]) {
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}

/** Builds File objects in the page from fixture bytes and dispatches drag events with them. */
export async function dropFixtures(page: Page, names: string[], events: ("dragenter" | "dragover" | "dragleave" | "drop")[] = ["dragenter", "dragover", "drop"]) {
  const payload = await Promise.all(names.map(async (n) => ({ name: n, b64: (await readFile(fx(n))).toString("base64") })));
  await page.evaluate(
    ({ payload, events }) => {
      const dt = new DataTransfer();
      for (const f of payload) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: "application/pdf" }));
      for (const type of events) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { payload, events },
  );
}

/** Runs the primary action and waits for the result screen. */
export async function run(page: Page) {
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  // data-state flips to "done" a render before the result exists: ResultCard is a lazy chunk, so
  // the first "done" commit shows nothing. Wait for the card itself, so a check that runs next
  // (e.g. axe after settled()) sees its entrance animation instead of an empty flow.
  await expect(page.getByTestId("result")).toBeVisible();
}

export async function bytesOf(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}

/** Clicks Download on the result screen and returns the file name and bytes. */
export async function downloadResult(page: Page) {
  // The link gets its blob href in an effect after the result renders; a click before that goes nowhere.
  await expect(downloadLink(page)).toHaveAttribute("href", /^blob:/);
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink(page).click()]);
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) };
}

/** Throws if the PDF is encrypted (upstream pdf-lib refuses encrypted files). */
export async function loadPlain(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  expect(doc.isEncrypted, "output must not be encrypted").toBe(false);
  expect(doc.context.trailerInfo.Encrypt, "output trailer must have no /Encrypt").toBeUndefined();
  return doc;
}

export async function rotationsOf(bytes: Uint8Array) {
  const doc = await loadPlain(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}

export async function pageCountOf(bytes: Uint8Array) {
  return (await loadPlain(bytes)).getPageCount();
}

/** Extracted text per page, with pdf.js (legacy build for Node). */
export async function textsOf(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  await task.destroy();
  return out;
}

export function unzip(bytes: Uint8Array) {
  return unzipSync(bytes);
}

export async function fixtureBytes(name: string) {
  return new Uint8Array(await readFile(fx(name)));
}

/** Presses Tab until `target` has focus (proves it is reachable by keyboard). */
export async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

export const isDesktop = (projectName: string) => projectName === "desktop";

/** "Back to editing" on the result screen, then waits for the ready state. */
export async function backToOptions(page: Page) {
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}

/** "Start over" on the result screen, then waits for the empty state. */
export async function startOver(page: Page) {
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
}

/**
 * A Merge file card's action. Below 1024 px a card shows only the buttons that fit in the row under its
 * page and folds the rest into its More menu (berrypdf.md "Page tiles" PT-1 rule 6), so: the card's own
 * button when it shows one, else the More menu item; Enlarge falls back to a tap on the page, which opens
 * the same preview. Returns the control that had focus, for focus-return checks.
 */
export async function cardAction(page: Page, file: string, action: "Remove" | "Enlarge" | "Rotate left" | "Rotate right"): Promise<Locator> {
  const name = action === "Remove" || action === "Enlarge" ? `${action} ${file}` : `Rotate ${file} ${action === "Rotate left" ? "left" : "right"}`;
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) {
    await button.click();
    return button;
  }
  const card = page.getByTestId("file-card").filter({ has: page.getByTestId("file-name").getByText(file, { exact: true }) });
  if (action === "Enlarge") {
    const main = card.getByTestId("card-main");
    await main.click();
    return main;
  }
  const more = card.getByTestId("card-more");
  await more.click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
  return more;
}

/**
 * Gives a tool whose primary waits for a choice what it needs, for the guards that run every tool:
 * Protect a password; Split by text and Rename a text area; Bookmarks a new bookmark; Extract and Delete the first toggle tile (spec F4/F5 UI decision 12). Other
 * tools run as loaded, some a moment after the file is in. Header and footer gets a line of text.
 */
export async function makeRunnable(page: Page) {
  if (await primary(page).isEnabled()) return;
  const password = page.locator("#protect-open");
  const tile = page.locator("[data-tile-button][aria-pressed]").first();
  // Split by text, and Rename (one button in the bar, one in the side panel; the shown one).
  const area = page.locator('[data-testid="choose-area"], [data-testid^="rename-area-"]').locator("visible=true").first();
  // Header and footer: one of its six lines (the panel's field from 1024 px, the bar's below).
  const header = page.locator("#hf-top-center-side, #hf-top-center-bar").locator("visible=true");
  // Bookmarks: one new bookmark (the button is in the bar or the side panel; the shown one).
  const bookmarks = page.locator('[data-testid^="bm-edit-"]').locator("visible=true").first();
  if (await bookmarks.isVisible()) {
    await expect(bookmarks).toBeEnabled();
    await bookmarks.click();
    const box = page.getByRole("dialog");
    await box.getByTestId("bm-add").click();
    await box.getByRole("textbox", { name: /^Name of bookmark/ }).last().fill("Start");
    await box.getByRole("button", { name: "Done", exact: true }).click();
  } else if (await password.count()) await password.fill("correct horse battery");
  else if (await area.isVisible()) {
    // Split by text: the box starts over the top left of the page, where the fixture's text is.
    await area.click();
    await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  }
  else if (await header.count()) await header.first().fill("Page {n}");
  else if (await tile.count()) await tile.click();
  // Otherwise the tool is still reading the file (Split by bookmarks reads the outline): it enables itself.
  await expect(primary(page)).toBeEnabled();
}
