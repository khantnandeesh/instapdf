/** F1 shared flow, section "Encrypted files" (AC-20 to AC-29). Spec: docs/specs/f1-shared-flow.md */
import { expect, test, type Page } from "@playwright/test";
import { dialog, downloadResult, flow, loadPlain, openRotate, passwordField, pick, primary, rotateRight, rotationsOf, run, tiles } from "../support/flow";

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

/** Records the title of every password prompt that opens, in order. */
async function recordPrompts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __prompts: string[] };
    w.__prompts = [];
    let last = "";
    new MutationObserver(() => {
      const d = document.querySelector("dialog[open] h2");
      const t = d?.textContent ?? "";
      if (t && t !== last) w.__prompts.push(t);
      last = t;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts);
}

async function unlock(page: Page, password = "test") {
  await passwordField(page).fill(password);
  await dialog(page).getByRole("button", { name: "Unlock" }).click();
}

test("AC-20: a user-password file opens a modal with its name and a focused, masked password field", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("user-pw.pdf");
  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await expect(passwordField(page)).toBeFocused();
  await expect(flow(page)).toHaveAttribute("data-state", "password");
});

test("AC-21: a wrong password keeps the modal open with a visible error and no thumbnails", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await unlock(page, "nope");
  await expect(page.getByTestId("password-error")).toBeVisible();
  await expect(page.getByTestId("password-error")).toContainText("didn't work");
  await expect(dialog(page)).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
  // The typed value stays, selected, for retyping.
  await expect(passwordField(page)).toHaveValue("nope");
  await expect(passwordField(page)).toBeFocused();
});

test("AC-22: the right password closes the modal and shows 3 thumbnails", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await passwordField(page).fill("test");
  await passwordField(page).press("Enter");
  await expect(dialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
});

test("AC-23: rotating an unlocked user-password file gives an unencrypted 3-page PDF, all /Rotate 90", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await unlock(page);
  await expect(tiles(page)).toHaveCount(3);
  await rotateRight(page).click();
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("user-pw.pdf");
  const doc = await loadPlain(out.bytes); // upstream pdf-lib throws on encrypted input
  expect(doc.getPageCount()).toBe(3);
  expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
});

test("AC-24: the show/hide toggle switches the field between masked and plain text", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  const toggle = dialog(page).getByRole("button", { name: "Show password" });
  await passwordField(page).fill("secret");
  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await toggle.click();
  await expect(passwordField(page)).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await expect(passwordField(page)).toHaveValue("secret");
});

test("AC-25: Skip, or Escape, removes the locked file and returns to empty", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await dialog(page).getByRole("button", { name: "Skip this file" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");

  await pick(page, "user-pw.pdf");
  await expect(passwordField(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(tiles(page)).toHaveCount(0);
});

test("AC-26: 'use for remaining files' unlocks both files with one prompt", async ({ page }) => {
  const prompts = await recordPrompts(page);
  await pick(page, "user-pw.pdf", "user-pw-2.pdf");
  await passwordField(page).fill("test");
  await dialog(page).getByLabel("Try this password on the other locked files").check();
  await dialog(page).getByRole("button", { name: "Unlock" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(6);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeHidden();
  expect(await prompts()).toEqual(["user-pw.pdf is locked"]);
});

test("AC-27: without the box, the two files get two prompts in turn, each named", async ({ page }) => {
  const prompts = await recordPrompts(page);
  await pick(page, "user-pw.pdf", "user-pw-2.pdf");
  await expect(dialog(page)).toContainText("user-pw.pdf is locked");
  await expect(dialog(page)).toContainText("Locked file 1 of 2");
  await unlock(page);
  await expect(dialog(page)).toContainText("user-pw-2.pdf is locked");
  await expect(dialog(page)).toContainText("Locked file 2 of 2");
  await unlock(page);
  await expect(dialog(page)).toBeHidden();
  await expect(tiles(page)).toHaveCount(6);
  expect(await prompts()).toEqual(["user-pw.pdf is locked", "user-pw-2.pdf is locked"]);
});

test("AC-28: owner-restricted loads with no prompt; output is 3 pages, all /Rotate 90, no password", async ({ page }) => {
  const prompts = await recordPrompts(page);
  await pick(page, "owner-restricted.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  expect(await prompts()).toEqual([]);
  await rotateRight(page).click();
  await expect(primary(page)).toBeEnabled();
  await run(page);
  const out = await downloadResult(page);
  const doc = await loadPlain(out.bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
});

test("AC-29: the result for an encrypted input says the copy has no password (and only then)", async ({ page }) => {
  await pick(page, "user-pw.pdf");
  await unlock(page);
  await expect(tiles(page)).toHaveCount(3);
  await run(page);
  await expect(page.getByText("This copy has no password")).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await pick(page, "three-pages.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await run(page);
  await expect(page.getByText("This copy has no password")).toHaveCount(0);
});
