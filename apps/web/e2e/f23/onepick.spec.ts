/**
 * F23 Google Drive through Google's top-level picker ("onepick", adapters/onepick.ts), simulated by
 * the mock provider: the window leaves for "Google" and comes back to the bare /cloud/mock URL with
 * `#access_token=…&picked_file_ids=…&state=…`. The window's own URL comes back without a reload, the
 * hash (and its token) never stays in the address bar, and a state that isn't the window's is refused.
 */
import { expect, test, type Page } from "@playwright/test";
import { isPhoneToolbar, openMerge, pickMerge, showPages } from "../f3/support";
import { closed, flow, mockLog, needsCloud, openRotate, openWindow, rowButton, tiles } from "./support";

needsCloud();

const REDIRECT = "berrypdf:cloud-mock-redirect";
const OUTCOME = "berrypdf:cloud-mock-onepick";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await openRotate(page);
});

/** Sets what "Google" sends back, then opens Google Drive from the row and taps Open in the window. */
async function onepick(page: Page, outcome: string) {
  await page.evaluate(([k, v, ko, vo]) => (localStorage.setItem(k, v), localStorage.setItem(ko, vo)), [REDIRECT, "onepick", OUTCOME, outcome]);
  const urls: string[] = [];
  page.context().once("page", (w) => w.on("framenavigated", (f) => f === w.mainFrame() && urls.push(f.url())));
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await win.getByTestId("cloud-open").click();
  return { win, urls };
}

test("several files picked in Google's picker arrive; the token never stays in the URL", async ({ page }) => {
  const { win, urls } = await onepick(page, "alpha.pdf,bravo.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
  await expect(tiles(page)).toHaveCount(5); // alpha 3 pages + bravo 2
  // Out to "Google" and back on the bare URL with the response…
  expect(urls.some((u) => /\/cloud\/mock#.*access_token=/.test(u)), urls.join("\n")).toBe(true);
  await closed(win);
  const log = (await mockLog(page))!;
  expect(log.downloads).toEqual(expect.arrayContaining(["alpha.pdf", "bravo.pdf"]));
  // Google was asked for several files of the tool's types (google.ts onepickParams, AC-134/135).
  expect(log.onepick!.at(-1)).toMatchObject({ allow_multiple: "true", mimetypes: expect.stringMatching(/^application\/pdf,/) });
  // …and nothing the tool tab can read holds the token.
  expect(JSON.stringify(log)).not.toContain("MOCK-TOKEN-F23");
});

test("the window's own URL comes back at once, without the hash", async ({ page }) => {
  const { win } = await onepick(page, "alpha.pdf");
  // The window is back on its own URL (with its request) and the hash is gone.
  await expect.poll(() => (win.isClosed() ? "closed" : new URL(win.url()).hash), { timeout: 10_000 }).toMatch(/^(|closed)$/);
  if (!win.isClosed()) expect(new URL(win.url()).searchParams.get("req")).toBeTruthy();
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
});

test("the picker closed (Google answers access_denied): a quiet cancel, nothing added", async ({ page }) => {
  // Google sends the same error for closing its picker as for declining consent, so both are a cancel (AC-142).
  const { win } = await onepick(page, "denied");
  await closed(win);
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden({ timeout: 8_000 });
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0); // no notice (Next's route announcer is an empty alert)
  await expect(rowButton(page, "Google Drive")).toBeFocused();
  expect((await mockLog(page))!.downloads).toEqual([]);
});

test("a single-file pick asks Google for one file only, and only one arrives", async ({ page }) => {
  await openMerge(page);
  test.skip(isPhoneToolbar(page), "desktop Add pages menu; phones open the same window from the Add menu");
  await pickMerge(page, "alpha.pdf");
  await showPages(page);
  await page.evaluate(([k, v, ko, vo]) => (localStorage.setItem(k, v), localStorage.setItem(ko, vo)), [REDIRECT, "onepick", OUTCOME, "bravo.pdf,echo.pdf"]);
  await page.getByRole("button", { name: "Add pages", exact: true }).click();
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  await win.getByTestId("cloud-open").click();
  await expect(page.getByRole("dialog")).toContainText("Add pages from bravo.pdf", { timeout: 15_000 });
  const log = (await mockLog(page))!;
  expect(log.onepick!.at(-1)).not.toHaveProperty("allow_multiple");
  expect(log.onepick!.at(-1)!.mimetypes).toContain("application/pdf");
  expect(log.downloads).not.toContain("echo.pdf");
});

test("a response whose state isn't this window's is refused and its token never used", async ({ page }) => {
  const { win } = await onepick(page, "badstate");
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "unreachable", { timeout: 10_000 });
  expect(new URL(win.url()).hash).toBe("");
  await expect(tiles(page)).toHaveCount(0);
  expect((await mockLog(page))!.downloads).toEqual([]);
});

test("nothing picked: the window closes quietly and the tool stays empty", async ({ page }) => {
  const { win } = await onepick(page, "empty");
  await closed(win);
  await expect(tiles(page)).toHaveCount(0);
});

test("a response arriving at a window that never left for it is ignored", async ({ page, context }) => {
  // A forged return URL (no round trip from this browser): no request to restore, so "invalid".
  const win = await context.newPage();
  await win.goto("/cloud/mock#access_token=X&token_type=Bearer&picked_file_ids=0&state=mock.00000000-0000-4000-8000-000000000000");
  await expect(win.getByTestId("cloud-window")).toHaveAttribute("data-view", "invalid");
  expect(new URL(win.url()).hash).toBe("");
  void page;
});
