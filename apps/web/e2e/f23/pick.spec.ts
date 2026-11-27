/** F23 cloud sources: picking files from the mock provider into the shared intake. Spec: docs/specs/f23-cloud-pickers.md §7 */
import { expect, test } from "@playwright/test";
import {
  cards,
  caret,
  closed,
  downloadResult,
  dropFixtures,
  fileInput,
  flow,
  isDesktop,
  mockLog,
  mockPick,
  needsCloud,
  openRotate,
  openWindow,
  pageCountOf,
  passwordField,
  pick,
  pickFromRow,
  pickReady,
  pickSource,
  primary,
  reachPicker,
  rotateRight,
  rotationsOf,
  run,
  textsOf,
  tiles,
  uncovered,
} from "./support";

needsCloud();

let dialogs: string[] = [];
test.beforeEach(async ({ page }) => {
  dialogs = [];
  // No alert/confirm/prompt anywhere in the flow (AC-143, AC-144). The tool's own leave guard is a beforeunload.
  page.on("dialog", (d) => {
    if (d.type() !== "beforeunload") dialogs.push(`${d.type()}: ${d.message()}`);
    void d.accept();
  });
  await openRotate(page);
});
test.afterEach(() => expect(dialogs).toEqual([]));

/** What has focus, described the same way for a local and a cloud pick (AC-158). */
const focused = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return "body";
    return `${a.tagName} ${a.dataset.testid ?? ""} ${a.getAttribute("aria-label") ?? a.textContent?.trim().slice(0, 40) ?? ""}`;
  });

/** Records every text that appears in an aria-live region from now on (AC-154). */
async function recordLive(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[] };
    w.__live = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("[aria-live]")) {
        const t = el.textContent?.trim();
        if (t && w.__live.at(-1) !== t) w.__live.push(t);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __live: string[] }).__live);
}

test("AC-121, AC-130, AC-153: the caret is a menu button listing the three providers, with the one-line note", async ({ page }) => {
  await expect(caret(page)).toHaveAttribute("aria-haspopup", "menu");
  await expect(caret(page)).toHaveAttribute("aria-expanded", "false");
  await caret(page).focus();
  await page.keyboard.press("Enter");
  await expect(caret(page)).toHaveAttribute("aria-expanded", "true");
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toBeFocused();
  for (const [i, n] of ["Google Drive", "Dropbox", "OneDrive"].entries()) {
    await expect(items.nth(i)).toContainText(n);
    // The marks are inline SVG (no image request): drawn means a visible, non-empty box on first open.
    const icon = items.nth(i).locator("svg").first();
    await expect(icon).toBeVisible();
    const box = (await icon.boundingBox())!;
    expect(box.width * box.height, `${n} icon`).toBeGreaterThan(0);
    expect(await icon.locator("path, rect, circle, polygon, use").count(), `${n} icon has shapes`).toBeGreaterThan(0);
  }
  await expect(page.getByRole("menu")).toHaveAccessibleDescription("Files come straight to this device.");
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(caret(page)).toBeFocused();
  // ArrowDown opens it too, and Enter on an item opens that provider's window directly (no modal).
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const win = await openWindow(page, () => page.keyboard.press("Enter"));
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
  await win.close();
});

test("AC-121: /merge-pdf's empty state has the same caret and providers", async ({ page }) => {
  await page.goto("/merge-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await caret(page).click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  for (const [i, n] of ["Google Drive", "Dropbox", "OneDrive"].entries()) await expect(items.nth(i)).toContainText(n);
  await page.keyboard.press("Escape");
});

test("AC-165: the upload caret is in the server HTML, before any script runs; there is no second row of cloud icons", async ({ request }) => {
  for (const path of ["/rotate-pdf", "/merge-pdf"]) {
    const html = await (await request.get(path)).text();
    expect(html, `${path}: the caret is server-rendered`).toContain('data-testid="cloud-caret"');
    // One place for cloud sources (owner 2026-11-27): the caret's menu; the icon row under the button is gone.
    expect(html, path).not.toContain('data-testid="cloud-row"');
  }
});

test("AC-132, AC-134, AC-135, AC-158, AC-168: a pick from Google Drive lands in the same intake; the window closes itself", async ({ page }) => {
  const win = await openWindow(page, () => pickSource(page, "Google Drive"));
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google Drive");
  await expect(win.getByTestId("cloud-privacy")).toContainText("straight to this browser. We never see them or your sign");
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await expect(win.getByTestId("cloud-open")).toBeFocused();
  await mockPick(win, ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  // The window closes itself 600 ms after the tool's ack, often before the thumbnails below are drawn.
  await closed(win);
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Page 1 of 3/ })).toHaveCount(1);
  await expect(tiles(page).first().locator("[data-rendered] canvas")).toHaveCount(1);
  // Rotate shows a single file as its pages (no file card, as for a local pick); the name is announced.
  await expect(page.locator("[aria-live]").filter({ hasText: "alpha.pdf ready, 3 pages" })).toHaveCount(1);
  const log = (await mockLog(page))!;
  expect(log.requests.at(-1)).toMatchObject({ provider: "google", multiple: true, accept: [".pdf"], mode: "pick" });
  await expect(page.getByTestId("tool-flow").getByText("straight from Google Drive")).toHaveCount(0); // said on the result screen (AC-131)
  // AC-158: focus lands where a local pick puts it (the tool's first target in the ready state), not on the row.
  await expect(caret(page)).toHaveCount(0);
  await expect.poll(() => focused(page)).not.toBe("body");
  const cloudFocus = await focused(page);
  await openRotate(page);
  await caret(page).focus(); // the same starting point
  await fileInput(page).setInputFiles("tests/fixtures/alpha.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect.poll(() => focused(page)).toBe(cloudFocus);
});

test("AC-140, AC-131: rotating a cloud file gives the same output as the same file picked locally", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await rotateRight(page).click();
  await run(page);
  await expect(page.getByTestId("result")).toContainText("straight from Dropbox. Never uploaded.");
  const cloud = await downloadResult(page);
  await openRotate(page);
  await pickReady(page, "alpha.pdf");
  await rotateRight(page).click();
  await run(page);
  const local = await downloadResult(page);
  expect(cloud.name).toBe(local.name);
  expect(await pageCountOf(cloud.bytes)).toBe(await pageCountOf(local.bytes));
  expect(await rotationsOf(cloud.bytes)).toEqual(await rotationsOf(local.bytes));
  expect(await textsOf(cloud.bytes)).toEqual(await textsOf(local.bytes));
});

test("AC-136, AC-154: a slow download shows a card whose progress rises, then the file arrives", async ({ page }) => {
  const live = await recordLive(page);
  const win = await pickFromRow(page, "OneDrive", ["three-pages.pdf"], { slow: "three-pages.pdf" });
  const card = cards(page).first();
  await expect(card).toContainText("three-pages.pdf");
  const bar = card.getByRole("progressbar", { name: "Downloading three-pages.pdf" });
  const seen = new Set<string>();
  await expect
    .poll(async () => {
      const v = await bar.getAttribute("aria-valuenow").catch(() => null);
      if (v) seen.add(v);
      return seen.size;
    }, { intervals: [100] })
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator("[aria-live]").filter({ hasText: "Downloading three-pages.pdf from OneDrive" })).toHaveCount(1);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
  await expect(cards(page)).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(3);
  await closed(win);
  // Starting named the file and provider; finishing says the file was added.
  const said = await live();
  const start = said.findIndex((t) => t.includes("Downloading three-pages.pdf from OneDrive"));
  expect(start, said.join(" | ")).toBeGreaterThanOrEqual(0);
  expect(said.slice(start + 1).some((t) => t.includes("three-pages.pdf ready, 3 pages")), said.join(" | ")).toBe(true);
});

test("AC-146, AC-152: wrong type and corrupt files get the local messages; the good file stays", async ({ page }) => {
  await pick(page, "notes.txt", "alpha.pdf");
  const localType = await page.getByRole("alert").filter({ hasText: "notes.txt" }).innerText();
  await openRotate(page);
  await pickFromRow(page, "Google Drive", ["notes.txt", "alpha.pdf"]);
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toHaveText(localType);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await openRotate(page);
  await pick(page, "corrupt.pdf");
  const local = await page.getByRole("alert").filter({ hasText: "corrupt.pdf" }).innerText();
  await openRotate(page);
  await pickFromRow(page, "Google Drive", ["corrupt.pdf"]);
  await expect(page.getByRole("alert").filter({ hasText: "corrupt.pdf" })).toHaveText(local);
});

test("AC-147: a 101 MB file is refused by name before any download", async ({ page }) => {
  const win = await openWindow(page, () => pickSource(page, "Dropbox"));
  await reachPicker(win);
  await win.getByRole("button", { name: "101 MB file" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "huge-scan.pdf" })).toContainText("100 MB");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  const log = (await mockLog(page))!;
  expect(log.downloads).not.toContain("huge-scan.pdf");
  expect(log.downloads).toContain("alpha.pdf");
});

test("AC-151: a file the provider refuses (403) is named; the other file stays", async ({ page }) => {
  const win = await openWindow(page, () => pickSource(page, "OneDrive"));
  await reachPicker(win);
  await win.getByRole("button", { name: "403 file" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "budget.pdf" })).toContainText("can't be opened from OneDrive");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});

test("AC-149: a password-protected cloud file opens the same password dialog", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["user-pw.pdf"]);
  await expect(page.getByRole("dialog")).toContainText("user-pw.pdf");
  await expect(passwordField(page)).toBeFocused();
  await passwordField(page).fill("test");
  await page.getByRole("dialog").getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page).first()).toBeVisible();
});

test("AC-150: a mid-download failure marks that file, and Retry fetches it without the picker", async ({ page }) => {
  const win = await pickFromRow(page, "Google Drive", ["alpha.pdf", "bravo.pdf"], { failOnce: "bravo.pdf" });
  const failed = cards(page).filter({ hasText: "bravo.pdf" });
  await expect(failed).toContainText("Download stopped");
  await expect(flow(page)).toHaveAttribute("data-state", /ready|loading/);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(cards(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("file-card").or(page.getByTestId("page-tile")).first()).toBeVisible();
  await closed(win);
  const log = (await mockLog(page))!;
  expect(log.requests.length).toBe(1); // the picker opened once
});

test("AC-142: closing the window without picking goes back quietly, focus on the trigger", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const trigger = caret(page);
  const win = await openWindow(page, () => pickSource(page, "Dropbox"));
  await expect(page.getByText("Waiting for Dropbox…")).toBeVisible();
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await win.close();
  await expect(page.getByText("Waiting for Dropbox…")).toBeHidden({ timeout: 8_000 });
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0); // (Next's route announcer is an empty alert)
  await expect(trigger).toBeFocused();
  expect(page.context().pages()).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("AC-142: Cancel in the window closes it and the tool tab stays as it was", async ({ page }) => {
  const win = await openWindow(page, () => pickSource(page, "Google Drive"));
  await reachPicker(win);
  // The click can outlive the window it closes; the close event is the check.
  await Promise.all([win.waitForEvent("close"), win.getByTestId("mock-picker").getByRole("button", { name: "Cancel" }).click().catch(() => {})]);
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
});

test("AC-143: a blocked window shows a named inline message with Try again, which opens it", async ({ page }) => {
  await page.evaluate(() => {
    const real = window.open.bind(window);
    let n = 0;
    window.open = (...a: Parameters<typeof window.open>) => (n++ === 0 ? null : real(...a));
  });
  await pickSource(page, "Dropbox");
  const alert = page.getByRole("alert").filter({ hasText: "Your browser blocked the Dropbox window." });
  await expect(alert).toBeVisible();
  const again = alert.getByRole("button", { name: "Try again" });
  await expect(again).toBeFocused();
  const win = await openWindow(page, () => again.click());
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
  await win.close();
});

test("AC-144, AC-145: unreachable and denied are named inline; local files still work", async ({ page }) => {
  let win = await openWindow(page, () => pickSource(page, "OneDrive"));
  await reachPicker(win);
  await win.getByRole("button", { name: "Unreachable" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach OneDrive." })).toBeVisible();
  await win.close();
  win = await openWindow(page, () => pickSource(page, "Google Drive"));
  await reachPicker(win);
  await win.getByRole("button", { name: "Deny access" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Google Drive access wasn't given." }).getByRole("button", { name: "Try again" })).toBeVisible();
  await win.close();
  // Choose files still opens the file chooser, and a drop still adds a file.
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("drop-card").getByRole("button", { name: "Choose files", exact: true }).click()]);
  await chooser.setFiles("tests/fixtures/alpha.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await dropFixtures(page, ["bravo.pdf"]);
  await expect(tiles(page)).toHaveCount(5);
});

test("offline: opening the cloud sources while offline says so inline and opens nothing", async ({ page, context }) => {
  await context.setOffline(true);
  // The caret's menu needs the cloud chunk: offline, the caret itself says so (naming the clouds).
  await caret(page).click();
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expect(page.getByText(/needs a connection\. Files on this device still work\./)).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await context.setOffline(false);
});

test("AC-166: the last used source is remembered across a reload; a local pick sets it to this device", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("dropbox");
  await openRotate(page);
  // One click on the leading button opens the Dropbox window.
  const lead = await openWindow(page, () => pickSource(page, "Dropbox"));
  await expect(lead.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
  await lead.close();
  await expect(page.getByText("Waiting for Dropbox…")).toBeHidden({ timeout: 8_000 });
  // A cancelled pick does not change it; a local pick sets "device".
  const win = await openWindow(page, () => pickSource(page, "Google Drive"));
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await win.close();
  await expect(page.getByText("Waiting for Google Drive…")).toBeHidden({ timeout: 8_000 });
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("dropbox");
  await fileInput(page).setInputFiles("tests/fixtures/alpha.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("device");
  // A stored provider that isn't configured is ignored.
  await page.evaluate(() => localStorage.setItem("berrypdf:cloud-last", "box"));
  await openRotate(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-cloud-last", /.*/);
});

test("AC-165: the empty state causes no layout shift, with and without a stored last-used source", async ({ page }) => {
  for (const stored of [null, "onedrive"]) {
    await page.evaluate((v) => (v ? localStorage.setItem("berrypdf:cloud-last", v) : localStorage.removeItem("berrypdf:cloud-last")), stored);
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openRotate(page);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  }
});

/** AC-167: an open source menu is a sheet sitting on the dock, rows of 48 px, primary uncovered, no sideways scroll. */
async function expectSheet(page: import("@playwright/test").Page, width: number) {
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await page.waitForTimeout(400); // the sheet's entrance (a short scale-in) has settled
  for (const item of await page.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const sheet = (await page.locator(".ip-menu-sheet").boundingBox())!;
  // Since F25 the empty state is the picker card alone (no dock until a file is in): the sheet then
  // sits on the bottom edge of the screen instead.
  const dockEl = page.locator("[data-ip-dock]");
  const floor = (await dockEl.count()) ? (await dockEl.boundingBox())!.y : page.viewportSize()!.height;
  expect(sheet.y).toBeGreaterThanOrEqual(0);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(floor + 1);
  expect(floor - (sheet.y + sheet.height)).toBeLessThan(32); // it sits on the dock (or the screen's foot), not at the top
  expect(sheet.x).toBeLessThanOrEqual(12);
  expect(sheet.width).toBeGreaterThanOrEqual(width - 24);
  // The main action stays uncovered: the dock's primary once a file is in, the picker card's button before.
  const main = (await primary(page).count()) ? primary(page) : page.getByRole("button", { name: /^Choose (files|PDF)/ }).first();
  expect(await uncovered(main)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const [w, h] of [
  [390, 664],
  [360, 640],
] as const) {
  test(`AC-155, AC-156, AC-167: at ${w}x${h} the caret is visible, 44 px, and opens a sheet above the dock; Escape and a tap outside close it`, async ({ page }, info) => {
    test.skip(isDesktop(info.project.name), "phone layout");
    await page.setViewportSize({ width: w, height: h });
    // AC-156 is about 390x664: there the caret is on the first screen without scrolling.
    if (h >= 664) await expect(caret(page)).toBeInViewport({ ratio: 1 });
    expect((await caret(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await caret(page).tap();
    await expectSheet(page, w);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(caret(page)).toBeFocused();
    // The working state's source menu (the toolbar caret) is a sheet as well.
    await pickReady(page, "alpha.pdf");
    const toolbar = page.getByTestId("cloud-caret-toolbar");
    await expect(toolbar).toBeVisible();
    expect((await toolbar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toolbar.tap();
    await expectSheet(page, w);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(toolbar).toBeFocused();
    // A tap outside the sheet closes it too, and focus goes back to its trigger.
    await toolbar.tap();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.waitForTimeout(400);
    await page.getByRole("heading", { level: 1 }).tap(); // plain text, nothing focusable under the tap
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(toolbar).toBeFocused();
  });
}
