/** Helpers for the F23 cloud sources e2e suite (mock provider). Spec: docs/specs/f23-cloud-pickers.md */
import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Locator, type Page, type Request } from "@playwright/test";
import { cloudOn } from "../support/flow";

export * from "../support/flow";

export type Name = "Google Drive" | "Dropbox" | "OneDrive";

/** The whole suite needs a build with NEXT_PUBLIC_CLOUD_SOURCES=1 and the mock provider (CI job "cloud"). */
export function needsCloud() {
  test.skip(!cloudOn, "needs a build with NEXT_PUBLIC_CLOUD_SOURCES=1 NEXT_PUBLIC_CLOUD_MOCK=1");
}

export const caret = (page: Page) => page.getByTestId("cloud-caret");
/** A provider in the upload caret's menu: the one place cloud sources are offered (owner 2026-11-27, the icon row is gone). */
export const sourceItem = (page: Page, name: Name) => page.getByRole("menuitem", { name: new RegExp(`^${name}`) });
/** Opens the empty state's caret menu (unless it is open) and chooses a provider. */
export async function pickSource(page: Page, name: Name) {
  const item = sourceItem(page, name);
  if (!(await item.isVisible())) await caret(page).click();
  await item.click();
}
export const cards = (page: Page) => page.getByTestId("cloud-download");
export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Clicks something that opens a provider window and returns that window (a popup or, on phones, a tab). */
export async function openWindow(page: Page, click: () => Promise<unknown>) {
  const [win] = await Promise.all([page.context().waitForEvent("page"), click()]);
  await expect(win.getByTestId("cloud-window")).toBeVisible();
  return win;
}

/**
 * Resolves once the provider window has closed itself. Use this, never a late `win.waitForEvent("close")`:
 * that event is not replayed, so if the window closed before the call (it closes 600 ms after the tool's
 * ack, often while the test still waits for thumbnails) the wait hangs until its timeout.
 */
export async function closed(win: Page, timeout = 10_000) {
  await expect.poll(() => win.isClosed(), { timeout, message: "the provider window closes itself" }).toBe(true);
}

/** In the mock window: taps the berry button when the provider needs a tap, then waits for the mock picker. */
export async function reachPicker(win: Page) {
  const open = win.getByTestId("cloud-open");
  const picker = win.getByTestId("mock-picker");
  // A busy Open button (aria-busy, still enabled) is a window that goes on by itself: wait for the picker.
  await expect(open.and(win.locator(':enabled:not([aria-busy="true"])')).or(picker)).toBeVisible();
  if (!(await picker.isVisible())) await open.click();
  await expect(picker).toBeVisible();
}

/** Picks fixtures in the mock window (optionally one slow, one failing once) and presses Pick. */
export async function mockPick(win: Page, files: string[], opts: { slow?: string; failOnce?: string } = {}) {
  await reachPicker(win);
  for (const f of files) await win.getByTestId("mock-picker").getByRole("group").getByLabel(f, { exact: true }).check();
  if (opts.slow) await win.getByLabel("Slow file").selectOption(opts.slow);
  if (opts.failOnce) await win.getByLabel("Fail once").selectOption(opts.failOnce);
  await win.getByRole("button", { name: "Pick", exact: true }).click();
}

/** Opens a provider from the empty state's caret menu and picks fixtures; resolves when the window has closed itself. */
export async function pickFromRow(page: Page, name: Name, files: string[], opts: { slow?: string; failOnce?: string } = {}) {
  const win = await openWindow(page, () => pickSource(page, name));
  await mockPick(win, files, opts);
  return win;
}

export async function mockLog(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("berrypdf:cloud-mock-log") ?? "null") as {
    requests: { provider: string; multiple: boolean; accept: string[]; mode: string }[];
    downloads: string[];
    saved: { provider: string; name: string; size: number; sha256: string }[];
    onepick?: Record<string, string>[];
  } | null);
}

/** Records every request the context sends (all tabs and windows). */
export function recordRequests(context: BrowserContext) {
  const seen: Request[] = [];
  context.on("request", (r) => seen.push(r));
  return seen;
}

/** True when `el`'s centre is not covered by anything else. */
export const uncovered = (el: Locator) =>
  el.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === e || e.contains(hit));
  });
