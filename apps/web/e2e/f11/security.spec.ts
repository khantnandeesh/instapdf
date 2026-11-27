/** F11 Protect and Unlock: spec docs/specs/f11-protect-unlock.md, AC-800 to AC-822. */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { downloadResult, flow, pick, primary, run, textsOf, unzip } from "../support/flow";

async function open(page: Page, slug: string, ...names: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  if (names.length) await pick(page, ...names);
}
const ready = (page: Page) => expect(flow(page)).toHaveAttribute("data-state", "ready");
const status = (page: Page) => page.getByTestId("dock-status");
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
/** Upstream pdf-lib refuses an encrypted file: an independent check that the output is encrypted. */
const isEncrypted = (bytes: Uint8Array) =>
  PDFDocument.load(bytes).then(
    () => false,
    (e: Error) => /encrypted/i.test(e.message),
  );
const asFile = (name: string, bytes: Uint8Array) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });

test.describe("Protect", () => {
  test("AC-800, AC-805, AC-810: the button waits for a password; the protected file needs it, and Unlock takes it off again", async ({ page }) => {
    await open(page, "protect-pdf", "alpha.pdf");
    await ready(page);
    await expect(primary(page)).toBeDisabled();
    await expect(status(page)).toHaveText("Enter a password");
    await page.locator("#protect-open").fill("tr0ub4dor&3");
    await expect(primary(page)).toBeEnabled();
    await run(page);
    // A protected result does not carry the "this copy has no password" note.
    await expect(page.getByTestId("result")).not.toContainText("has no password");
    const out = await downloadResult(page);
    expect(out.name).toBe("alpha.pdf");
    expect(await isEncrypted(out.bytes)).toBe(true);
    expect(Buffer.from(out.bytes).toString("latin1")).not.toContain("Alpha 1");

    // Round trip through Unlock: the password dialog, a wrong try, then the right one.
    await open(page, "unlock-pdf");
    await page.getByTestId("file-input").setInputFiles(asFile("alpha.pdf", out.bytes));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password", { exact: true }).fill("wrong");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByTestId("password-error")).not.toBeEmpty();
    await dialog.getByLabel("Password", { exact: true }).fill("tr0ub4dor&3");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await ready(page);
    await run(page);
    const plain = await downloadResult(page);
    expect(await isEncrypted(plain.bytes)).toBe(false);
    expect(await textsOf(plain.bytes)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3"]);
  });

  test("AC-802, AC-806: restrictions alone protect a file; the field for their password appears without moving anything", async ({ page }) => {
    await open(page, "protect-pdf", "alpha.pdf");
    await ready(page);
    const print = page.getByRole("switch", { name: "Print", exact: true });
    if (isDesktop(page)) {
      const copyBox = await page.getByRole("switch", { name: "Copy text and images" }).boundingBox();
      await print.click();
      await expect(page.getByLabel("Password to change these")).toBeVisible();
      expect(await page.getByRole("switch", { name: "Copy text and images" }).boundingBox()).toEqual(copyBox);
    } else {
      await page.getByRole("button", { name: /More options/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("switch", { name: "Print", exact: true }).click();
      await expect(dialog.getByLabel("Password to change these")).toBeVisible();
      await dialog.getByRole("button", { name: "Done" }).click();
    }
    await expect(primary(page)).toBeEnabled();
    await run(page);
    const out = await downloadResult(page);
    expect(await isEncrypted(out.bytes)).toBe(true);
    // It opens with no password: Unlock takes it straight to ready.
    await open(page, "unlock-pdf");
    await page.getByTestId("file-input").setInputFiles(asFile("alpha.pdf", out.bytes));
    await ready(page);
  });

  test("AC-807: several files come back as a ZIP, each protected", async ({ page }) => {
    await open(page, "protect-pdf", "alpha.pdf", "bravo.pdf");
    await ready(page);
    await page.locator("#protect-open").fill("pw");
    await run(page);
    const out = await downloadResult(page);
    const entries = Object.entries(unzip(out.bytes));
    expect(entries.map(([name]) => name)).toEqual(["alpha.pdf", "bravo.pdf"]);
    for (const [, bytes] of entries) expect(await isEncrypted(bytes)).toBe(true);
  });

  test("AC-808: the password is never stored", async ({ page }) => {
    await open(page, "protect-pdf", "alpha.pdf");
    await ready(page);
    await page.locator("#protect-open").fill("do-not-keep-me");
    await run(page);
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    expect(stored).not.toContain("do-not-keep-me");
    await page.reload();
    await expect(page.locator("#protect-open")).toHaveCount(0);
  });
});

test.describe("Unlock", () => {
  test("AC-810, AC-811: a file with a password and a file with restrictions both come out open", async ({ page }) => {
    await open(page, "unlock-pdf", "owner-restricted.pdf");
    await ready(page);
    await expect(primary(page)).toHaveText("Unlock PDF");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("owner-restricted.pdf");
    expect(await isEncrypted(out.bytes)).toBe(false);
  });

  test("AC-812: a PDF with nothing to remove says so", async ({ page }) => {
    await open(page, "unlock-pdf", "alpha.pdf");
    await ready(page);
    await primary(page).click();
    await expect(page.getByText("This PDF has no password or restrictions, so there is nothing to remove.")).toBeVisible();
  });
});
