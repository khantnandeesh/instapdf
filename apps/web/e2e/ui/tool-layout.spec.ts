/**
 * F25 tool layout standard (docs/specs/f25-tool-layout-standard.md): AC-600–602, 605, 610–613, 615 and
 * 644–646 for every usable registry tool, and the §10 build screenshots (AC-656), saved to
 * docs/specs/assets/f25/ when SHOTS=1 (`SHOTS=1 npx playwright test e2e/ui/tool-layout.spec.ts -g shots`).
 */
import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { isUsable, tools } from "../../src/tools/registry";
import { flow, fx, primary } from "../support/flow";

const usable = tools.filter((t) => isUsable(t) && t.flow);
const SECOND_FILE: Record<string, string> = { "alternate-mix-pdf": "three-pages.pdf" };
const load = (page: Page, slug: string) => page.getByTestId("file-input").setInputFiles(SECOND_FILE[slug] ? [fx("sixty-pages.pdf"), fx(SECOND_FILE[slug])] : fx("sixty-pages.pdf"));

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated], [data-testid=editor][data-hydrated]").first()).toBeVisible();
}

async function inView(page: Page, el: Locator, what: string) {
  await expect(el, what).toBeVisible();
  const b = (await el.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.y, `${what}: top`).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, `${what}: bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  expect(b.x + b.width, `${what}: right`).toBeLessThanOrEqual(vp.width + 0.5);
  const hit = await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (n === h || n.contains(h));
  });
  expect(hit, `${what}: not covered`).toBe(true);
}

/** Makes the primary runnable where it waits for a choice (Extract, Delete: mark a page). */
async function runnable(page: Page) {
  if (await primary(page).isEnabled()) return;
  await page.locator("[data-tile-button][aria-pressed]").first().click();
  await expect(primary(page)).toBeEnabled();
}

const VIEWPORTS: [number, number][] = [
  [1280, 632],
  [1366, 657],
  [390, 664],
  [320, 568],
];

test.describe("F25 structure", () => {
  test.skip(!!process.env.SHOTS, "screenshots run on their own");
  for (const [width, height] of VIEWPORTS) {
    test(`AC-600 AC-601 AC-602: at ${width}x${height} every tool opens on the picker card alone, the editor included`, async ({ page }, info) => {
      test.skip(info.project.name !== (width >= 1024 ? "desktop" : "mobile"), "desktop sizes on desktop, phones on mobile");
      await page.setViewportSize({ width, height });
      for (const path of [...usable.map((t) => `/${t.slug}`), "/edit-pdf"]) {
        await open(page, path);
        await expect(page.getByTestId("drop-card"), path).toHaveCount(1);
        await expect(page.locator("[data-ip-dock]"), path).toHaveCount(0);
        await expect(page.getByTestId("primary-action"), path).toHaveCount(0);
        await expect(page.getByTestId("dock-status"), path).toHaveCount(0);
        await expect(page.locator(".ed-top, .ed-rail, [data-testid=editor-strip], [data-testid=dock]"), path).toHaveCount(0);
        const card = page.getByTestId("drop-card");
        const picker = card.getByRole("button").first();
        await inView(page, picker, `${path}: picker`);
        await expect(picker, path).toHaveAccessibleName(/^Choose /);
        // Order inside the card: picker, hint, limits, privacy.
        const order = await card.evaluate((c) => {
          const y = (sel: string) => c.querySelector(sel)?.getBoundingClientRect().top ?? -1;
          return [y("button"), y("[data-testid=limits]"), y("[data-testid=privacy-intro]")];
        });
        expect(order[0], `${path}: picker first`).toBeGreaterThanOrEqual(0);
        if (order[1] >= 0) expect(order[1], `${path}: limits after the picker`).toBeGreaterThan(order[0]);
        expect(order[2], `${path}: privacy last`).toBeGreaterThan(Math.max(order[0], order[1]));
        expect(await page.evaluate(() => document.body.innerText.includes("Opening…")), `${path}: no "Opening…"`).toBe(false);
      }
    });
  }

  for (const [width, height] of [
    [1024, 768],
    [1280, 632],
    [1366, 657],
    [1920, 969],
  ] as const) {
    test(`AC-610 AC-613 AC-615: at ${width}x${height} h1, options, status and primary share one 64px row under the header; the stage fills the rest`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "desktop sizes");
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height });
      for (const t of usable) {
        await open(page, `/${t.slug}`);
        await load(page, t.slug);
        await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
        const row = page.getByTestId("tool-intro");
        const dock = page.locator("[data-ip-dock]");
        await expect(dock, t.slug).toHaveAttribute("data-ip-dock", "row");
        expect(await dock.evaluate((d) => !!d.closest("[data-testid=tool-intro]")), `${t.slug}: the dock lives in the row`).toBe(true);
        const r = (await row.boundingBox())!;
        const header = await page.evaluate(() => document.querySelector(".ip-site-header")!.getBoundingClientRect().bottom);
        expect(Math.abs(r.y - header), `${t.slug}: the row's top is the header's bottom`).toBeLessThanOrEqual(1);
        expect(Math.round(r.height), `${t.slug}: 64px row`).toBe(64);
        for (const [what, el] of [
          ["h1", page.getByRole("heading", { level: 1 })],
          ["status", page.getByTestId("dock-status")],
          ["primary", primary(page)],
        ] as const) {
          const b = (await el.boundingBox())!;
          expect(b.y, `${t.slug}: ${what} in the row`).toBeGreaterThanOrEqual(r.y - 1);
          expect(b.y + b.height, `${t.slug}: ${what} in the row`).toBeLessThanOrEqual(r.y + r.height + 1);
        }
        // AC-615: never wraps, never scrolls sideways; the h1 is one line.
        expect(await dock.evaluate((d) => d.scrollWidth - d.clientWidth), `${t.slug}: row scrolls sideways`).toBeLessThanOrEqual(0);
        const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
        expect(h1.height, `${t.slug}: h1 on one line`).toBeLessThanOrEqual(30);
        expect(await page.getByRole("heading", { level: 1 }).evaluate((h) => h.scrollWidth - h.clientWidth), `${t.slug}: h1 not truncated`).toBeLessThanOrEqual(0);
        // AC-613: the stage height and no bottom bar.
        expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ip-dock-actual")), `${t.slug}: --ip-dock-actual unset`).toBe("");
        expect(await page.locator("[data-ip-dock=bar]").count()).toBe(0);
        const want = height - header - 64 - 16;
        const stage = await page.getByTestId("pages-scroll").evaluate((p) => {
          let n = p as HTMLElement | null;
          while (n && !n.className.includes("h-(--ip-stage-h)") && n.dataset.ipOptions !== "side") n = n.parentElement;
          return (n ?? p).getBoundingClientRect().height;
        });
        expect(Math.abs(stage - Math.max(320, want)), `${t.slug}: stage height`).toBeLessThanOrEqual(1.5);
      }
    });
  }

  test("AC-611: the row stays pinned with the same look after scrolling to the tool guide; the primary stays in view", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    for (const [width, height] of [
      [1280, 632],
      [1366, 657],
    ] as const) {
      await page.setViewportSize({ width, height });
      await open(page, "/delete-pdf-pages");
      await load(page, "delete-pdf-pages");
      await expect(flow(page)).toHaveAttribute("data-state", "ready");
      const look = () => page.getByTestId("tool-intro").evaluate((r) => ({ shadow: getComputedStyle(r).boxShadow, border: getComputedStyle(r).borderBottomWidth + getComputedStyle(r).borderTopWidth }));
      const rest = await look();
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const header = await page.evaluate(() => document.querySelector(".ip-site-header")!.getBoundingClientRect().bottom);
      const r = (await page.getByTestId("tool-intro").boundingBox())!;
      expect(Math.abs(r.y - header)).toBeLessThanOrEqual(1);
      expect(await look()).toEqual(rest);
      await inView(page, primary(page), "primary (pinned)");
    }
  });

  for (const [width, height] of [
    [320, 568],
    [390, 664],
    [768, 1024],
  ] as const) {
    test(`AC-612: at ${width}x${height} the row holds only the h1 and the dock is fixed to the bottom`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "phones");
      await page.setViewportSize({ width, height });
      for (const slug of ["delete-pdf-pages", "merge-pdf", "split-pdf"]) {
        await open(page, `/${slug}`);
        await load(page, slug);
        await expect(flow(page)).toHaveAttribute("data-state", "ready");
        const focusables = await page.getByTestId("tool-intro").evaluate((r) => r.querySelectorAll("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])").length);
        expect(focusables, `${slug}: nothing focusable in the row`).toBe(0);
        const dock = page.locator("[data-ip-dock]");
        await expect(dock).toHaveAttribute("data-ip-dock", "bar");
        expect(await dock.evaluate((d) => getComputedStyle(d).position)).toBe("fixed");
        const b = (await dock.boundingBox())!;
        expect(Math.abs(b.y + b.height - height)).toBeLessThanOrEqual(1);
      }
    });
  }

  test("AC-605: the picker label never changes after a pick, and the editor shows its layout before the first page is drawn", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    await open(page, "/edit-pdf");
    const label = await page.getByTestId("drop-card").getByRole("button").first().textContent();
    // Hold the first render so the "opening" layout can be seen.
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] };
      w.__seen = [];
      new MutationObserver(() => {
        const e = document.querySelector("[data-testid=editor]");
        const s = e?.getAttribute("data-state") ?? "";
        if (w.__seen.at(-1) !== s) w.__seen.push(s);
        if (document.body.innerText.includes("Opening…")) w.__seen.push("OPENING-TEXT");
      }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await page.getByTestId("editor-input").setInputFiles("../../tests/parity/editor/report-form-3p.pdf");
    await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen).not.toContain("OPENING-TEXT");
    if (seen.includes("opening")) expect(seen.indexOf("opening")).toBeLessThan(seen.indexOf("open"));
    expect(label).toBe("Choose PDF");
  });

  test("AC-644 AC-646: after a run on Delete at 1366x657 the result fills the stage, the preview is >= 85% tall, everything is on screen and Download is in the slot", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    await page.setViewportSize({ width: 1366, height: 657 });
    await open(page, "/delete-pdf-pages");
    await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    await runnable(page);
    const slotBox = (await primary(page).boundingBox())!;
    await primary(page).click();
    await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("result").evaluate((r) => Promise.all(r.getAnimations({ subtree: true }).map((a) => a.finished)));
    const result = (await page.getByTestId("result").boundingBox())!;
    const canvas = page.getByTestId("result-preview");
    await expect(canvas).toBeVisible();
    const c = (await canvas.boundingBox())!;
    expect(c.height / result.height, "preview >= 85% of the stage").toBeGreaterThanOrEqual(0.85 * ((result.height - 40) / result.height));
    for (const [what, el] of [
      ["title", page.getByTestId("result").getByRole("heading", { level: 2 })],
      ["name", page.getByTestId("result-name")],
      ["Download", page.getByRole("link", { name: "Download" })],
      ["Back to editing", page.getByRole("button", { name: "Back to editing" })],
      ["Start over", page.getByRole("button", { name: "Start over" })],
    ] as const)
      await inView(page, el, what);
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(1);
    const dl = (await page.getByRole("link", { name: "Download" }).boundingBox())!;
    expect(dl.y + dl.height, "Download in the row's slot").toBeLessThanOrEqual(slotBox.y + slotBox.height + 1);
    expect(Math.abs(dl.x + dl.width - (slotBox.x + slotBox.width)), "same right edge as the primary").toBeLessThanOrEqual(1);
    await expect(page.getByRole("link", { name: "Download" })).toBeFocused();
    await expect(page.locator("[data-ip-dock] [data-testid=dock-options]")).toHaveCount(0);
  });

  for (const [width, height] of [
    [390, 664],
    [320, 568],
  ] as const) {
    test(`AC-645: at ${width}x${height} Download is in the bottom dock, focused, and the preview is as wide as the stage`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "phones");
      await page.setViewportSize({ width, height });
      await open(page, "/delete-pdf-pages");
      await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
      await expect(flow(page)).toHaveAttribute("data-state", "ready");
      await runnable(page);
      await primary(page).click();
      await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
      const link = page.locator("[data-ip-dock=bar]").getByRole("link", { name: "Download" });
      await inView(page, link, "Download");
      await expect(link).toBeFocused();
      await expect(page.getByRole("link", { name: "Download" })).toHaveCount(1);
      const box = (await page.getByTestId("result-preview-box").boundingBox())!;
      const stage = (await page.getByTestId("result").boundingBox())!;
      expect(Math.abs(box.width - stage.width)).toBeLessThanOrEqual(2);
      expect(box.height).toBeLessThanOrEqual(height * 0.55 + 1);
    });
  }
});

// ---- §10 screenshots (AC-656) ----------------------------------------------------------------------

const OUT = "../../docs/specs/assets/f25";

/** Holds every request matching `pattern` until `release()`. */
async function hold(page: Page, pattern: RegExp) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(pattern, async (route) => {
    await gate;
    // A worker terminated while held (Cancel) has already dropped its request.
    await route.continue().catch(() => {});
  });
  return { release: () => open(), stop: () => page.unroute(pattern) };
}

async function shot(page: Page, name: string, [w, h]: [number, number]) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}-${w}x${h}.png`, animations: "disabled", caret: "hide" });
}

async function moreOptions(page: Page) {
  for (const id of ["more-options", "options-button"]) {
    const b = page.getByTestId(id);
    if ((await b.count()) && (await b.first().isVisible())) {
      await b.first().click();
      await expect(page.getByTestId("more-options-dialog").or(page.getByTestId("options-popover")).or(page.getByTestId("options-sheet")).first()).toBeVisible();
      return true;
    }
  }
  return false;
}
async function closeMore(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("more-options-dialog").or(page.getByTestId("options-popover")).or(page.getByTestId("options-sheet"))).toHaveCount(0);
}

const SHOT_TOOLS: { name: string; path: string; files: string[] }[] = [
  { name: "delete", path: "/delete-pdf-pages", files: ["sixty-pages.pdf"] },
  { name: "split", path: "/split-pdf", files: ["twelve.pdf"] },
  { name: "merge", path: "/merge-pdf", files: ["alpha.pdf", "bravo.pdf", "three-pages.pdf"] },
  { name: "alternate", path: "/alternate-mix-pdf", files: ["odd.pdf", "even.pdf"] },
  { name: "settings", path: "/test-fixtures/settings-tool", files: ["three-pages.pdf"] },
];

test.describe("shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture the §10 screenshots");
  test.use({ deviceScaleFactor: 2 });
  test.beforeAll(() => mkdir(OUT, { recursive: true }));

  for (const vp of VIEWPORTS) {
    for (const t of SHOT_TOOLS) {
      test(`shots ${t.name} ${vp[0]}x${vp[1]}`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "one engine; the viewport is set per test");
        test.setTimeout(120_000);
        await page.setViewportSize({ width: vp[0], height: vp[1] });
        await open(page, t.path);
        await shot(page, `${t.name}-empty`, vp);
        // Loading: hold the file scanner.
        const scan = await hold(page, /instapdf-scan\.[^/]*\.js/);
        await page.getByTestId("file-input").setInputFiles(t.files.map(fx));
        await expect(flow(page)).toHaveAttribute("data-state", "loading");
        await shot(page, `${t.name}-loading`, vp);
        scan.release();
        await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
        await scan.stop();
        await runnable(page);
        await page.waitForTimeout(400);
        await shot(page, `${t.name}-ready`, vp);
        if (await moreOptions(page)) {
          await page.waitForTimeout(250);
          await shot(page, `${t.name}-more-options`, vp);
          await closeMore(page);
        }
        // Working, then cancelled: hold the processing worker (the fixture's stub is slow on its own).
        const work = await hold(page, /instapdf-processing\.[^/]*\.js/);
        await primary(page).click();
        await expect(page.getByTestId("processing")).toBeVisible();
        if (t.name === "settings") await expect(page.getByTestId("processing")).toContainText(/[1-9]\d?%/);
        await shot(page, `${t.name}-working`, vp);
        await page.getByTestId("processing").getByRole("button", { name: "Cancel" }).click();
        await expect(flow(page)).toHaveAttribute("data-state", "ready");
        await expect(page.getByTestId("notice")).toBeVisible();
        await shot(page, `${t.name}-cancelled`, vp);
        work.release();
        await work.stop();
        await page.getByTestId("notice").getByRole("button", { name: /Dismiss|Close/ }).first().click().catch(() => {});
        // Done tick, then the result.
        await primary(page).click();
        await expect(page.locator("[data-testid=processing][data-progress=done]")).toBeVisible({ timeout: 30_000 });
        await shot(page, `${t.name}-done`, vp);
        await expect(page.getByTestId("result")).toBeVisible({ timeout: 10_000 });
        await page.getByTestId("result").evaluate((r) => Promise.all(r.getAnimations({ subtree: true }).map((a) => a.finished)));
        await page.waitForTimeout(300);
        await shot(page, `${t.name}-result`, vp);
      });
    }

    test(`shots settings server phases ${vp[0]}x${vp[1]}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "one engine");
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      let release!: () => void;
      const posted = new Promise<void>((r) => (release = r));
      let get = 0;
      let failing = false;
      await page.route("**/api/jobs**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (req.method() === "POST") {
          await posted;
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "j1" }) });
        }
        if (req.method() === "DELETE") return route.fulfill({ status: 204, body: "" });
        if (path === "/api/jobs/j1") {
          get++;
          const body = failing ? { state: "failed", message: "Server tools are paused until tomorrow. Try again then." } : { state: "queued", position: 3, etaSeconds: 120 };
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        }
        return route.fallback();
      });
      await open(page, "/test-fixtures/settings-tool?server=1");
      await page.getByTestId("file-input").setInputFiles(fx("three-pages.pdf"));
      await expect(flow(page)).toHaveAttribute("data-state", "ready");
      await primary(page).click();
      await expect(page.locator("[data-testid=processing][data-progress=upload]")).toBeVisible();
      await shot(page, "settings-uploading", vp);
      release();
      await expect(page.getByTestId("queue-position")).toHaveText("#3");
      await shot(page, "settings-queue", vp);
      failing = true;
      await expect(flow(page)).toHaveAttribute("data-state", "error", { timeout: 10_000 });
      await page.waitForTimeout(300);
      await shot(page, "settings-error", vp);
      expect(get).toBeGreaterThan(0);
    });

    test(`shots edit-pdf ${vp[0]}x${vp[1]}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "one engine");
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      // Held from the start: the build worker may be warmed while idle, before Download is pressed.
      const build = await hold(page, /berry-build\.[^/]*\.js/);
      await open(page, "/edit-pdf");
      await shot(page, "edit-pdf-empty", vp);
      await page.getByTestId("editor-input").setInputFiles("../../tests/parity/editor/report-form-3p.pdf");
      await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
      await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
      await page.waitForTimeout(400);
      await shot(page, "edit-pdf-open", vp);
      await page.getByTestId("canvas").focus();
      await page.keyboard.press("t");
      const b = (await page.getByTestId("page-1").boundingBox())!;
      await page.mouse.click(b.x + b.width * 0.3, b.y + Math.min(b.height * 0.3, 240));
      await page.keyboard.type("Signed by A. Rao");
      await page.getByTestId("text-input").press("Escape");
      await page.keyboard.press("v");
      await page.getByRole("group", { name: /Signed by A\. Rao/ }).click();
      await page.waitForTimeout(300);
      await shot(page, "edit-pdf-selection", vp);
      await page.keyboard.press("Escape");
      const downloaded = page.waitForEvent("download", { timeout: 30_000 });
      await page.getByRole("button", { name: "Download PDF" }).click();
      await expect(page.getByTestId("processing")).toBeVisible();
      await shot(page, "edit-pdf-downloading", vp);
      build.release();
      await downloaded;
      await expect(page.getByTestId("download")).toHaveText("Downloaded");
      await page.waitForTimeout(300);
      await shot(page, "edit-pdf-downloaded", vp);
      await build.stop();
    });
  }
});
