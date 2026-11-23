import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

// Builder smoke tests for the F1 shared flow on Rotate. The QA suite covers every AC.
const fx = (name: string) => `tests/fixtures/${name}`;

async function rotationsOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}
async function bytesOf(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}
async function pick(page: Page, ...names: string[]) {
  await page.locator('[data-testid="file-input"]').setInputFiles(names.map(fx));
}
const flow = (page: Page) => page.getByTestId("tool-flow");
const primary = (page: Page) => page.getByTestId("primary-action");

test.beforeEach(async ({ page }) => {
  await page.goto("/rotate-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
});

test("empty state: one picker accepting PDFs, primary disabled (AC-1, AC-38)", async ({ page }) => {
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  const input = page.locator('[data-testid="file-input"]');
  await expect(input).toHaveAttribute("accept", /\.pdf/);
  await expect(input).toHaveAttribute("multiple", "");
  await expect(page.getByRole("button", { name: "Choose PDF files" })).toBeVisible();
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByTestId("page-tile")).toHaveCount(0);
});

test("pick, rotate right, run and download (AC-2, AC-30, AC-41, AC-54, AC-57)", async ({ page }) => {
  await pick(page, "three-pages.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await expect(page.getByTestId("page-tile").first()).toHaveAttribute("data-rotation", "90");
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("privacy-result")).toBeVisible();
  const preview = page.locator('[data-testid="result-preview"]');
  await expect(preview).toBeVisible();
  const box = await preview.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(box.w).toBeGreaterThan(box.h);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("three-pages.pdf");
  expect(await rotationsOf(await bytesOf(download))).toEqual([90, 90, 90]);
});

test("drop a file anywhere on the page (AC-3)", async ({ page }) => {
  const data = (await readFile(fx("three-pages.pdf"))).toString("base64");
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "three-pages.pdf", { type: "application/pdf" }));
    document.body.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, data);
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
});

test("wrong type and corrupt files show errors and stay empty (AC-12, AC-13, AC-15)", async ({ page }) => {
  await pick(page, "notes.txt");
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await pick(page, "corrupt.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "corrupt.pdf" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(primary(page)).toBeDisabled();
  await pick(page, "notes.txt", "three-pages.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
});

test("user password: wrong, then right, output unencrypted (AC-20..AC-23, AC-29)", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("user-pw.pdf");
  const input = dialog.getByLabel("Password", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("nope");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("password-error")).toContainText("didn't work");
  await expect(page.getByTestId("page-tile")).toHaveCount(0);
  await input.fill("test");
  await input.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await primary(page).click();
  await expect(page.getByText("This copy has no password")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(await rotationsOf(await bytesOf(download))).toEqual([90, 90, 90]);
});

test("apply one password to both locked files (AC-26)", async ({ page }) => {
  await pick(page, "user-pw.pdf", "user-pw-2.pdf");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password", { exact: true }).fill("test");
  await dialog.getByLabel("Try this password on the other locked files").check();
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});

test("owner-restricted loads without a prompt (AC-28)", async ({ page }) => {
  await pick(page, "owner-restricted.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await primary(page).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(await rotationsOf(await bytesOf(download))).toEqual([90, 90, 90]);
});

test("two files give a ZIP and the files view shows two cards (AC-7, AC-42)", async ({ page }) => {
  await pick(page, "three-pages.pdf", "sixty-pages.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.getByRole("radio", { name: "Files" }).click();
  await expect(page.getByTestId("file-card")).toHaveCount(2);
  await expect(page.getByTestId("file-meta").first()).toContainText("3 pages");
  await expect(page.getByTestId("file-meta").nth(1)).toContainText("60 pages");
  // AC-49: nothing widens the page, so the fixed dock stays on screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(primary(page)).toBeInViewport();
  await primary(page).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("instapdf-rotate.zip");
  const files = unzipSync(await bytesOf(download));
  expect(Object.keys(files)).toEqual(["three-pages.pdf", "sixty-pages.pdf"]);
});

test("continue with Rotate, then start over (AC-43, AC-44)", async ({ page }) => {
  await pick(page, "three-pages.pdf");
  await page.getByRole("button", { name: "Rotate right" }).click();
  await primary(page).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await primary(page).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(await rotationsOf(await bytesOf(download))).toEqual([180, 180, 180]);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("page-tile")).toHaveCount(0);
});

test("lazy thumbnails: primary enabled before all 60 render (AC-52, AC-53)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop viewport only");
  await page.setViewportSize({ width: 1280, height: 800 });
  await pick(page, "sixty-pages.pdf");
  await expect(primary(page)).toBeEnabled();
  expect(await page.locator('[data-testid="page-tile"] canvas').count()).toBeLessThanOrEqual(30);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByTestId("page-tile").last().scrollIntoViewIfNeeded();
  await expect(page.getByTestId("page-tile").last().locator("canvas")).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId("page-tile").last()).toHaveAttribute("data-rotation", "90");
});

test("two prompts in turn without apply-to-all; Escape skips (AC-25, AC-27)", async ({ page }) => {
  await pick(page, "user-pw.pdf", "user-pw-2.pdf");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("user-pw.pdf is locked");
  await expect(dialog).toContainText("Locked file 1 of 2");
  await dialog.getByLabel("Password", { exact: true }).fill("test");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toContainText("user-pw-2.pdf is locked");
  await expect(dialog).toContainText("Locked file 2 of 2");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
});

test("keyboard only: pick, rotate, run, download (AC-48)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "keyboard path checked on desktop");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF files" }).focus();
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.getByRole("button", { name: "Rotate right" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); // Reset
  await page.keyboard.press("Tab"); // primary
  await expect(primary(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Download" })).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(await rotationsOf(await bytesOf(download))).toEqual([90, 90, 90]);
});

test("no serious axe violations in the main states (AC-50)", async ({ page }) => {
  const check = async (state: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => `${state}: ${v.id} ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
  };
  await check("empty");
  await pick(page, "user-pw.pdf");
  await expect(page.getByRole("dialog")).toBeVisible();
  await check("password");
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill("test");
  await page.keyboard.press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await check("ready");
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  await check("result");
});

test("limits: 1,001 pages, 21 files and over 100 MB are rejected (AC-16, AC-17, AC-18)", async ({ page }) => {
  await pick(page, "too-many-pages.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "1,000 pages" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await pick(page, ...Array(21).fill("three-pages.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: "up to 20 files" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.getByRole("radio", { name: "Files" }).click();
  await expect(page.getByTestId("file-card")).toHaveCount(20);
  const started = Date.now();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(100 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, cancelable: true }));
  });
  await expect(page.getByRole("alert").filter({ hasText: "huge.pdf is larger than 100 MB" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000 + 1500);
});

test("back to options keeps files and pending rotation (AC-45)", async ({ page }) => {
  await pick(page, "three-pages.pdf");
  await page.getByRole("button", { name: "Rotate right" }).click();
  await primary(page).click();
  await page.getByRole("button", { name: "Back to options" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("page-tile").first()).toHaveAttribute("data-rotation", "90");
});

test("paste a PDF; plain text does nothing (AC-55)", async ({ page }) => {
  const data = (await readFile(fx("three-pages.pdf"))).toString("base64");
  const alertsBefore = await page.getByRole("alert").count(); // Next.js has its own route announcer
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "hello");
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  await page.waitForTimeout(300);
  await expect(page.getByRole("alert")).toHaveCount(alertsBefore);
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "three-pages.pdf", { type: "application/pdf" }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, data);
  await expect(page.getByTestId("page-tile")).toHaveCount(3);
});

test("share uses the output file when supported (AC-56)", async ({ page }) => {
  await page.addInitScript(() => {
    const nav = navigator as Navigator & { __shared?: File[] };
    nav.canShare = () => true;
    nav.share = async (d?: ShareData) => {
      nav.__shared = d?.files;
    };
  });
  await page.goto("/rotate-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, "three-pages.pdf");
  await primary(page).click();
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => (navigator as Navigator & { __shared?: File[] }).__shared?.map((f) => [f.name, f.type]));
  expect(shared).toEqual([["three-pages.pdf", "application/pdf"]]);
});

// Needs a build made with NEXT_PUBLIC_E2E_HOOKS=1 (the hook is compiled out otherwise).
test("processing error offers retry that keeps files and options (AC-46)", async ({ page }) => {
  test.skip(process.env.E2E_HOOKS !== "1", "needs a build with NEXT_PUBLIC_E2E_HOOKS=1");
  await pick(page, "three-pages.pdf");
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.evaluate(() => ((window as unknown as { __INSTAPDF_FAULT__: number }).__INSTAPDF_FAULT__ = 1));
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "error");
  await expect(page.getByRole("button", { name: "Try again" })).toBeFocused();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(await rotationsOf(await bytesOf(download))).toEqual([90, 90, 90]);
});
