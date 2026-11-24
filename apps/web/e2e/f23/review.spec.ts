/**
 * F23 cloud sources, PR #32 review fixes (mock provider): a full-page sign-in in the window (pick
 * and save), a stopped file that was still waiting its turn, and Google's own documents.
 * Spec: docs/specs/f23-cloud-pickers.md (AC-136, AC-141, AC-160).
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
