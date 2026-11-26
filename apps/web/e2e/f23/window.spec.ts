/** F23 /cloud/<provider> window (mock): first view, progress, lost tool, Escape, axe. Spec: AC-157, AC-168 */
import { expect, test } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { caret, cards, closed, isDesktop, mockPick, needsCloud, openRotate, openWindow, reachPicker, rowButton } from "./support";

needsCloud();

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await openRotate(page);
});

test("AC-168: the window's button and privacy line fit at 480x640 and 390x664; files show progress bars; it closes itself", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  for (const [w, h] of [[480, 640], [390, 664]]) {
    await win.setViewportSize({ width: w, height: h });
    await expect(win.getByTestId("cloud-open")).toBeInViewport({ ratio: 1 });
    await expect(win.getByTestId("cloud-privacy")).toBeInViewport({ ratio: 1 });
  }
  await expectNoSeriousAxeViolations(win, "cloud window: before");
  await mockPick(win, ["three-pages.pdf"], { slow: "three-pages.pdf" });
  const bar = win.getByRole("progressbar", { name: "Downloading three-pages.pdf" });
  await expect(bar).toHaveAttribute("aria-valuenow", /\d+/);
  await expectNoSeriousAxeViolations(win, "cloud window: downloading");
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "done", { timeout: 15_000 });
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Added to Rotate PDF");
  await closed(win, 5000);
});

test("AC-168: when the tool tab goes away, the window says it lost its tool within 5 s", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await page.close({ runBeforeUnload: false });
  await expect(win.getByRole("heading", { name: "This window lost its tool" })).toBeVisible({ timeout: 5000 });
  await expectNoSeriousAxeViolations(win, "cloud window: lost");
});

test("AC-168: Escape cancels and closes the window", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await reachPicker(win);
  await Promise.all([win.waitForEvent("close"), win.keyboard.press("Escape").catch(() => {})]); // the press can outlive the window it closes
  await expect(page.getByText("Waiting for Dropbox…")).toBeHidden({ timeout: 5000 });
});

test("AC-168, AC-145: the window's error state passes axe and offers Try again", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Deny access" }).click();
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Access wasn't given");
  await expect(win.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectNoSeriousAxeViolations(win, "cloud window: denied");
});

test("AC-157: the tool page passes axe with the menu open, while downloading and with a provider error shown", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  await caret(page).click();
  await expectNoSeriousAxeViolations(page, "menu open");
  await page.keyboard.press("Escape");
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await mockPick(win, ["three-pages.pdf"], { slow: "three-pages.pdf" });
  await expect(cards(page)).toHaveCount(1);
  await expectNoSeriousAxeViolations(page, "downloading");
  await expect(cards(page)).toHaveCount(0, { timeout: 15_000 });
  await openRotate(page);
  const w2 = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await reachPicker(w2);
  await w2.getByRole("button", { name: "Unreachable" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach OneDrive." })).toBeVisible();
  await expectNoSeriousAxeViolations(page, "provider error");
});

test("Google couldn't open Drive (the picker stays silent): our state with the help link, Try again, and Choose from this device", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  // The mock picker goes silent, as Google's does when it is blocked: no message from docs.google.com.
  await win.getByRole("button", { name: "Picker stuck" }).click();
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "mock");
  await win.waitForTimeout(4000);
  await expect(win.getByTestId("cloud-window"), "nothing before about 6 s").toHaveAttribute("data-view", "mock");
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "signin", { timeout: 6000 });
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google couldn't open Drive here");
  await expect(win.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(win.getByText("Cookies for google.com may be blocked in this browser, or another Google account is active.")).toBeVisible();
  await expect(win.getByRole("link", { name: "How to fix it" })).toHaveAttribute("href", "https://support.google.com/drive/answer/13812413");
  await expect(win.getByTestId("cloud-signin-retry")).toBeInViewport({ ratio: 1 });
  await expect(win.getByTestId("cloud-choose-device")).toBeInViewport({ ratio: 1 });
  await expectNoSeriousAxeViolations(win, "cloud window: Google couldn't open Drive");
  // The tool tab still waits (no error from the window), with its own Cancel.
  await expect(page.getByText("Waiting for Google Drive…")).toBeVisible();
  // Try again opens the picker again, and a pick then goes through.
  await win.getByTestId("cloud-signin-retry").click();
  await reachPicker(win);
  await mockPick(win, ["alpha.pdf"]);
  await closed(win);
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
});

test("a failed sign-in shows the same state; Choose from this device closes the window and puts focus on the tool's own picker", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Sign-in error" }).click();
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "signin");
  await win.getByTestId("cloud-choose-device").click();
  await closed(win);
  await page.bringToFront();
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Choose PDF files" })).toBeFocused();
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "empty");
});
