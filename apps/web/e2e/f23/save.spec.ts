/** F23 Save to cloud on the result screen (mock provider). Spec: docs/specs/f23-cloud-pickers.md AC-160 to AC-164, AC-169 */
import { expect, test } from "@playwright/test";
import { expectNoSeriousAxeViolations, settled } from "../support/axe";
import { closed, downloadLink, downloadResult, flow, isDesktop, mockLog, needsCloud, openRotate, openWindow, pickFromRow, pickReady, recordRequests, rotateRight, run, sha256, uncovered } from "./support";

needsCloud();

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await openRotate(page);
  await page.evaluate(() => localStorage.removeItem("berrypdf:cloud-mock-folder"));
});

async function saveVia(page: import("@playwright/test").Page, click: () => Promise<unknown>, during?: () => Promise<void>) {
  const win = await openWindow(page, click);
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await expect(win.getByTestId("cloud-privacy")).toContainText("We never see it.");
  const gone = win.waitForEvent("close", { timeout: 15_000 });
  await win.getByTestId("cloud-open").click();
  await during?.();
  await gone;
}

test("AC-160, AC-161, AC-162, AC-164, AC-169, AC-131: Save to Drive after a Drive pick uploads the exact download, never overwriting", async ({ page, context }) => {
  const seen = recordRequests(context);
  await pickFromRow(page, "Google Drive", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await rotateRight(page).click();
  await run(page);
  const save = page.getByTestId("save-cloud");
  await expect(save).toHaveAccessibleName("Save to Drive");
  await expect(downloadLink(page)).toBeFocused();
  await expect(save).toBeInViewport({ ratio: 1 });
  await expect(downloadLink(page)).toBeInViewport({ ratio: 1 });
  expect(await uncovered(save)).toBe(true);
  await settled(page); // the result card scales in
  const width = (await save.boundingBox())!.width;
  const { name, bytes } = await downloadResult(page);

  await saveVia(page, () => save.click(), async () => {
    await expect(save).toHaveAccessibleName(/^Saving… \d+%$/);
    expect(Math.abs((await save.boundingBox())!.width - width)).toBeLessThan(1);
  });
  const ok = page.getByTestId("notice").filter({ hasText: `Saved to Google Drive as ${name}.` });
  await expect(ok).toBeVisible();
  await expect(ok.getByRole("link", { name: "Open in Drive" })).toHaveAttribute("href", "https://example.com/berrypdf-mock-folder");
  await expect(page.getByTestId("result")).toContainText("A copy was sent from this browser to your Google Drive; we never saw it.");
  let log = (await mockLog(page))!;
  expect(log.saved.at(-1)).toMatchObject({ provider: "google", name, size: bytes.length, sha256: sha256(bytes) });
  expect(Math.abs((await save.boundingBox())!.width - width)).toBeLessThan(1);

  // Same name again: the mock folder keeps both (AC-164).
  await expect(save).toHaveAccessibleName("Save to Drive", { timeout: 5000 });
  await saveVia(page, () => save.click());
  log = (await mockLog(page))!;
  expect(log.saved.at(-1)!.name).toBe(name.replace(/\.pdf$/, " (1).pdf"));

  // AC-162: nothing but GETs to our origin, and the token never leaves the window.
  const origin = new URL(page.url()).origin;
  const ours = seen.filter((r) => r.url().startsWith(origin));
  expect(ours.filter((r) => r.method() !== "GET").map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  for (const r of ours) {
    expect(r.url()).not.toContain("MOCK-TOKEN-F23");
    expect(JSON.stringify(r.headers())).not.toContain("MOCK-TOKEN-F23");
  }
});

test("AC-160: after a local pick, Save to… lists only Google Drive and OneDrive", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  const save = page.getByTestId("save-cloud");
  await expect(save).toHaveAccessibleName("Save to…");
  await save.click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await expect(page.getByRole("menuitem").nth(0)).toContainText("Google Drive");
  await expect(page.getByRole("menuitem").nth(1)).toContainText("OneDrive");
  await expect(page.getByRole("menuitem", { name: /Dropbox/ })).toHaveCount(0);
  // OneDrive's mock window saves without a tap (it goes straight on, like the real redirect sign-in).
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^OneDrive/ }).click());
  await closed(win, 15_000);
  await expect(page.getByTestId("notice").filter({ hasText: /Saved to OneDrive as alpha/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in OneDrive" })).toBeVisible();
});

test("AC-160, AC-169: after a Drive pick, one press saves to Drive and a narrow caret still offers the other clouds", async ({ page }, info) => {
  await pickFromRow(page, "Google Drive", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await run(page);
  const save = page.getByTestId("save-cloud");
  const caret = page.getByTestId("save-caret");
  await expect(save).toHaveAccessibleName("Save to Drive");
  await expect(caret).toHaveAccessibleName("Save to another cloud");
  await settled(page);
  // The icon keeps its 48 px box; the caret is narrow and sits right beside it; Download keeps its box.
  const s = (await save.boundingBox())!;
  const c = (await caret.boundingBox())!;
  expect(Math.round(s.width)).toBe(48);
  expect(c.width).toBeLessThanOrEqual(32);
  expect(Math.abs(c.x - (s.x + s.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(c.y - s.y)).toBeLessThanOrEqual(1);
  const dl = (await downloadLink(page).boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(dl.x);
  for (const el of [save, caret, downloadLink(page)]) {
    await expect(el).toBeInViewport({ ratio: 1 });
    expect(await uncovered(el)).toBe(true);
  }
  if (!isDesktop(info.project.name)) expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // The caret lists the other clouds (not Drive, never Dropbox), and saving there works.
  await caret.click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menuitem").first()).toContainText("OneDrive");
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^OneDrive/ }).click());
  await closed(win, 15_000);
  await expect(page.getByTestId("notice").filter({ hasText: /Saved to OneDrive as alpha/ })).toBeVisible();
  // Drive is still one press away.
  await expect(save).toHaveAccessibleName("Save to Drive", { timeout: 5000 });
});

test("AC-169: Download is the only berry fill, keeps the focus, and both controls fit at 1366x657 and 390x664", async ({ page }, info) => {
  await pickFromRow(page, "OneDrive", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await run(page);
  const save = page.getByTestId("save-cloud");
  await expect(save).toHaveAccessibleName("Save to OneDrive");
  await expect(downloadLink(page)).toBeFocused();
  // One filled action: no other control in the tool (row, slot and result) has Download's background.
  // Download sits in the row's action slot since F25 (spec §7), outside the result card.
  const fills = await flow(page).evaluate((root) => {
    const bg = (el: Element) => getComputedStyle(el).backgroundColor;
    const dl = [...root.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Download")!;
    return [...root.querySelectorAll("a, button")].filter((el) => (el as HTMLElement).offsetParent && bg(el) === bg(dl)).map((el) => el.textContent?.trim());
  });
  expect(fills).toEqual(["Download"]);
  for (const [w, h] of isDesktop(info.project.name) ? [[1366, 657]] : [[390, 664]]) {
    await page.setViewportSize({ width: w, height: h });
    await settled(page);
    for (const el of [downloadLink(page), save]) {
      await expect(el).toBeInViewport({ ratio: 1 });
      expect(await uncovered(el)).toBe(true);
    }
  }
});

test("AC-163: a save that fails in its window says so inline; Download still works", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  await page.getByTestId("save-cloud").click();
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  // Make the upload itself fail inside the window (the mock hashes the file before it "uploads").
  await win.evaluate(() => {
    crypto.subtle.digest = () => Promise.reject(new Error("upload failed"));
  });
  await win.getByTestId("cloud-open").click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't save to Google Drive." })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("alert").filter({ hasText: "Download still works." })).toBeVisible();
  expect((await mockLog(page))!.saved).toEqual([]);
  const { bytes } = await downloadResult(page);
  expect(bytes.length).toBeGreaterThan(0);
  if (!win.isClosed()) await win.close();
});

test("AC-163: Google's sign-in popup failing in Save: the window says why with only Close window; the tool's save fails inline", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  await page.evaluate(() => localStorage.setItem("berrypdf:cloud-mock-save", "signin"));
  await page.getByTestId("save-cloud").click();
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await win.getByTestId("cloud-open").click();
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "signin");
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google couldn't open Drive here");
  await expect(win.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(win.getByText("Cookies for google.com may be blocked in this browser, or another Google account is active.")).toBeVisible();
  await expect(win.getByRole("link", { name: "How to fix it" })).toHaveAttribute("href", "https://support.google.com/drive/answer/13812413");
  // Only a way out: no Try again or Choose from this device here (the tool has its own Try again).
  await expect(win.getByTestId("cloud-close")).toHaveText("Close window");
  await expect(win.getByRole("button", { name: /Try again|Choose from this device/ })).toHaveCount(0);
  await expectNoSeriousAxeViolations(win, "cloud window: Google couldn't open Drive (save)");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't save to Google Drive." })).toBeVisible({ timeout: 8000 });
  expect((await mockLog(page))!.saved).toEqual([]);
  await Promise.all([win.waitForEvent("close"), win.getByTestId("cloud-close").click()]);
  await page.evaluate(() => localStorage.removeItem("berrypdf:cloud-mock-save"));
});

test("AC-163: a save cancelled in its window says so inline; Download still works", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  await page.getByTestId("save-cloud").click();
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await Promise.all([win.waitForEvent("close"), win.keyboard.press("Escape").catch(() => {})]);
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't save to Google Drive." })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("alert").filter({ hasText: "Download still works." })).toBeVisible();
  const { bytes } = await downloadResult(page);
  expect(bytes.length).toBeGreaterThan(0);
});
