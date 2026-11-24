/**
 * F23 cloud sources, PR #32 review fixes (mock provider): a full-page sign-in in the window (pick
 * and save), a stopped file that was still waiting its turn, and Google's own documents.
 * Spec: docs/specs/f23-cloud-pickers.md (AC-136, AC-141, AC-160, AC-168).
 */
import { expect, test, type Page } from "@playwright/test";
import { cards, closed, downloadResult, flow, mockLog, mockPick, needsCloud, openRotate, openWindow, pickReady, reachPicker, rowButton, run, sha256, tiles } from "./support";

needsCloud();

const REDIRECT = "berrypdf:cloud-mock-redirect";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await openRotate(page);
});

/** Every URL the next window's main frame goes to (the sign-in round trip shows up here), from its first. */
function visited(page: Page) {
  const urls: string[] = [];
  page.context().once("page", (win) => {
    win.on("framenavigated", (f) => {
      if (f === win.mainFrame()) urls.push(f.url());
    });
  });
  return urls;
}

test("OneDrive-style redirect sign-in: the window leaves for the sign-in page, comes back, and the pick arrives", async ({ page }) => {
  await page.evaluate((k) => localStorage.setItem(k, "1"), REDIRECT);
  const urls = visited(page);
  const win = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await reachPicker(win);
  // Out to the sign-in response URL and straight back to the window's own URL, with its request.
  expect(urls.some((u) => /\/cloud\/mock#code=MOCK&state=/.test(u)), urls.join("\n")).toBe(true);
  expect(new URL(win.url()).searchParams.get("req")).toBeTruthy();
  await mockPick(win, ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await closed(win);
});

test("Save to OneDrive across a redirect sign-in: the result reaches the window after it comes back", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  const { bytes } = await downloadResult(page);
  await page.evaluate((k) => localStorage.setItem(k, "1"), REDIRECT);
  await page.getByTestId("save-main").click();
  const urls = visited(page);
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^OneDrive/ }).click());
  await closed(win, 20_000);
  expect(urls.some((u) => u.includes("#code=MOCK")), urls.join("\n")).toBe(true);
  await expect(page.getByTestId("notice").filter({ hasText: /Saved to OneDrive as alpha/ })).toBeVisible();
  const saved = (await mockLog(page))!.saved.at(-1)!;
  expect(saved).toMatchObject({ provider: "onedrive", size: bytes.length, sha256: sha256(bytes) });
});

test("AC-136: a file stopped while still waiting its turn is never downloaded or added", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  // Two download at a time: echo.pdf waits for a free slot.
  await mockPick(win, ["alpha.pdf", "bravo.pdf", "echo.pdf"], { slow: "*" });
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Stop downloading echo.pdf" }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await expect(cards(page)).toHaveCount(0);
  await closed(win, 15_000);
  const log = (await mockLog(page))!;
  expect(log.downloads).toEqual(expect.arrayContaining(["alpha.pdf", "bravo.pdf"]));
  expect(log.downloads).not.toContain("echo.pdf");
  await expect(flow(page).getByText("echo.pdf")).toHaveCount(0);
  await expect(flow(page).getByText("alpha.pdf").first()).toBeVisible();
});

test("AC-141: Google's own documents arrive as PDFs; one too large to export is named", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Google documents" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator("[aria-live]").filter({ hasText: "Plan.pdf ready, 3 pages" })).toHaveCount(1);
  await expect(page.getByTestId("notice").filter({ hasText: "Big plan.pdf is too large for Google Drive to turn into a PDF." })).toBeVisible();
  await closed(win);
  expect((await mockLog(page))!.downloads).toEqual(expect.arrayContaining(["Plan.pdf", "Big plan.pdf"]));
});

test("AC-168: the tool tab goes away mid-download: a banner over the downloads, and the window never says Added", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  // Three slow files, two at a time: still downloading when the window notices (TOOL_LOST_MS).
  await mockPick(win, ["alpha.pdf", "bravo.pdf", "echo.pdf"], { slow: "*" });
  const bar = win.getByRole("progressbar");
  await expect(bar.first()).toBeVisible();
  await page.close({ runBeforeUnload: false });
  await expect(win.getByTestId("cloud-lost-banner")).toBeVisible({ timeout: 6000 });
  await expect(win.getByRole("heading", { name: "This window lost its tool" })).toHaveCount(0);
  // Every file downloaded (the rows keep a full bar).
  await expect(win.locator('[role=progressbar][aria-valuenow="100"]')).toHaveCount(3, { timeout: 20_000 });
  await win.waitForTimeout(1000);
  await expect(win.getByTestId("cloud-window")).not.toHaveAttribute("data-view", "done");
  await expect(win.getByTestId("cloud-lost-banner")).toBeVisible();
});

test("closing the window on a sign-in page: 'Stopped waiting' once this tab has been focused for 15 s (never while it isn't), and a late sign-in still carries on", { tag: "@serial" }, async ({ page }) => {
  test.setTimeout(90_000);
  // Playwright's tabs always report focus: drive this tab's own, from the start.
  await page.evaluate(() => {
    const w = window as Window & { __focused?: boolean };
    w.__focused = false;
    Document.prototype.hasFocus = () => !!w.__focused;
  });
  const focus = (on: boolean) => page.evaluate((v) => ((window as Window & { __focused?: boolean }).__focused = v), on);
  await page.evaluate((k) => localStorage.setItem(k, "hold"), REDIRECT);
  const urls = visited(page);
  // OneDrive starts by itself: the window may leave before it ever shows its own page.
  const [win] = await Promise.all([page.context().waitForEvent("page"), rowButton(page, "OneDrive").click()]);
  // The window leaves for the "sign-in page", which never answers.
  await expect.poll(() => urls.some((u) => new URL(u).pathname === "/"), { timeout: 15_000 }).toBe(true);
  const waiting = page.getByTestId("notice").filter({ hasText: /^Waiting for OneDrive/ });
  const stopped = page.getByTestId("notice").filter({ hasText: /^Stopped waiting for OneDrive\./ });
  await expect(waiting).toBeVisible();
  // This tab not focused (the person is signing in over there): still waiting, well past 15 s.
  await page.waitForTimeout(18_000);
  await expect(waiting).toBeVisible();
  await expect(stopped).toHaveCount(0);
  // Focused here: about 15 s later the tool says it stopped waiting, with Try again.
  const t0 = Date.now();
  await focus(true);
  await expect(stopped).toBeVisible({ timeout: 25_000 });
  expect(Date.now() - t0).toBeGreaterThan(13_000);
  await expect(waiting).toHaveCount(0);
  await expect(stopped.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(rowButton(page, "OneDrive")).toBeEnabled();
  // The sign-in comes back after all (a slow MFA prompt): the window is back on its own URL, and the
  // tool, still listening, carries on.
  const own = urls.find((u) => new URL(u).pathname === "/cloud/mock")!;
  await win.evaluate(() => sessionStorage.setItem("berrypdf:cloud-mock-signed", "1"));
  await win.goto(own);
  await expect(stopped).toHaveCount(0);
  await expect(waiting).toBeVisible();
  await mockPick(win, ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await closed(win);
});

test("AC-168: the tool tab closes just before the hand-off: no 'Added', the rows stay under the banner", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await reachPicker(win);
  await win.getByTestId("mock-picker").getByRole("group").getByLabel("alpha.pdf", { exact: true }).check();
  await page.close({ runBeforeUnload: false });
  await win.getByRole("button", { name: "Pick", exact: true }).click();
  // No ack comes back: the window keeps its rows and says it lost the tool.
  await expect(win.getByTestId("cloud-lost-banner")).toBeVisible({ timeout: 8000 });
  await expect(win.getByTestId("cloud-window")).not.toHaveAttribute("data-view", "done");
  await win.waitForTimeout(1500);
  await expect(win.getByTestId("cloud-window")).not.toHaveAttribute("data-view", "done");
  expect(win.isClosed()).toBe(false);
});
