/**
 * F23 cloud sources on the editor's landing (/edit-pdf, spec U-2 E6) with the mock provider: the same
 * caret, menu, order and row as the other tools, a pick that opens in the editor like a local file,
 * nothing sent from the page but GETs, and the page's strict CSP unchanged. The flag-off side is in
 * flag-off.spec.ts. Spec: docs/specs/f23-cloud-pickers.md (AC-121, AC-125, AC-126, AC-127, AC-153,
 * AC-157, AC-165, AC-166), mission micro-check M2.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations, settled } from "../support/axe";
import { caret, cloudRow, closed, mockLog, mockPick, needsCloud, openWindow, passwordField, reachPicker, recordRequests, rowButton } from "./support";

needsCloud();

const editor = (page: Page) => page.getByTestId("editor");
const openPdf = (page: Page) => page.getByRole("button", { name: "Open PDF", exact: true });

async function openEditor(page: Page) {
  await page.goto("/edit-pdf");
  await expect(editor(page)).toHaveAttribute("data-hydrated", "true");
}

let dialogs: string[] = [];
test.beforeEach(async ({ page }) => {
  dialogs = [];
  page.on("dialog", (d) => {
    if (d.type() !== "beforeunload") dialogs.push(`${d.type()}: ${d.message()}`);
    void d.accept();
  });
});
test.afterEach(() => expect(dialogs).toEqual([]));

test("E6, AC-165: the landing's cloud row and caret are in the server HTML, in the fixed order, and the CSP is the strict one", async ({ request }) => {
  const res = await request.get("/edit-pdf");
  const html = await res.text();
  const at = html.indexOf('data-testid="cloud-row"');
  expect(at, "the row is server-rendered").toBeGreaterThan(0);
  expect(html).toContain('data-testid="cloud-caret"');
  const row = html.slice(at, at + 4000);
  const order = ["Google Drive", "Dropbox", "OneDrive"].map((n) => row.indexOf(`title="${n}"`));
  expect(order.every((i) => i > 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // The marks the row and the menu draw (inline SVG sprite, no request), one per provider.
  for (const p of ["google", "dropbox", "onedrive"]) expect(html, `${p} mark`).toContain(`id="ip-mark-${p}"`);
  // Nothing says "last used" before anything was used (it is added after mount, only to the real one).
  expect(row).not.toContain("last used");
  // AC-127: provider traffic stays in the /cloud window; the editor page still connects to itself only.
  const csp = res.headers()["content-security-policy"] ?? "";
  const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  expect(directive("connect-src")).toBe("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(directive("script-src")).not.toMatch(/'unsafe-inline'|'unsafe-eval'|https?:|\s\*/);
  expect(directive("frame-src") ?? "").not.toMatch(/https?:|\*/);
});

test("E6, AC-121, AC-153: the caret opens the same provider menu by keyboard; Escape returns focus; Enter opens the window", async ({ page }) => {
  await openEditor(page);
  await expect(caret(page)).toHaveAccessibleName("More ways to add files");
  await expect(caret(page)).toHaveAttribute("aria-haspopup", "menu");
  await expect(caret(page)).toHaveAttribute("aria-expanded", "false");
  // Tab order: Open PDF, then the caret, then the row.
  await openPdf(page).focus();
  await page.keyboard.press("Tab");
  await expect(caret(page)).toBeFocused();
  // The real menu button takes over from the stand-in once the cloud chunk is here, keeping focus (lazy.spec.ts).
  await expect(caret(page)).toHaveAttribute("aria-controls", /.+/, { timeout: 10_000 });
  await expect(caret(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(caret(page)).toHaveAttribute("aria-expanded", "true");
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toBeFocused();
  for (const [i, n] of ["Google Drive", "Dropbox", "OneDrive"].entries()) {
    await expect(items.nth(i)).toContainText(n);
    // Its mark is drawn: the sprite symbol it uses is on the page and has shapes.
    const href = await items.nth(i).locator("svg[data-mark] use").getAttribute("href");
    expect(await page.locator(`${href} path`).count(), `${n} mark`).toBeGreaterThan(0);
  }
  await expect(page.getByRole("menu")).toHaveAccessibleDescription("Files come straight to this device.");
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(caret(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(0)).toBeFocused();
  const win = await openWindow(page, () => page.keyboard.press("Enter"));
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google Drive");
  // The window asks for one PDF up to the editor's 200 MB, for "Edit PDF".
  const q = new URL(win.url()).searchParams;
  expect(q.get("multiple")).not.toBe("1");
  expect(q.get("tool")).toBe("Edit PDF");
  expect(Number(q.get("max"))).toBe(200 * 1024 * 1024);
  await win.close();
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden({ timeout: 8_000 });
  await expect(editor(page)).toHaveAttribute("data-state", "empty");
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("E6: a tap on the caret opens the menu and a tap on a row mark opens that provider", async ({ page }) => {
    await openEditor(page);
    await settled(page);
    await caret(page).tap();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(3);
    for (const item of await page.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    const [win] = await Promise.all([page.context().waitForEvent("page"), rowButton(page, "Dropbox").tap()]);
    await expect(win.getByTestId("cloud-window")).toBeVisible();
    await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
    await win.close();
  });
});

test("E6, AC-126, AC-166: a mock pick opens in the editor like a local file, the page sends only GETs, and the row then names the last used provider", async ({ page, context }) => {
  const seen = recordRequests(context);
  await openEditor(page);
  const origin = new URL(page.url()).origin;
  // Fresh profile: no button says "last used", in its name or in the DOM.
  for (const n of ["Google Drive", "Dropbox", "OneDrive"] as const) await expect(rowButton(page, n)).toHaveAccessibleName(`Choose from ${n}`);
  expect(await cloudRow(page).evaluate((e) => e.textContent)).not.toContain("last used");

  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await mockPick(win, ["alpha.pdf"]);
  await closed(win);
  await expect(editor(page)).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: alpha.pdf");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  const log = await mockLog(page);
  expect(log?.requests.at(-1)).toMatchObject({ multiple: false, accept: [".pdf"] });

  // Only GETs went from the editor page (and the window) to our origin; no token in any of them.
  const ours = seen.filter((r) => r.url().startsWith(origin));
  expect(ours.filter((r) => r.method() !== "GET").map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  for (const r of ours) expect(`${r.url()} ${JSON.stringify(r.headers())}`).not.toContain("MOCK-TOKEN-F23");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("google");

  // After a reload, Google Drive (and only it) is the last used one.
  await openEditor(page);
  await expect(page.locator("html")).toHaveAttribute("data-cloud-last", "google");
  await expect(rowButton(page, "Google Drive")).toHaveAccessibleName("Choose from Google Drive (last used)");
  await expect(rowButton(page, "Dropbox")).toHaveAccessibleName("Choose from Dropbox");
  // A local pick makes "This device" the last used source.
  await page.getByTestId("editor-input").setInputFiles("tests/fixtures/bravo.pdf");
  await expect(editor(page)).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("device");
});

test("E6, AC-136: a slow download shows its progress under the card, then the file opens", async ({ page }) => {
  await openEditor(page);
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await mockPick(win, ["alpha.pdf"], { slow: "alpha.pdf" });
  const status = page.getByTestId("editor-cloud-status");
  await expect(status).toContainText("from Dropbox");
  await expect(status.getByRole("progressbar", { name: "Downloading alpha.pdf" })).toHaveAttribute("aria-valuenow", /\d+/);
  // Local files still work meanwhile: the main action stays enabled.
  await expect(openPdf(page)).toBeEnabled();
  await expect(editor(page)).toHaveAttribute("data-state", "open", { timeout: 30_000 });
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: alpha.pdf");
});

test("E6: when Google couldn't open, Choose from this device closes the window and focuses Open PDF", async ({ page }) => {
  await openEditor(page);
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Sign-in error" }).click();
  await win.getByTestId("cloud-choose-device").click();
  await closed(win);
  await page.bringToFront();
  await expect(openPdf(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute("data-state", "empty");
});

test("E6: a local file opened while a cloud pick is in progress wins; the cloud pick ends and never replaces it", async ({ page }) => {
  await openEditor(page);
  // 1. The window is open, nothing picked yet: a local pick closes it.
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  await page.getByTestId("editor-input").setInputFiles("tests/fixtures/bravo.pdf");
  await expect(editor(page)).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: bravo.pdf");
  await closed(win); // cancelled: nothing more can come from it
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden();

  // 2. A file already downloading from the cloud when a local file opens: the download stops, the local file stays.
  await openEditor(page);
  const win2 = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await mockPick(win2, ["alpha.pdf"], { slow: "alpha.pdf" });
  await expect(page.getByTestId("editor-cloud-status")).toBeVisible();
  await page.getByTestId("editor-input").setInputFiles("tests/fixtures/bravo.pdf");
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: bravo.pdf", { timeout: 20_000 });
  await closed(win2);
  await page.waitForTimeout(3000); // longer than the slow download would have taken
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: bravo.pdf");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).not.toBe("dropbox");
});

test("E6, AC-149: a password-protected PDF from the cloud opens the editor's password dialog", async ({ page }) => {
  await openEditor(page);
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await mockPick(win, ["user-pw.pdf"]);
  await closed(win);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("user-pw.pdf");
  await expect(passwordField(page)).toBeFocused();
  await passwordField(page).fill("test");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(editor(page)).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  await expect(page.getByTestId("file-menu")).toHaveAccessibleName("File: user-pw.pdf");
});

test("E6: a wrong file from the cloud gets the editor's message and the landing stays", async ({ page }) => {
  await openEditor(page);
  const win = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await mockPick(win, ["notes.txt"]);
  await expect(page.getByText(/notes\.txt/).first()).toBeVisible();
  await expect(editor(page)).toHaveAttribute("data-state", "empty");
  await expect(openPdf(page)).toBeEnabled();
});

for (const [w, h] of [
  [1280, 800],
  [390, 844],
  [320, 568],
] as const) {
  test(`E6, AC-157: at ${w}x${h} the landing fits, Open PDF is on the first screen, and axe finds nothing serious with the menu open`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    await settled(page);
    await expect(openPdf(page)).toBeInViewport({ ratio: 1 });
    await expect(caret(page)).toBeInViewport({ ratio: 1 });
    await expect(cloudRow(page)).toBeInViewport({ ratio: 1 });
    const card = (await page.locator("[data-testid=drop-card] .mp-dropcard").boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await caret(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoSeriousAxeViolations(page, `editor landing, menu open, ${w}x${h}`);
    // The open menu never hides Open PDF.
    await expect(openPdf(page)).toBeInViewport();
  });
}
