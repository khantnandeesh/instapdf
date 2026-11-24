/** F23 cloud sources: picking files from the mock provider into the shared intake. Spec: docs/specs/f23-cloud-pickers.md §7 */
import { expect, test } from "@playwright/test";
import { settled } from "../support/axe";
import {
  cards,
  caret,
  cloudRow,
  downloadResult,
  fileInput,
  flow,
  isDesktop,
  mockLog,
  mockPick,
  needsCloud,
  openRotate,
  openWindow,
  pick,
  pickFromRow,
  pickReady,
  reachPicker,
  rotateRight,
  rotationsOf,
  pageCountOf,
  run,
  textsOf,
  tiles,
  rowButton,
  primary,
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
    await expect(items.nth(i).locator("svg").first()).toBeVisible();
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

test("AC-165: the cloud row has one 44 px button per provider, named like its title", async ({ page }) => {
  await settled(page); // the drop card scales in
  const buttons = cloudRow(page).getByRole("button");
  await expect(buttons).toHaveCount(3);
  for (const [i, n] of ["Google Drive", "Dropbox", "OneDrive"].entries()) {
    await expect(buttons.nth(i)).toHaveAccessibleName(`Choose from ${n}`);
    await expect(buttons.nth(i)).toHaveAttribute("title", n);
    const box = (await buttons.nth(i).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});

test("AC-132, AC-134, AC-135, AC-158, AC-168: a pick from Google Drive lands in the same intake; the window closes itself", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Google Drive");
  await expect(win.getByTestId("cloud-privacy")).toContainText("straight to this browser. We never see them or your sign");
  await expect(win.getByTestId("cloud-open")).toBeEnabled();
  await expect(win.getByTestId("cloud-open")).toBeFocused();
  await mockPick(win, ["three-pages.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await win.waitForEvent("close", { timeout: 10_000 });
  const log = (await mockLog(page))!;
  expect(log.requests.at(-1)).toMatchObject({ provider: "google", multiple: true, accept: [".pdf"], mode: "pick" });
  await expect(page.getByTestId("tool-flow").getByText("straight from Google Drive")).toHaveCount(0); // said on the result screen (AC-131)
  // Focus is on the tool's first target in the ready state, not on the row.
  await expect(rowButton(page, "Google Drive")).toHaveCount(0);
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
  await win.waitForEvent("close");
});

test("AC-146, AC-152: wrong type and corrupt files get the local messages; the good file stays", async ({ page }) => {
  await pickFromRow(page, "Google Drive", ["notes.txt", "alpha.pdf"]);
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await openRotate(page);
  await pick(page, "corrupt.pdf");
  const local = await page.getByRole("alert").filter({ hasText: "corrupt.pdf" }).innerText();
  await openRotate(page);
  await pickFromRow(page, "Google Drive", ["corrupt.pdf"]);
  await expect(page.getByRole("alert").filter({ hasText: "corrupt.pdf" })).toHaveText(local);
});

test("AC-147: a 101 MB file is refused by name before any download", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "Dropbox").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "101 MB file" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "huge-scan.pdf" })).toContainText("100 MB");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  const log = (await mockLog(page))!;
  expect(log.downloads).not.toContain("huge-scan.pdf");
  expect(log.downloads).toContain("alpha.pdf");
});

test("AC-151: a file the provider refuses (403) is named; the other file stays", async ({ page }) => {
  const win = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "403 file" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "budget.pdf" })).toContainText("can't be opened from OneDrive");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});

test("AC-149: a password-protected cloud file opens the same password dialog", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["user-pw.pdf"]);
  await expect(page.getByRole("dialog")).toContainText("user-pw.pdf");
});

test("AC-150: a mid-download failure marks that file, and Retry fetches it without the picker", async ({ page }) => {
  const win = await pickFromRow(page, "Google Drive", ["alpha.pdf", "bravo.pdf"], { failOnce: "bravo.pdf" });
  const failed = cards(page).filter({ hasText: "bravo.pdf" });
  await expect(failed).toContainText("Download stopped");
  await expect(flow(page)).toHaveAttribute("data-state", /ready|loading/);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(cards(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("file-card").or(page.getByTestId("page-tile")).first()).toBeVisible();
  await win.waitForEvent("close");
  const log = (await mockLog(page))!;
  expect(log.requests.length).toBe(1); // the picker opened once
});

test("AC-142: closing the window without picking goes back quietly, focus on the trigger", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const trigger = rowButton(page, "Dropbox");
  const win = await openWindow(page, () => trigger.click());
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
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
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
  await rowButton(page, "Dropbox").click();
  const alert = page.getByRole("alert").filter({ hasText: "Your browser blocked the Dropbox window." });
  await expect(alert).toBeVisible();
  const again = alert.getByRole("button", { name: "Try again" });
  await expect(again).toBeFocused();
  const win = await openWindow(page, () => again.click());
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dropbox");
  await win.close();
});

test("AC-144, AC-145: unreachable and denied are named inline; local files still work", async ({ page }) => {
  let win = await openWindow(page, () => rowButton(page, "OneDrive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Unreachable" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach OneDrive." })).toBeVisible();
  await win.close();
  win = await openWindow(page, () => rowButton(page, "Google Drive").click());
  await reachPicker(win);
  await win.getByRole("button", { name: "Deny access" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Google Drive access wasn't given." }).getByRole("button", { name: "Try again" })).toBeVisible();
  await win.close();
  await pickReady(page, "alpha.pdf");
});

test("offline: choosing a provider while offline says so inline and opens nothing", async ({ page, context }) => {
  await context.setOffline(true);
  await rowButton(page, "Dropbox").click();
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expect(page.getByText("Dropbox needs a connection. Files on this device still work.")).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await context.setOffline(false);
});

test("AC-166: last used provider leads the row after a reload; a local pick clears it", async ({ page }) => {
  await pickFromRow(page, "Dropbox", ["alpha.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("dropbox");
  await openRotate(page);
  await expect(page.locator("html")).toHaveAttribute("data-cloud-last", "dropbox");
  const first = cloudRow(page).getByRole("button").first();
  // CSS order puts it first visually; the row keeps the fixed DOM order for screen readers.
  const boxes = await cloudRow(page).getByRole("button").evaluateAll((els) => els.map((e) => [e.textContent, e.getBoundingClientRect().left] as const));
  expect(boxes.sort((a, b) => a[1] - b[1])[0][0]).toContain("Dropbox");
  await expect(rowButton(page, "Dropbox")).toHaveAccessibleName("Choose from Dropbox (last used)");
  // Its name is visible (a chip); the others stay icon-only.
  expect((await rowButton(page, "Dropbox").locator(".ip-cloud-name").boundingBox())!.width).toBeGreaterThan(30);
  expect((await rowButton(page, "OneDrive").locator(".ip-cloud-name").boundingBox())!.width).toBeLessThan(2);
  await expect(first).toHaveAttribute("title", "Google Drive"); // DOM order is unchanged
  // A cancelled pick does not change it; a local pick sets "device".
  const win = await openWindow(page, () => rowButton(page, "Google Drive").click());
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

test("AC-165: the row causes no layout shift, with and without a stored last-used source", async ({ page }) => {
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

test("AC-155, AC-156, AC-167: on a phone the caret is visible, 44 px, and opens a sheet above the dock", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "phone layout");
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(caret(page)).toBeInViewport({ ratio: 1 });
  expect((await caret(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await caret(page).tap();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await page.waitForTimeout(400); // the sheet's entrance (a short scale-in) has settled
  for (const item of await page.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const sheet = (await page.locator(".ip-menu-sheet").boundingBox())!;
  const dock = (await page.locator("[data-ip-dock]").boundingBox())!;
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(dock.y + 1);
  expect(dock.y - (sheet.y + sheet.height)).toBeLessThan(32); // it sits on the dock, not at the top
  expect(sheet.x).toBeLessThanOrEqual(12);
  expect(sheet.width).toBeGreaterThanOrEqual(390 - 24);
  expect(await uncovered(primary(page))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(caret(page)).toBeFocused();
});
