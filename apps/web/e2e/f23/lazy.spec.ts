/**
 * F23 cloud sources, second PR #32 review (mock provider): the cloud chunk loads on intent and never
 * with the page (L-a), a tap before it arrives still opens the window inside the click, Save to cloud
 * speaks without the empty state's cloud parts (L-b), and a cloud notice's action sits on its row (M-b).
 * Spec: docs/specs/f23-cloud-pickers.md (U-4 "Notice", U-5, AC-131).
 */
import { expect, test, type Page } from "@playwright/test";
import { caret, closed, flow, mockPick, needsCloud, openRotate, openWindow, pickReady, rowButton, run, tiles } from "./support";

needsCloud();

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

/** Every script the page has fetched so far (scripts and script preloads). */
const scripts = (page: Page) =>
  page.evaluate(() =>
    (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => new URL(r.name).pathname.endsWith(".js")).map((r) => r.name),
  );

/** Holds every script fetched from now on for `ms` (the cloud chunk among them). */
async function slowScripts(page: Page, ms: number) {
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test("the cloud chunk is not fetched with the page, only once a cloud control is about to be used", async ({ page }) => {
  // The page's own idle prefetches are done.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const before = await scripts(page);
  await page.waitForTimeout(1000);
  expect(await scripts(page)).toEqual(before);
  await rowButton(page, "Dropbox").hover();
  await expect.poll(async () => (await scripts(page)).length).toBeGreaterThan(before.length);
});

test("a tap on the row before the cloud chunk is here still opens the window inside the click", { tag: "@serial" }, async ({ page, context }) => {
  await page.waitForLoadState("networkidle");
  await slowScripts(page, 2000);
  const t0 = Date.now();
  const [win] = await Promise.all([context.waitForEvent("page"), rowButton(page, "Dropbox").click()]);
  // Opened by the click itself (a blank window first), well before the chunk could arrive.
  expect(Date.now() - t0).toBeLessThan(1500);
  // The chunk then sends it on to the provider's page.
  await expect(win.getByTestId("cloud-window")).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
  await mockPick(win, ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await closed(win);
});

test("M-1: two taps on different clouds before the chunk is here leave one window, the second one's", { tag: "@serial" }, async ({ page, context }) => {
  await page.waitForLoadState("networkidle");
  await slowScripts(page, 3000);
  const windows = () => context.pages().filter((p) => p !== page && !p.isClosed());
  await Promise.all([context.waitForEvent("page"), rowButton(page, "Dropbox").click()]);
  // Back to the tool tab, then the other cloud, while the chunk is still on its way.
  await page.bringToFront();
  await rowButton(page, "Google Drive").click();
  await expect(page.getByTestId("notice").filter({ hasText: "Waiting for Google Drive" })).toBeVisible({ timeout: 15_000 });
  expect(windows()).toHaveLength(1);
  const [win] = windows();
  await expect(win.getByTestId("cloud-window")).toBeVisible();
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google Drive");
  await expect(page.getByTestId("notice").filter({ hasText: "Waiting for Dropbox" })).toHaveCount(0);
  // Past the time a window takes to see it lost its tool: still that one window, and it still works.
  await page.waitForTimeout(4000);
  expect(windows()).toHaveLength(1);
  expect(windows()[0]).toBe(win);
  await expect(win.getByText(/lost/i)).toHaveCount(0);
  await mockPick(win, ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await closed(win);
});

test("a press on the caret before the cloud chunk is here opens the menu once it arrives; keyboard focus carries over", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await slowScripts(page, 1500);
  await caret(page).click();
  const first = page.getByRole("menuitem").first();
  await expect(first).toBeFocused({ timeout: 10_000 });
  await expect(caret(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(caret(page)).toBeFocused();
  await expect(caret(page)).toHaveAttribute("aria-expanded", "false");
});

test("keyboard: focus on the caret before the chunk stays on it after the real menu button takes over", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await slowScripts(page, 1500);
  await caret(page).focus();
  // The real menu button replaces the stand-in once the chunk is here: the same place, still focused.
  await expect(caret(page)).toHaveAttribute("aria-controls", /.+/, { timeout: 10_000 });
  await expect(caret(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
});

// Known bug, kept visible (PR #67 review): the stand-in caret is swapped for the real menu button when
// the cloud chunk arrives. An Enter pressed in that moment lands on a button that is gone and is lost,
// so the menu does not open. Keeping the stand-in while it is focused fixes it but breaks the test
// above (focus must move to the real button), so the shared caret needs a decision first.
test.fixme("keyboard: Enter on the caret as the chunk arrives still opens the menu", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await openRotate(page);
    await caret(page).focus(); // starts the chunk fetch
    await page.keyboard.press("Enter"); // at once, while the real button may be taking over
    await expect(page.getByRole("menuitem").first()).toBeFocused({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  }
});

test("L-1: Merge's idle prefetch leaves the cloud chunk alone; a cloud control still fetches it", async ({ page }) => {
  await page.goto("/merge-pdf");
  await expect(rowButton(page, "Dropbox")).toBeVisible();
  // Merge prefetches its workspace after 4 s of idle: none of it is the cloud chunk.
  await page.waitForTimeout(6000);
  await page.waitForLoadState("networkidle");
  const before = await scripts(page);
  // So the first intent still has it to fetch.
  await rowButton(page, "Dropbox").hover();
  await expect.poll(async () => (await scripts(page)).length).toBeGreaterThan(before.length);
});

test("Save to cloud speaks for itself on a page that never touched a cloud control (L-b)", async ({ page }) => {
  await pickReady(page, "alpha.pdf");
  await run(page);
  // The browser refuses the window: the save says so in the tool's own notices.
  await page.evaluate(() => (window.open = () => null));
  // Two clouds to save to and none the files came from: "Save to…" opens a menu.
  await page.getByTestId("save-cloud").click();
  await page.getByRole("menuitem", { name: /^Google Drive/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your browser blocked the Google Drive window." })).toBeVisible();
});

test("M-b: a cloud notice's action sits on the notice's row, after the words and before the close (under them on a phone)", async ({ page }, info) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  const notice = page.getByTestId("notice").filter({ hasText: "Waiting for Dropbox" });
  const words = await notice.getByText("Waiting for Dropbox…").boundingBox();
  const action = await notice.getByRole("button", { name: "Cancel" }).boundingBox();
  const close = await notice.getByRole("button", { name: /^Dismiss/ }).boundingBox();
  if (info.project.name === "desktop") {
    // On the words' row: level with them, to their right, left of the close.
    expect(action!.y).toBeLessThan(words!.y + words!.height);
    expect(action!.y + action!.height).toBeGreaterThan(words!.y);
    expect(action!.x).toBeGreaterThanOrEqual(words!.x + words!.width);
    expect(action!.x + action!.width).toBeLessThanOrEqual(close!.x);
  } else {
    // A phone: under the words, lined up with them, so they keep the width.
    expect(action!.y).toBeGreaterThanOrEqual(words!.y + words!.height);
    expect(Math.abs(action!.x - words!.x)).toBeLessThan(2);
  }
  await win.close();
});
