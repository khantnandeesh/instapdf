/**
 * F25 §6, the progress pill: AC-632–634 and AC-637–641 (docs/specs/f25-tool-layout-standard.md).
 * Browser jobs run on Delete and Merge; the server phases run on the settings fixture's server mode
 * (`/test-fixtures/settings-tool?server=1`, IP_TEST_FIXTURES=1) against a Playwright route mock of the
 * job API (`src/lib/jobs/server-job.ts`): upload, queue, work, done, and `DELETE /jobs/{id}` on Cancel.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { flow, fx, isDesktop, primary } from "../support/flow";

const SLOT_VIEWPORTS: [number, number][] = [
  [1366, 657],
  [390, 664],
];

/** Records every `data-progress` value and the slot box at each change (from page scripts, so nothing is missed). */
async function watchPill(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pill: { phases: string[]; boxes: number[][]; shift: number; fills: number[]; tags: string[] } };
    w.__pill = { phases: [], boxes: [], shift: 0, fills: [], tags: [] };
    new PerformanceObserver((l) => {
      // The run ends where the result begins (data-state "done").
      if (document.querySelector("[data-testid=tool-flow][data-state=done]")) return;
      for (const e of l.getEntries()) {
        w.__pill.shift += (e as unknown as { value: number }).value;
        for (const src of (e as unknown as { sources: { node?: Node; previousRect: DOMRect; currentRect: DOMRect }[] }).sources ?? [])
          w.__pill.tags.push("SHIFT " + ((src.node as Element | undefined)?.outerHTML?.slice(0, 120) ?? "#text:" + src.node?.textContent + " in " + (src.node?.parentElement?.outerHTML.slice(0, 160) ?? "-")) + " " + JSON.stringify(src.previousRect) + " -> " + JSON.stringify(src.currentRect));
      }
    }).observe({ type: "layout-shift", buffered: false });
    const box = () => {
      // Up to the result (data-state "done"): there Download takes the slot and, below 1024, the dock
      // drops its options and Download fills the row (§7). The pill's own done tick is still recorded.
      if (document.querySelector("[data-testid=tool-flow][data-state=done], [data-testid=result]")) return;
      const s = document.querySelector("[data-testid=action-slot]");
      if (!s) return;
      const r = s.getBoundingClientRect();
      w.__pill.boxes.push([r.x, r.y, r.width, r.height]);
      w.__pill.tags.push((document.querySelector("[data-testid=tool-flow]")?.getAttribute("data-state") ?? "") + ":" + (document.querySelector("[data-testid=processing]")?.getAttribute("data-progress") ?? "-"));
    };
    box();
    new MutationObserver(() => {
      const p = document.querySelector("[data-testid=processing]");
      const phase = p?.getAttribute("data-progress");
      if (phase && w.__pill.phases.at(-1) !== phase) w.__pill.phases.push(phase);
      const fill = p?.querySelector<HTMLElement>(".ip-pill__bar > i");
      const m = fill?.style.transform.match(/scaleX\(([\d.]+)\)/);
      if (m) w.__pill.fills.push(parseFloat(m[1]));
      box();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-progress", "style", "data-state"] });
  });
}
const pillLog = (page: Page) => page.evaluate(() => (window as unknown as { __pill: { phases: string[]; boxes: number[][]; shift: number; fills: number[]; tags: string[] } }).__pill);

async function openTool(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

for (const [width, height] of SLOT_VIEWPORTS) {
  test(`AC-632 AC-633: at ${width}x${height} the pill replaces the primary in the same box, the work dims and goes inert, nothing shifts`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const [path, files] of [
      ["/delete-pdf-pages", ["sixty-pages.pdf"]],
      ["/merge-pdf", ["sixty-pages.pdf", "three-pages.pdf"]],
    ] as const) {
      await openTool(page, path);
      await page.getByTestId("file-input").setInputFiles(files.map(fx));
      await expect(flow(page)).toHaveAttribute("data-state", "ready");
      if (path === "/delete-pdf-pages") await page.locator("[data-tile-button][aria-pressed]").first().click();
      await expect(primary(page)).toBeEnabled();
      await watchPill(page);
      await primary(page).click();
      const pill = page.getByTestId("action-slot").getByTestId("processing");
      await expect(pill).toBeVisible();
      // While working: the options and the pages dim to 0.45 and go inert; the navbar does not.
      const dims = await page.evaluate(() =>
        [...document.querySelectorAll("[data-dim]")].map((e) => ({ inert: (e as HTMLElement).inert, opacity: getComputedStyle(e).opacity, id: e.getAttribute("data-testid") })),
      );
      expect(dims.map((d) => d.id)).toContain("pages-scroll");
      for (const d of dims) expect(d.inert, `${d.id} is inert`).toBe(true);
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("[data-dim]")].every((e) => getComputedStyle(e).opacity === "0.45"))).toBe(true);
      expect(await page.evaluate(() => (document.querySelector(".ip-site-header") as HTMLElement | null)?.inert ?? false)).toBe(false);
      await expect(page.getByTestId("processing-loader")).toHaveCount(0);
      await expect(page.locator(".mp-loading")).toHaveCount(0);
      await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
      const log = await pillLog(page);
      const [first, ...rest] = log.boxes;
      rest.forEach((b, n) => {
        for (let i = 0; i < 4; i++) expect(Math.abs(b[i] - first[i]), `${path}: the slot box never moves or resizes (${log.tags[n + 1]}: ${b.join(",")} vs ${first.join(",")})`).toBeLessThanOrEqual(0.5);
      });
      expect(log.shift, `${path}: no layout shift during the run ${log.tags.filter((t) => t.startsWith("SHIFT")).join(" | ")}`).toBe(0);
    }
  });
}

test("AC-634 AC-640: the label reads '<verb>… n%', the fill tracks n and never goes back; the pill has focus and an accessible progressbar", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  await openTool(page, "/test-fixtures/settings-tool");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await watchPill(page);
  await primary(page).click();
  const pill = page.getByTestId("processing");
  await expect(pill).toBeFocused();
  const bar = pill.getByRole("progressbar");
  await expect(pill).toContainText(/Compressing… \d+%/);
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow")), { timeout: 5000 }).toBeGreaterThanOrEqual(30);
  // One read of the label, the ARIA values and the fill's target scale (the inline transform).
  const snap = await pill.evaluate((p) => {
    const b = p.querySelector("[role=progressbar]")!;
    const m = (p.querySelector(".ip-pill__bar > i") as HTMLElement).style.transform.match(/scaleX\(([\d.]+)\)/);
    return { now: Number(b.getAttribute("aria-valuenow")), text: b.getAttribute("aria-valuetext"), label: p.querySelector(".ip-pill__label")!.textContent, scale: m ? parseFloat(m[1]) : -1 };
  });
  expect(snap.text).toBe(`${snap.now}%`);
  expect(snap.label).toBe(`Compressing… ${snap.now}%`);
  expect(Math.abs(snap.scale - snap.now / 100)).toBeLessThanOrEqual(0.01);
  await expect(page.getByTestId("processing").getByText("Done")).toBeVisible({ timeout: 5000 });
  await expect(flow(page)).toHaveAttribute("data-state", "done");
  const { fills } = await pillLog(page);
  expect(fills.length).toBeGreaterThan(3);
  for (let i = 1; i < fills.length; i++) expect(fills[i], "the fill never decreases").toBeGreaterThanOrEqual(fills[i - 1]);
});

test("AC-639: the Done tick shows for at least 400ms, and the result is in view within 900ms of the job finishing", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  await openTool(page, "/test-fixtures/settings-tool");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.evaluate(() => {
    const w = window as unknown as { __t: { done?: number; state?: number; result?: number } };
    w.__t = {};
    new MutationObserver(() => {
      const now = performance.now();
      if (!w.__t.done && document.querySelector("[data-testid=processing][data-progress=done]")) w.__t.done = now;
      if (!w.__t.state && document.querySelector("[data-testid=tool-flow][data-state=done]")) w.__t.state = now;
      if (!w.__t.result && document.querySelector("[data-testid=result]")) w.__t.result = now;
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await primary(page).click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 10_000 });
  const t = await page.evaluate(() => (window as unknown as { __t: { done: number; state: number; result: number } }).__t);
  expect(t.state - t.done, "Done shows for at least 400ms").toBeGreaterThanOrEqual(400);
  expect(t.result - t.done, "the result is in within 900ms").toBeLessThanOrEqual(900);
});

test("AC-640: Escape on the pill cancels", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "keyboard");
  await openTool(page, "/test-fixtures/settings-tool");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await primary(page).click();
  await expect(page.getByTestId("processing")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("notice")).toContainText("Cancelled. Your file is unchanged.");
});

test("AC-641: reduced motion: the spinner pulses instead of turning, the glide stops, and nothing else runs 5s in", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const job = await mockJobs(page, { queue: [25], hold: "queue" });
  await openTool(page, "/test-fixtures/settings-tool?server=1");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await primary(page).click();
  await expect(page.getByTestId("queue-position")).toHaveText("#25");
  await expect(page.getByTestId("pill-bar")).toHaveClass(/ip-pill__bar--glide/);
  const glide = await page.getByTestId("pill-bar").locator("i").evaluate((i) => i.getAnimations().filter((a) => a.playState === "running").length);
  expect(glide, "the glide is not running").toBe(0);
  job.release();
  await expect(page.getByTestId("processing")).toHaveAttribute("data-progress", "work");
  const spin = await page.getByTestId("pill-spinner").evaluate((s) => getComputedStyle(s).animationName);
  expect(spin, "the spinner pulses").toBe("ip-pulse");
  await page.waitForTimeout(5000);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => ((a as CSSAnimation).animationName ?? "") + " on " + ((a.effect as KeyframeEffect | null)?.target as Element | null)?.className),
  );
  expect(running.every((r) => r.startsWith("ip-pulse")), `only the spinner's pulse runs: ${running.join(", ")}`).toBe(true);
});

// ---- Server phases (AC-637, AC-638) -------------------------------------------------------------

type MockOpts = { queue?: number[]; eta?: number; hold?: "queue"; deleteStatus?: number; fail?: string };

/**
 * Mocks `/api/jobs`: POST answers `{ id }`, each GET steps through the queue positions, then working
 * 50%, then done with a result URL serving the fixture's bytes. `hold: "queue"` stays at the first
 * position until `release()`. DELETE answers `deleteStatus` (default 204).
 */
async function mockJobs(page: Page, { queue = [25, 3, 1], eta, hold, deleteStatus = 204, fail }: MockOpts = {}) {
  const pdf = await readFile(fx("three-pages.pdf"));
  const calls = { post: 0, get: 0, del: 0 };
  let step = 0;
  let held = !!hold;
  const steps = [...queue.map((position) => ({ state: "queued", position, ...(eta ? { etaSeconds: eta } : {}) })), { state: "working", progress: 0.5 }, fail ? { state: "failed", message: fail } : { state: "done", url: "/api/jobs/j1/result", name: "three-pages-compressed.pdf" }];
  await page.route("**/api/jobs**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST" && path === "/api/jobs") {
      calls.post++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "j1" }) });
    }
    if (req.method() === "DELETE" && path === "/api/jobs/j1") {
      calls.del++;
      return route.fulfill({ status: deleteStatus, body: "" });
    }
    if (path === "/api/jobs/j1/result") return route.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
    if (req.method() === "GET" && path === "/api/jobs/j1") {
      calls.get++;
      const s = steps[Math.min(step, steps.length - 1)];
      if (!held) step++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(s) });
    }
    return route.fallback();
  });
  return {
    calls,
    release() {
      held = false;
      step = Math.max(step, queue.length);
    },
  };
}

test("AC-637: server phases step through upload, queue (#25, #3, #1), work and done; the second line says to keep the tab open", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  const job = await mockJobs(page);
  await openTool(page, "/test-fixtures/settings-tool?server=1");
  await expect(page.getByTestId("privacy-intro")).toHaveText("Uploaded securely, deleted after 2 hours.");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await watchPill(page);
  await primary(page).click();
  await expect(page.getByTestId("queue-position")).toHaveText("#25");
  await expect(page.getByTestId("processing")).toContainText("Keep this tab open.");
  await expect(page.getByTestId("processing")).not.toContainText("About");
  await expect(page.getByTestId("processing").getByRole("progressbar")).toHaveAttribute("aria-valuetext", /25/);
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 10_000 });
  const { phases } = await pillLog(page);
  expect(phases).toEqual(["upload", "queue", "work", "done"]);
  expect(job.calls.post).toBe(1);
  expect(job.calls.del).toBe(0);
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
});

test("AC-637: an estimate shows 'About 2 min'; Cancel in the queue sends one DELETE and says the upload was deleted", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  const job = await mockJobs(page, { eta: 120, hold: "queue" });
  await openTool(page, "/test-fixtures/settings-tool?server=1");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await primary(page).click();
  await expect(page.getByTestId("queue-position")).toHaveText("#25");
  await expect(page.getByTestId("processing")).toContainText("About 2 min. Keep this tab open.");
  await page.getByTestId("processing").getByRole("button", { name: "Cancel" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("notice")).toContainText("Cancelled. Your upload was deleted.");
  expect(job.calls.del).toBe(1);
  // Polling stopped at once.
  const gets = job.calls.get;
  await page.waitForTimeout(700);
  expect(job.calls.get).toBe(gets);
});

test("AC-637: when DELETE fails, Cancel says the upload will be deleted within 2 hours", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  const job = await mockJobs(page, { hold: "queue", deleteStatus: 500 });
  await openTool(page, "/test-fixtures/settings-tool?server=1");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await primary(page).click();
  await expect(page.getByTestId("queue-position")).toHaveText("#25");
  await page.getByTestId("processing").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("notice")).toContainText("Cancelled. Your upload will be deleted within 2 hours.");
  expect(job.calls.del).toBe(1);
});

test("AC-638: a failed job puts the danger line and Try again in the slot (focused), the full message in a notice, the slot box unchanged", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  await mockJobs(page, { queue: [1], fail: "Server tools are paused until tomorrow." });
  await openTool(page, "/test-fixtures/settings-tool?server=1");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  const before = (await page.getByTestId("action-slot").boundingBox())!;
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "error", { timeout: 10_000 });
  const slot = page.getByTestId("action-slot");
  await expect(slot.getByTestId("process-error")).toBeVisible();
  await expect(slot.getByRole("button", { name: "Try again" })).toBeFocused();
  await expect(page.getByTestId("notice")).toContainText("Server tools are paused until tomorrow.");
  const after = (await slot.boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(after[k] - before[k])).toBeLessThanOrEqual(0.5);
});

test("AC-638: a job that fails on Delete puts the danger line and Try again (focused) in the slot, the reason in a notice", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "one run is enough");
  // Fault injection as in F1 AC-46: the processing worker throws on its first message, as on a damaged file.
  await page.route(/\/_next\/static\/chunks\/instapdf-processing\.[^/]*\.js(\?.*)?$/, (r) =>
    r.fulfill({ contentType: "application/javascript", body: "self.onmessage = () => { throw new Error('QA injected fault'); };" }),
  );
  await openTool(page, "/delete-pdf-pages");
  await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.locator("[data-tile-button][aria-pressed]").first().click();
  const before = (await page.getByTestId("action-slot").boundingBox())!;
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "error", { timeout: 10_000 });
  const slot = page.getByTestId("action-slot");
  await expect(slot.getByTestId("process-error")).toBeVisible();
  await expect(slot.getByRole("button", { name: "Try again" })).toBeFocused();
  await expect(page.getByTestId("notice").getByRole("button", { name: "Start over" })).toBeVisible();
  const after = (await slot.boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(after[k] - before[k])).toBeLessThanOrEqual(0.5);
});
