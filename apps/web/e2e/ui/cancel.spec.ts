/**
 * F25 AC-635 and AC-636 (docs/specs/f25-tool-layout-standard.md §6): Cancel in the progress pill really
 * stops the work. A browser job's worker is terminated and the file is untouched; the editor's download
 * build is disposed with the edits and undo history kept; the next run works.
 *
 * Live workers are counted by `window.__ipWorkers`, a test-only hook this spec installs before any page
 * script runs (it wraps `Worker`), so no product build carries it.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { makeLargePdf } from "../support/large-pdf";
import { flow, isDesktop, primary } from "../support/flow";

type Hook = { live: Record<string, number>; terminated: Record<string, number> };

async function trackWorkers(page: Page) {
  await page.addInitScript(() => {
    const hook: Hook = { live: {}, terminated: {} };
    (window as unknown as { __ipWorkers: Hook }).__ipWorkers = hook;
    // A Proxy, not a subclass: the worker objects stay native Workers.
    window.Worker = new Proxy(window.Worker, {
      construct(target, args: [string | URL, WorkerOptions?]) {
        const w = Reflect.construct(target, args) as Worker;
        const name = args[1]?.name ?? "worker";
        hook.live[name] = (hook.live[name] ?? 0) + 1;
        let alive = true;
        const terminate = w.terminate.bind(w);
        w.terminate = () => {
          if (alive) {
            alive = false;
            hook.live[name] -= 1;
            hook.terminated[name] = (hook.terminated[name] ?? 0) + 1;
          }
          terminate();
        };
        return w;
      },
    });
  });
}
/** Holds the fetch of a worker script until `release()`, so a run is still going when Cancel lands. */
async function holdScript(page: Page, pattern: RegExp) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  return () => open();
}
const workers = (page: Page) => page.evaluate(() => (window as unknown as { __ipWorkers: Hook }).__ipWorkers);

/** A 300-page PDF (AC-635's slow fixture): Split, Every page makes 300 files. */
async function make300(path: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 300; i++) doc.addPage([595, 842]).drawText(`Page ${i}`, { x: 72, y: 760, size: 36, font });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, await doc.save());
}

test("AC-635: Cancel during a browser job stops the worker, starts no download, and a second run completes", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one engine run is enough; the slot is the same on phones");
  test.setTimeout(120_000);
  const file = info.outputPath("three-hundred.pdf");
  await make300(file);
  await trackWorkers(page);
  await page.goto("/split-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await page.getByRole("radio", { name: "Every page" }).click();
  let downloads = 0;
  page.on("download", () => downloads++);
  // The job's worker script loads slowly, so the job is still running when Cancel lands.
  const release = await holdScript(page, /instapdf-processing\.[^/]*\.js/);
  await primary(page).click();
  const pill = page.getByTestId("processing");
  await expect(pill).toBeVisible();
  await expect.poll(async () => (await workers(page)).live["instapdf-processing"] ?? 0).toBe(1);
  await pill.getByRole("button", { name: "Cancel" }).click();
  const t0 = Date.now();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(primary(page)).toBeVisible();
  expect(Date.now() - t0, "the slot is back at rest within 300ms").toBeLessThan(300 + 200); // + Playwright's polling slack
  const w = await workers(page);
  expect(w.terminated["instapdf-processing"], "the processing worker was terminated").toBe(1);
  expect(w.live["instapdf-processing"]).toBe(0);
  await expect(page.getByTestId("notice")).toContainText("Cancelled. Your file is unchanged.");
  release();
  await page.waitForTimeout(500);
  expect(downloads, "no download starts").toBe(0);

  // A second run completes normally (a fresh worker).
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await expect(page.getByTestId("result")).toBeVisible();
  await expect(page.getByTestId("result-counter")).toHaveText("1 / 300 files");
});

test("AC-636: Cancel during the editor's download fires no download, keeps edits and undo, disposes the build; the next Download works", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the build worker is the same on phones");
  test.setTimeout(120_000);
  const large = info.outputPath("large.pdf");
  await makeLargePdf(large);
  await trackWorkers(page);
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(large);
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open", { timeout: 30_000 });
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 30_000 });
  // One edit: a text box.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.3, b.y + Math.min(b.height * 0.2, 200));
  await page.keyboard.type("Kept after cancel");
  await page.getByTestId("text-input").press("Escape");
  await expect(page.locator('[data-kind="text"]')).toHaveCount(1);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeEnabled();

  let downloads = 0;
  page.on("download", () => downloads++);
  // The build worker's script loads slowly, so the build is still running when Cancel lands.
  const release = await holdScript(page, /berry-build\.[^/]*\.js/);
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pill = page.getByTestId("processing");
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Cancel" }).click();
  await expect(pill).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(downloads, "no download event fires").toBe(0);
  const w = await workers(page);
  expect(w.terminated["berry-build"] ?? 0, "the build worker is disposed").toBeGreaterThanOrEqual(1);
  // Edits and undo history are unchanged.
  await expect(page.locator('[data-kind="text"]')).toHaveCount(1);
  await expect(page.getByRole("group", { name: /Kept after cancel/ })).toHaveCount(1);
  await expect(undo).toBeEnabled();
  await expect(page.getByTestId("download-card")).toHaveCount(0);
  release();

  // The next Download succeeds.
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByRole("button", { name: "Download PDF" }).click()]);
  const bytes = new Uint8Array(await readFile((await dl.path())!));
  expect(bytes.byteLength).toBeGreaterThan(1000);
  await expect(page.getByTestId("download-card")).toBeVisible();
});
