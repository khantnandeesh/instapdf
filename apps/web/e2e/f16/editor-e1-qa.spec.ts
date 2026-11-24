/** F16 E1 (/edit-pdf), part 4: QA findings on PR #25 (owner restrictions, mixed page sizes, unprintable text, encrypted inputs). */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument as Encryptable } from "@cantoo/pdf-lib";
import { PDFDocument, StandardFonts } from "pdf-lib";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
const fixture = (name: string) => `tests/fixtures/${name}`;

async function open(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(file);
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

async function clickPage(page: Page, n: number, fx: number, fy: number) {
  const el = page.getByTestId(`page-${n}`);
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.mouse.click(b.x + b.width * fx, b.y + Math.min(b.height * fy, page.viewportSize()!.height - b.y - 180));
}

async function typeText(page: Page, text: string) {
  await tool(page, "t");
  await clickPage(page, 1, 0.3, 0.3);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type(text);
  await page.getByTestId("text-input").press("Escape");
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return new Uint8Array(await readFile((await dl.path())!));
}

test("QA P1: an owner-restricted file opens read-only, downloads unchanged, and unlocks with the owner password", async ({ page }) => {
  await open(page, fixture("owner-restricted.pdf"));
  const lock = page.getByTestId("owner-lock");
  await expect(lock).toBeVisible();
  await expect(lock).toContainText("owner-restricted.pdf has limited permissions");
  // Tools are locked; a click with Text adds nothing.
  await expect(page.locator('[data-tool="text"]').first()).toHaveAttribute("aria-disabled", "true");
  await tool(page, "t");
  await clickPage(page, 1, 0.3, 0.3);
  await expect(page.getByTestId("text-input")).toHaveCount(0);
  // The download is the file as it came, restrictions and all.
  const original = new Uint8Array(await readFile(fixture("owner-restricted.pdf")));
  expect(Buffer.from(await download(page)).equals(Buffer.from(original))).toBe(true);
  // Owner password: a wrong one says so, the right one unlocks.
  await lock.getByRole("button", { name: "Enter owner password" }).click();
  const dialog = page.getByRole("dialog", { name: /Owner password/ });
  await dialog.getByPlaceholder("Owner password").fill("nope");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toContainText("That isn’t the owner password.");
  await dialog.getByPlaceholder("Owner password").fill("owner123");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(lock).toHaveCount(0);
  await typeText(page, "Now editable");
  await expect(page.getByRole("group", { name: /Now editable/ })).toHaveCount(1);
});

test("review 2 #6: a restricted file opened with its owner password is editable; its open password doesn't unlock it", async ({ page }) => {
  const doc = await Encryptable.create();
  doc.addPage([595, 842]);
  doc.encrypt({ userPassword: "open-me", ownerPassword: "own-me", algorithm: "AES-256", permissions: { printing: true, modifying: false } });
  const file = { name: "both.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save({ useObjectStreams: false })) };
  const pick = async (password: string) => {
    await page.goto("/edit-pdf");
    await page.getByTestId("editor-input").setInputFiles(file);
    await page.getByLabel(/password/i).first().fill(password);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  };
  // Opened with the owner password: nothing is locked.
  await pick("own-me");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.getByTestId("owner-lock")).toHaveCount(0);
  await typeText(page, "Owner edit");
  await expect(page.getByRole("group", { name: /Owner edit/ })).toHaveCount(1);
  // Opened with the open password: locked, and that password isn't taken as the owner's.
  await pick("open-me");
  const lock = page.getByTestId("owner-lock");
  await expect(lock).toBeVisible();
  await lock.getByRole("button", { name: "Enter owner password" }).click();
  const dialog = page.getByRole("dialog", { name: /Owner password/ });
  await dialog.getByPlaceholder("Owner password").fill("open-me");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toContainText("That isn’t the owner password.");
  await dialog.getByPlaceholder("Owner password").fill("own-me");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(lock).toHaveCount(0);
});

/** Two A4 pages with one A1 landscape page between them, and a 3000 pt wide strip at the end. */
async function mixed(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const size of [[595, 842], [2384, 1684], [595, 842], [3000, 400]] as [number, number][]) {
    const p = doc.addPage(size);
    p.drawText(`${size[0]} x ${size[1]}`, { x: 40, y: size[1] - 80, size: 24, font });
  }
  return Buffer.from(await doc.save());
}

test("QA P1 (AC-83): one wide page doesn't shrink the others or scroll sideways", async ({ page }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { name: "mixed.pdf", mimeType: "application/pdf", buffer: await mixed() });
  const vw = page.viewportSize()!.width;
  const canvas = page.getByTestId("canvas");
  const inner = await canvas.evaluate((c) => c.clientWidth);
  const a4 = (await page.getByTestId("page-1").boundingBox())!;
  // The A4 page fills the column (phone) or shows at 100% (desktop), not squeezed by the A1 page.
  if (info.project.name === "mobile") expect(a4.width).toBeGreaterThan(inner * 0.8);
  else expect(a4.width).toBeGreaterThan(700);
  for (const n of [2, 4]) {
    const el = page.getByTestId(`page-${n}`);
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    expect(b.x, `page ${n} left edge`).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width, `page ${n} right edge`).toBeLessThanOrEqual(vw + 1);
    await expect(el, `page ${n} renders`).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  }
  expect(await canvas.evaluate((c) => c.scrollWidth - c.clientWidth)).toBeLessThanOrEqual(1);
});

test("QA P2 (AC-75): Arabic added text is marked as not printable and Download asks first", async ({ page }) => {
  await open(page, corpus("std14-reportlab.pdf"));
  await typeText(page, "مرحبا");
  const note = page.getByTestId("text-missing");
  await expect(note).toBeVisible();
  await expect(note).toContainText("م");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const ask = page.getByRole("dialog", { name: "Some characters won’t print" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Download PDF" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), ask.getByRole("button", { name: "Download anyway" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
});

/** A user-password file that allows editing. */
async function lockedEditable(): Promise<Buffer> {
  const doc = await Encryptable.create();
  doc.addPage([595, 842]);
  doc.encrypt({ userPassword: "test", ownerPassword: "test-owner", algorithm: "AES-256", permissions: { modifying: true, printing: true, copying: true, annotating: true, fillingForms: true, documentAssembly: true, contentAccessibility: true } });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test("QA: an encrypted input says its downloaded copy has no password", async ({ page }) => {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: await lockedEditable() });
  await page.getByLabel(/password/i).first().fill("test");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await expect(page.getByTestId("no-password-note").first()).toHaveText("The downloaded copy has no password.");
  // A plain file says nothing of the kind.
  await page.goto("/edit-pdf");
  await open(page, corpus("std14-reportlab.pdf"));
  await expect(page.getByTestId("no-password-note")).toHaveCount(0);
});
