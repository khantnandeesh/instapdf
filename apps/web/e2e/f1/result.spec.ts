/** F1 shared flow, sections "Result" and "Errors" (AC-41 to AC-47) and improvements AC-54 to AC-57. Spec: docs/specs/f1-shared-flow.md */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  backToOptions,
  dialog,
  downloadLink,
  downloadResult,
  flow,
  fx,
  openRotate,
  pageCountOf,
  passwordField,
  pick,
  pickReady,
  primary,
  rotateRight,
  rotationsOf,
  run,
  scope,
  startOver,
  tiles,
  unzip,
} from "../support/flow";

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

const alternating = (n: number, first: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? first : 0));

test("AC-41: the result screen's Download gives three-pages.pdf, a valid PDF", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click();
  await run(page);
  await expect(page.getByTestId("result")).toBeVisible();
  await expect(downloadLink(page)).toBeVisible();
  const out = await downloadResult(page);
  expect(out.name).toBe("three-pages.pdf");
  expect(Buffer.from(out.bytes.slice(0, 5)).toString()).toBe("%PDF-");
  expect(await pageCountOf(out.bytes)).toBe(3);
});

test("AC-42: two inputs give berrypdf-rotate.zip with both PDFs, original names, 3 and 60 pages, rotated as chosen", async ({ page }) => {
  await pickReady(page, "three-pages.pdf", "sixty-pages.pdf");
  await scope(page, "Odd").click();
  await rotateRight(page).click();
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("berrypdf-rotate.zip");
  const entries = unzip(out.bytes);
  expect(Object.keys(entries)).toEqual(["three-pages.pdf", "sixty-pages.pdf"]);
  expect(await pageCountOf(entries["three-pages.pdf"])).toBe(3);
  expect(await pageCountOf(entries["sixty-pages.pdf"])).toBe(60);
  expect(await rotationsOf(entries["three-pages.pdf"])).toEqual([90, 0, 90]);
  expect(await rotationsOf(entries["sixty-pages.pdf"])).toEqual(alternating(60, 90));
});

test("AC-43: Continue with Rotate opens ready with the output loaded; rotating again gives 180", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click();
  await run(page);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Choose PDF files" })).toHaveCount(0); // no picker step
  // The loaded file is the output: its pages are landscape on screen with nothing pending.
  for (let i = 0; i < 3; i++) {
    await expect(tiles(page).nth(i)).toHaveAttribute("data-rotation", "0");
    const b = (await page.getByTestId("page-visual").nth(i).boundingBox())!;
    expect(b.width).toBeGreaterThan(b.height);
  }
  await rotateRight(page).click();
  await run(page);
  const out = await downloadResult(page);
  expect(await rotationsOf(out.bytes)).toEqual([180, 180, 180]);
});

test("AC-44: Start over returns to empty with no thumbnails, and a new pick works", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click();
  await run(page);
  await startOver(page);
  await expect(tiles(page)).toHaveCount(0);
  await expect(primary(page)).toBeDisabled();
  await pickReady(page, "pre-rotated.pdf");
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toHaveAttribute("data-rotation", "0"); // old pending rotation is gone
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("pre-rotated.pdf");
  expect(await rotationsOf(out.bytes)).toEqual([0, 90, 0]);
});

test("AC-45: Back to options keeps the file and pending rotations", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await page.getByRole("button", { name: "Rotate page 2 right" }).click();
  await run(page);
  await backToOptions(page);
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(1)).toHaveAttribute("data-rotation", "90");
  await expect(tiles(page).nth(0)).toHaveAttribute("data-rotation", "0");
  await run(page);
  const out = await downloadResult(page);
  expect(await rotationsOf(out.bytes)).toEqual([0, 90, 0]);
});

/**
 * Fault injection without a special build: the first fetch of the processing
 * worker script is answered with a worker that throws on its first message.
 * The app sees a real worker error, recreates the worker on retry, and the
 * second fetch gets the real script.
 */
async function breakWorkerOnce(page: Page) {
  const pattern = /\/_next\/static\/chunks\/instapdf-processing\.[^/]*\.js(\?.*)?$/;
  let served = 0;
  await page.route(pattern, async (route) => {
    if (served++ === 0) {
      await route.fulfill({ contentType: "application/javascript", body: "self.onmessage = () => { throw new Error('QA injected fault'); };" });
    } else {
      await route.continue();
    }
  });
  return () => served;
}

test("AC-46: a processing failure shows Retry and Start over; Retry keeps file and options and succeeds", async ({ page }) => {
  const served = await breakWorkerOnce(page);
  await pickReady(page, "three-pages.pdf");
  await scope(page, "Odd").click();
  await rotateRight(page).click();
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "error");
  const panel = page.getByTestId("process-error");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Start over" })).toBeVisible();
  const retry = panel.getByRole("button", { name: "Try again" });
  await expect(retry).toBeFocused();
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toHaveAttribute("data-rotation", "90");
  await expect(tiles(page).nth(1)).toHaveAttribute("data-rotation", "0");
  await retry.click();
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  expect(served()).toBe(2);
  const out = await downloadResult(page);
  expect(await rotationsOf(out.bytes)).toEqual([90, 0, 90]);
});

test("AC-47: every error message is dismissible and none leaves the primary enabled without a usable file", async ({ page }) => {
  const alerts = page.locator("[data-testid=tool-flow] [role=alert]").filter({ hasText: /\S/ });
  // Single errors, one at a time.
  for (const name of ["notes.txt", "corrupt.pdf", "empty.pdf", "too-many-pages.pdf"]) {
    await pick(page, name);
    const alert = alerts.filter({ hasText: name });
    await expect(alert).toBeVisible();
    await expect(primary(page)).toBeDisabled();
    await alert.getByRole("button", { name: /^Dismiss/ }).click();
    await expect(alert).toHaveCount(0);
    await expect(primary(page)).toBeDisabled();
  }
  // A batch of problems becomes one dismissible notice listing each file.
  await pick(page, "notes.txt", "corrupt.pdf", "empty.pdf");
  const batch = alerts.filter({ hasText: "3 files were skipped" });
  await expect(batch).toBeVisible();
  await expect(batch).toContainText("notes.txt");
  await expect(batch).toContainText("corrupt.pdf");
  await expect(batch).toContainText("empty.pdf");
  await expect(primary(page)).toBeDisabled();
  await batch.getByRole("button", { name: /^Dismiss/ }).click();
  await expect(alerts).toHaveCount(0);
  // The file-count warning is dismissible too, and files did load, so the primary is usable.
  await pick(page, ...Array(21).fill("three-pages.pdf"));
  const cap = alerts.filter({ hasText: "up to 20 files" });
  await expect(cap).toBeVisible();
  await cap.getByRole("button", { name: /^Dismiss/ }).click();
  await expect(cap).toHaveCount(0);
  await expect(primary(page)).toBeEnabled();
  // A wrong password error is cleared by Skip, which leaves no file and a disabled primary.
  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, "user-pw.pdf");
  await passwordField(page).fill("nope");
  await passwordField(page).press("Enter");
  await expect(page.getByTestId("password-error")).toContainText("didn't work");
  await dialog(page).getByRole("button", { name: "Skip this file" }).click();
  await expect(primary(page)).toBeDisabled();
});

test("AC-54: the preview shows the whole page inside its square and never covers the file name", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await run(page);
  const preview = page.getByTestId("result-preview");
  await expect(preview).toBeVisible();
  const shown = (await preview.boundingBox())!;
  const square = (await preview.locator("xpath=../..").boundingBox())!;
  expect(shown.height, "portrait: taller than wide").toBeGreaterThan(shown.width);
  expect(shown.y).toBeGreaterThanOrEqual(square.y);
  expect(shown.y + shown.height, "the page ends inside its square").toBeLessThanOrEqual(square.y + square.height + 0.5);
  const name = (await page.getByTestId("result-name").boundingBox())!;
  const overlapX = shown.x < name.x + name.width && name.x < shown.x + shown.width;
  const overlapY = shown.y < name.y + name.height && name.y < shown.y + shown.height;
  expect(overlapX && overlapY, "the preview stays off the file name").toBe(false);
});

test("AC-54: the result previews the output's first page (landscape after +90°); a ZIP lists entry names", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click();
  await run(page);
  const preview = page.getByTestId("result-preview");
  await expect(preview).toBeVisible();
  const box = await preview.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(box.w).toBeGreaterThan(box.h);
  const shown = (await preview.boundingBox())!;
  expect(shown.width).toBeGreaterThan(shown.height);

  await startOver(page);
  await pickReady(page, "three-pages.pdf", "sixty-pages.pdf");
  await run(page);
  await expect(page.getByTestId("result-preview")).toHaveCount(0);
  const entries = page.getByTestId("result-entries");
  await expect(entries.getByRole("listitem")).toHaveCount(2);
  await expect(entries.getByRole("listitem").nth(0)).toContainText("three-pages.pdf");
  await expect(entries.getByRole("listitem").nth(1)).toContainText("sixty-pages.pdf");
});

test("AC-55: pasting a PDF loads it; pasting text does nothing; a paste into a text field is never a file", async ({ page }) => {
  const b64 = (await readFile(fx("three-pages.pdf"))).toString("base64");
  const alertsBefore = await page.getByRole("alert").count(); // Next.js has its own route announcer
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "hello");
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  await expect(page.getByRole("alert")).toHaveCount(alertsBefore);
  await expect(flow(page)).toHaveAttribute("data-state", "empty");

  const pasteFile = (target: "body" | "password") =>
    page.evaluate(
      ({ b64, target }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "three-pages.pdf", { type: "application/pdf" }));
        const el = target === "body" ? document.body : document.querySelector("dialog[open] input[type=password]")!;
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      { b64, target },
    );

  await pasteFile("body");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);

  await page.reload();
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, "user-pw.pdf");
  await expect(passwordField(page)).toBeFocused();
  await pasteFile("password");
  await page.waitForTimeout(300);
  await passwordField(page).fill("test");
  await passwordField(page).press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3); // only user-pw.pdf, not the pasted file
});

test("AC-55 / F1 eval G-1: a paste event dispatched on the document or the window loads the PDF", async ({ page }) => {
  const b64 = (await readFile(fx("three-pages.pdf"))).toString("base64");
  for (const target of ["document", "window"] as const) {
    await page.evaluate(
      ({ b64, target }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "three-pages.pdf", { type: "application/pdf" }));
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        if (target === "document") document.dispatchEvent(ev);
        else window.dispatchEvent(ev);
      },
      { b64, target },
    );
    await expect(flow(page), target).toHaveAttribute("data-state", "ready");
    await expect(tiles(page), target).toHaveCount(3);
    await page.reload();
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  }
});

test("AC-56: Share sends exactly the output File when supported", async ({ page }) => {
  await page.addInitScript(() => {
    const nav = navigator as Navigator & { __shared?: { name: string; type: string; size: number }[][] };
    nav.__shared = [];
    nav.canShare = () => true;
    nav.share = async (d?: ShareData) => {
      nav.__shared!.push((d?.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })));
    };
  });
  await openRotate(page);
  await pickReady(page, "three-pages.pdf");
  await rotateRight(page).click();
  await run(page);
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => (navigator as Navigator & { __shared?: { name: string; type: string; size: number }[][] }).__shared);
  const out = await downloadResult(page);
  expect(shared).toEqual([[{ name: out.name, type: "application/pdf", size: out.bytes.length }]]);

  // A ZIP output is shared as one application/zip File.
  await startOver(page);
  await pickReady(page, "three-pages.pdf", "pre-rotated.pdf");
  await run(page);
  await page.getByRole("button", { name: "Share" }).click();
  const zipShared = await page.evaluate(() => (navigator as Navigator & { __shared?: { name: string; type: string }[][] }).__shared!.at(-1));
  expect(zipShared?.map((f) => [f.name, f.type])).toEqual([["berrypdf-rotate.zip", "application/zip"]]);
});

test("AC-56: no Share control when canShare returns false or the API is missing", async ({ page }) => {
  await page.addInitScript(() => {
    (navigator as Navigator & { canShare: () => boolean }).canShare = () => false;
  });
  await openRotate(page);
  await pickReady(page, "three-pages.pdf");
  await run(page);
  await expect(downloadLink(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

  const page2 = await page.context().newPage();
  await page2.addInitScript(() => {
    for (const k of ["share", "canShare"] as const) {
      delete (Navigator.prototype as unknown as Record<string, unknown>)[k];
      delete (navigator as unknown as Record<string, unknown>)[k];
    }
  });
  await openRotate(page2);
  expect(await page2.evaluate(() => "canShare" in navigator)).toBe(false);
  await pickReady(page2, "three-pages.pdf");
  await run(page2);
  await expect(downloadLink(page2)).toBeVisible();
  await expect(page2.getByRole("button", { name: "Share" })).toHaveCount(0);
  await page2.close();
});

test("AC-57: the result screen says the file was processed on this device and not uploaded", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await run(page);
  const note = page.getByTestId("privacy-result");
  await expect(note).toBeVisible();
  await expect(note).toContainText(/on this device/i);
  await expect(note).toContainText(/never uploaded|not uploaded/i);
});
