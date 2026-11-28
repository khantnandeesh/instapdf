/**
 * F2 H-11 item 1: in-app links on a tool page with files loaded ask "Leave this tool?"
 * before a client-side navigation drops the user's files.
 */
import { expect, test } from "@playwright/test";
import { flow, openRotate, pickReady, tiles } from "../support/flow";
import { menu, menuButton } from "./support";

const leaveDialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Leave this tool?" });

test("H-11: with no files, header links navigate straight away", async ({ page }) => {
  await openRotate(page);
  await page.getByRole("link", { name: "BerryPDF home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("H-11: with files loaded, the logo asks first; Stay keeps the files, Leave navigates", async ({ page }) => {
  await openRotate(page);
  await pickReady(page, "three-pages.pdf");
  await page.getByRole("link", { name: "BerryPDF home" }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(leaveDialog(page)).toContainText("Your files and changes here will be lost.");
  await expect(leaveDialog(page).getByRole("button", { name: "Stay" })).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/rotate-pdf");

  await leaveDialog(page).getByRole("button", { name: "Stay" }).click();
  await expect(leaveDialog(page)).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);

  await page.getByRole("link", { name: "BerryPDF home" }).click();
  await leaveDialog(page).getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fast, private PDF tools");
});

test("H-11: Escape on the dialog stays; a menu entry and a footer link are guarded too", async ({ page }) => {
  await openRotate(page);
  await pickReady(page, "three-pages.pdf");

  await page.locator("footer").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(leaveDialog(page)).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/rotate-pdf");

  await menuButton(page).click();
  await menu(page).locator('nav a[href="/pdf-to-word"]').click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/pdf-to-word$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PDF to Word");
});

test("H-11: same-page links (skip link) are not guarded", async ({ page }) => {
  await openRotate(page);
  await pickReady(page, "three-pages.pdf");
  await page.getByRole("link", { name: "Skip to main content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});
