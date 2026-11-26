/**
 * Motion guards (docs/design/motion.md §7), at a phone (390x844) and a laptop (1280x720) size:
 *
 * 1. The motion engine (GSAP, a lazy chunk) is not fetched before the first sign of intent or 4s, and is
 *    fetched once afterwards.
 * 2. Under reduced motion no open, close or filter leaves a non-identity inline transform behind.
 * 3. A click on a menu item, and on Download, during its entrance acts on the first try.
 * 4. Opening and closing the All tools menu, a dialog and a menu, filtering, and adding files record no
 *    layout shift.
 * 5. Exits happen: the first frame after Escape comes within 200ms; the All tools menu, a dialog and a menu are still shown on it, and gone
 *    within 200ms of that frame plus one measured frame, and within 400ms of the key end to end; their configured lengths are within the preset's.
 * 6. No securitypolicyviolation event fires (every test).
 * 7. Nothing is animating on a tool page 5s after load (WCAG 2.2.2).
 * 8. Each Escape exit puts focus back on the trigger, and the leaving part is inert and aria-hidden while
 *    it is still painted (the All tools menu, a menu, a dialog).
 * 9. Reopening mid-exit leaves the parts settled and interactive (Dialog; usePresence via the All tools panel),
 *    and the panel's scrim keeps its own aria-hidden.
 * 10. Focus never drops to <body> while the work area leaves for the result, and back (review S1, T12).
 */
import { expect, test, type Page } from "@playwright/test";
import { cardAction, fx } from "../support/flow";

const SIZES = [
  { name: "phone", width: 390, height: 844, project: "mobile" },
  { name: "desktop", width: 1280, height: 720, project: "desktop" },
] as const;

/** Text only the engine chunk carries (its licence notice, lib/motion/engine.ts). */
const ENGINE_MARK = "gsap.com/standard-license";

/** Counts the engine chunk's downloads: resolves each script response's body once. `urls` gets each one's URL. */
function watchEngine(page: Page, urls: string[] = []) {
  const hits: number[] = [];
  const t0 = Date.now();
  page.on("response", async (r) => {
    if (!/\/_next\/static\/chunks\/.+\.js(\?|$)/.test(r.url())) return;
    const at = Date.now() - t0;
    const body = await r.text().catch(() => "");
    if (!body.includes(ENGINE_MARK)) return;
    hits.push(at);
    urls.push(r.url());
  });
  return hits;
}

/**
 * Page-clock marks for test 1: when the intent listeners were attached (MotionPrime's onIntent adds its
 * capture listeners on window; on the home page nothing else adds a capture "dragenter" there), and when
 * the first pointerdown happened.
 */
function markIntent(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { intentArmedAt?: number; firstPointerAt?: number };
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      const capture = typeof opts === "boolean" ? opts : !!opts?.capture;
      if (type === "dragenter" && capture && w.intentArmedAt === undefined) w.intentArmedAt = performance.now();
      return add(type, fn, opts);
    }) as typeof window.addEventListener;
    add("pointerdown", (e) => void (w.firstPointerAt ??= e.timeStamp), { capture: true });
  });
}

/**
 * Waits until the engine has been fetched and evaluated (after an intent), so exits animate. The intent is
 * repeated while it isn't: on a slow CPU the first one can land before hydration, when nothing listens yet.
 */
async function primeEngine(page: Page, hits: number[]) {
  const loaded = () => page.evaluate(() => "__motionLive" in window);
  for (let i = 0; i < 6 && !(await loaded()); i++) {
    await page.mouse.move(2, 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(loaded, { timeout: 5_000 }).toBe(true).catch(() => {});
  }
  expect(await loaded(), "the motion engine loaded").toBe(true);
  await expect.poll(() => hits.length, { message: "the engine chunk was fetched" }).toBeGreaterThan(0);
}

/** E2E_CPU_THROTTLE=4 runs these guards on a CPU slowed 4x (Chromium), to prove the gates hold under load. */
const THROTTLE = Number(process.env.E2E_CPU_THROTTLE ?? 0);

test.beforeEach(async ({ page }) => {
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.addInitScript(() => {
    const w = window as unknown as {
      csp: string[];
      shifts: { value: number; input: boolean; t: number }[];
    };
    w.csp = [];
    w.shifts = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      w.csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          startTime: number;
        }[])
          w.shifts.push({
            value: e.value,
            input: e.hadRecentInput,
            t: e.startTime,
          });
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // not supported
    }
  });
});

test.afterEach(async ({ page }) => {
  // Rule 6.
  const csp = await page
    .evaluate(() => (window as unknown as { csp?: string[] }).csp ?? [])
    .catch(() => []);
  expect(csp, "securitypolicyviolation events").toEqual([]);
});

/** Starts counting layout shifts from now. */
const resetShifts = (page: Page) =>
  page.evaluate(
    () => ((window as unknown as { shifts: unknown[] }).shifts.length = 0),
  );
/** Layout shifts that count (CLS): a shift right after the visitor's own input is excused, as the browser does. */
const shifts = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { shifts: { value: number; input: boolean }[] }
    ).shifts
      .filter((s) => !s.input)
      .map((s) => s.value),
  );

/** Elements with an inline transform that isn't the identity. */
const strayTransforms = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[style*=transform]")]
      .filter((el) => {
        const t = el.style.transform;
        if (!t || t === "none") return false;
        const m = new DOMMatrix(
          getComputedStyle(el).transform === "none"
            ? undefined
            : getComputedStyle(el).transform,
        );
        return !m.isIdentity;
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className} ${el.style.transform}`,
      ),
  );

/** What armExitWatch records (ms after the Escape keydown, on the rAF clock). */
type ExitWatch = {
  afterFrame?: boolean;
  lastShown?: number;
  /** The first frame after the key (ms after it): input latency, kept apart from the exit's length. */
  firstFrame?: number;
  exitGap?: number;
  /** Each frame's time after the key (ms), for the failure message. */
  frames?: number[];
  done?: boolean;
  cssMs?: number;
  tweenMs?: number;
};

/**
 * Arms a watcher for the next Escape. Everything is on one clock: the keydown's timeStamp and the
 * requestAnimationFrame timestamps. It records whether the part is still shown on the first frame after
 * the key and when that frame came (firstFrame), the last frame it was shown (lastShown, ms after the key), the gap between that frame and the
 * first frame where it is gone (exitGap: the exit ended somewhere inside it), and the configured lengths of the exit
 * on that first frame: the leaving element's CSS transitions and lib/motion tweens on it.
 */
async function armExitWatch(page: Page, kind: "tool-menu" | "dialog" | "menu") {
  await page.evaluate((kind) => {
    const w = window as unknown as {
      exitWatch?: ExitWatch;
      __motionTweens?: { ms: number; targets: Element[] }[];
    };
    const menu =
      kind === "menu"
        ? (document.querySelector(".mp-menu[popover]:popover-open") ??
          document.querySelector(".mp-menu[popover]"))
        : null;
    const shown = () => {
      if (kind === "tool-menu") {
        const el = document.querySelector("[data-testid=tool-menu]");
        return (
          !!el &&
          el.closest("dialog")?.open !== false &&
          getComputedStyle(el).visibility !== "hidden"
        );
      }
      if (kind === "dialog")
        return [...document.querySelectorAll("dialog")].some(
          (d) => d.open || getComputedStyle(d).display !== "none",
        );
      return (
        !!menu && menu.isConnected && getComputedStyle(menu).display !== "none"
      );
    };
    const leaving = (): Element | null =>
      kind === "tool-menu"
        ? document.querySelector("[data-testid=tool-menu]")
        : kind === "dialog"
          ? document.querySelector("dialog[data-leaving]")
          : menu;
    const longestCss = (el: Element | null) => {
      if (!el) return -1;
      const cs = getComputedStyle(el);
      const secs = (v: string) => v.split(",").map((x) => parseFloat(x) || 0);
      const d = secs(cs.transitionDuration);
      const delay = secs(cs.transitionDelay);
      return Math.max(0, ...d.map((x, i) => (x + (delay[i % delay.length] ?? 0)) * 1000));
    };
    const longestTween = (el: Element | null) =>
      Math.max(
        -1,
        ...(w.__motionTweens ?? [])
          .filter((t) => !!el && t.targets.includes(el))
          .map((t) => t.ms),
      );
    w.exitWatch = {};
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        const watch = w.exitWatch!;
        const t0 = e.timeStamp;
        let lastShownTs = t0;
        watch.frames = [];
        const frame = (ts: number) => {
          watch.frames!.push(Math.round(ts - t0));
          const on = shown();
          if (watch.afterFrame === undefined) {
            watch.firstFrame = ts - t0;
            watch.afterFrame = on;
            const el = leaving();
            watch.cssMs = longestCss(el);
            watch.tweenMs = longestTween(el);
          }
          if (on) {
            watch.lastShown = ts - t0;
            lastShownTs = ts;
            requestAnimationFrame(frame);
          } else {
            // Only the one gap the exit ended in: from the last shown frame to the first gone one.
            watch.exitGap = ts - lastShownTs;
            watch.done = true;
          }
        };
        requestAnimationFrame(frame);
      },
      { capture: true, once: true },
    );
  }, kind);
}

/**
 * The exit gate: the first frame after Escape within 200ms of it (input latency) and the part still shown
 * on it; the exit, from that frame to the last shown one, within 200ms less the gap to the first gone
 * frame; the last shown frame within 400ms of the key end to end; and its configured lengths within the preset's
 * (`limitMs` for the CSS hold and the tween; `tween` says whether a lib/motion tween runs it).
 */
async function expectExit(page: Page, what: string, limitMs: number, tween: boolean) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { exitWatch: ExitWatch }).exitWatch.done,
        ),
      { message: `${what} goes` },
    )
    .toBe(true);
  const r = await page.evaluate(
    () => (window as unknown as { exitWatch: Required<ExitWatch> }).exitWatch,
  );
  expect(
    r.afterFrame,
    `${what} is still shown the frame after Escape (it exits, not vanishes)`,
  ).toBe(true);
  const frames = `frames at ${r.frames.join(", ")}ms after Escape`;
  // Input latency on its own: a blocked main thread fails here, not as a slow animation.
  expect(r.firstFrame, `${what}: the first frame after Escape comes within 200ms of it (${frames})`).toBeLessThanOrEqual(200);
  // The exit itself runs from the first frame after the key.
  const exit = r.lastShown - r.firstFrame;
  expect(
    exit - r.exitGap,
    `${what}: last shown frame ${exit.toFixed(1)}ms after the first frame, less the gap to the first gone frame ${r.exitGap.toFixed(1)}ms, is within 200ms (${frames})`,
  ).toBeLessThanOrEqual(200);
  // End to end (motion.md: 400ms), from the key, latency included.
  expect(r.lastShown, `${what}: last shown frame ${r.lastShown.toFixed(1)}ms after Escape is within the 400ms end-to-end cap (${frames})`).toBeLessThanOrEqual(400);
  expect(r.cssMs, `${what}: configured CSS transition length`).toBeLessThanOrEqual(limitMs);
  if (tween) {
    expect(r.tweenMs, `${what}: a lib/motion tween runs the exit`).toBeGreaterThan(0);
    expect(r.tweenMs, `${what}: configured tween length`).toBeLessThanOrEqual(limitMs);
  }
}

type LeaveSample = { painted: boolean; inert: boolean; hidden: boolean; focusInside: boolean };

/**
 * Arms a watcher for the next Escape on the element `selector` finds. Two samples: `atHide`, taken the
 * moment it has become both inert and aria-hidden (a MutationObserver, so before any frame), and `frame`,
 * one frame after the key. Each records whether it is still painted and where focus is.
 */
async function armLeaveWatch(page: Page, selector: string) {
  await page.evaluate((selector) => {
    const w = window as unknown as { leaveWatch?: { found: boolean; atHide?: LeaveSample; frame?: LeaveSample } };
    const el = document.querySelector<HTMLElement>(selector);
    const sample = (): LeaveSample => {
      const cs = el && getComputedStyle(el);
      return {
        painted: !!el && el.isConnected && cs!.display !== "none" && cs!.visibility !== "hidden" && Number(cs!.opacity) > 0,
        inert: !!el?.closest("[inert]"),
        hidden: !!el?.closest("[aria-hidden=true]"),
        focusInside: !!el?.contains(document.activeElement),
      };
    };
    const watch: { found: boolean; atHide?: LeaveSample; frame?: LeaveSample } = { found: !!el };
    w.leaveWatch = undefined;
    if (!el) return void (w.leaveWatch = watch);
    const mo = new MutationObserver(() => {
      const s = sample();
      if (!s.inert || !s.hidden) return;
      watch.atHide = s;
      mo.disconnect();
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        mo.observe(el, { attributes: true, attributeFilter: ["inert", "aria-hidden"] });
        requestAnimationFrame(() => {
          watch.frame = sample();
          w.leaveWatch = watch;
        });
      },
      { capture: true, once: true },
    );
  }, selector);
}

async function expectLeaving(page: Page, what: string) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { leaveWatch?: unknown }).leaveWatch), { message: `${what}: watched` }).toBeDefined();
  const r = await page.evaluate(() => (window as unknown as { leaveWatch: { found: boolean; atHide?: LeaveSample; frame: LeaveSample } }).leaveWatch);
  expect(r.found, `${what}: found`).toBe(true);
  // It became inert and aria-hidden while it was still painted, with focus already out of it.
  expect(r.atHide, `${what}: inert and aria-hidden at the start of its exit`).toEqual({ painted: true, inert: true, hidden: true, focusInside: false });
  // And whenever it is still painted a frame later, it is still out of reach.
  if (r.frame.painted) expect(r.frame, `${what}, painted one frame after Escape`).toEqual({ painted: true, inert: true, hidden: true, focusInside: false });
  else expect(r.frame.focusInside, `${what}: focus is not inside it`).toBe(false);
}

/** What an exit can leave on an element (all empty once it is settled). */
const leftovers = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    return el && { opacity: el.style.opacity, transform: el.style.transform, inert: el.inert, ariaHidden: el.getAttribute("aria-hidden"), leaving: el.hasAttribute("data-leaving") };
  }, selector);

const SETTLED = { opacity: "", transform: "", inert: false, ariaHidden: null, leaving: false };

async function openMerge(page: Page) {
  await page.goto("/merge-pdf");
  await expect(
    page.locator("[data-testid=tool-flow][data-hydrated]"),
  ).toBeVisible();
}
async function addMergeFiles(page: Page) {
  await page
    .getByTestId("file-input")
    .setInputFiles(["alpha.pdf", "bravo.pdf"].map(fx));
  await expect(page.getByTestId("tool-flow")).toHaveAttribute(
    "data-state",
    "ready",
  );
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test.beforeEach(({}, info) => {
      test.skip(
        info.project.name !== size.project,
        `${size.name} size runs in the ${size.project} project`,
      );
    });

    test("1: the motion engine waits for intent (or 4s), then loads once", async ({
      page,
    }) => {
      const urls: string[] = [];
      const hits = watchEngine(page, urls);
      await markIntent(page);
      await page.goto("/");
      // One pointer event, sent as soon as the intent listeners are attached (no retries): the engine
      // request must follow it within about 1s, long before the 4s idle timer could fire.
      await expect.poll(() => page.evaluate(() => (window as unknown as { intentArmedAt?: number }).intentArmedAt), { message: "intent listeners attached" }).toBeDefined();
      expect(hits, "no engine before intent").toEqual([]);
      await page.mouse.move(2, 2);
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(() => urls.length, { message: "the engine chunk was requested", timeout: 4_000 }).toBeGreaterThan(0);
      const t = await page.evaluate((url) => {
        const w = window as unknown as { intentArmedAt: number; firstPointerAt?: number };
        const entry = performance.getEntriesByName(url)[0] as PerformanceResourceTiming | undefined;
        return { armed: w.intentArmedAt, pointer: w.firstPointerAt, request: entry?.startTime };
      }, urls[0]);
      expect(t.pointer, "the pointer event reached the page").toBeDefined();
      expect(t.request, "the engine request is in resource timing").toBeDefined();
      const sincePointer = t.request! - t.pointer!;
      expect(sincePointer, "requested after the pointer event, not before").toBeGreaterThanOrEqual(0);
      // About 1s; a CPU slowed by E2E_CPU_THROTTLE gets that many times longer.
      const within = 1_000 * Math.max(1, THROTTLE);
      expect(sincePointer, `requested ${sincePointer.toFixed(0)}ms after the pointer event (limit ${within}ms)`).toBeLessThanOrEqual(within);
      expect(t.request! - t.armed, "requested before the 4s idle timer could fire").toBeLessThan(4_000);
      await page.waitForTimeout(2500);
      expect(hits.length, "still fetched once after the idle timer's time").toBe(1);
      await page.getByRole("searchbox").first().focus();
      await page.keyboard.type("pdf");
      await page.waitForTimeout(1500);
      expect(hits.length, "fetched once").toBe(1);

      // Without any intent it comes after 4s.
      const idle = await page.context().newPage();
      const late = watchEngine(idle);
      await idle.goto("/merge-pdf");
      await idle.waitForTimeout(3000);
      expect(late, "no engine in the first 3s without intent").toEqual([]);
      await expect.poll(() => late.length, { timeout: 8000 }).toBe(1);
      await idle.close();
    });

    test("2: reduced motion leaves no transform behind", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const hits = watchEngine(page);
      await page.goto("/");
      await primeEngine(page, hits);
      // Filter.
      await page.getByRole("searchbox").first().fill("rot");
      await page.waitForTimeout(150);
      expect(await strayTransforms(page), "after filtering").toEqual([]);
      await page.getByRole("searchbox").first().fill("");
      // All tools open and close.
      await page.getByTestId("all-tools-button").first().click();
      await expect(page.getByTestId("tool-menu").first()).toBeVisible();
      await page.waitForTimeout(150);
      expect(await strayTransforms(page), "All tools open").toEqual([]);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      expect(await strayTransforms(page), "All tools closed").toEqual([]);
      // A tool's files, a menu and a dialog.
      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      await page.getByTestId("sort-menu").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      expect(await strayTransforms(page), "after a menu").toEqual([]);
    });

    test("3: a menu item and Download act on the first click, mid-entrance", async ({
      page,
    }) => {
      const hits = watchEngine(page);
      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      const before = await page.getByTestId("file-card").allTextContents();
      // Sort menu: click the item the moment it is there (no waiting for the entrance to end).
      await page.getByTestId("sort-menu").click();
      const item = page.getByRole("menuitem").last();
      await item.waitFor({ state: "attached" });
      const box = await item.boundingBox();
      expect(box, "menu item has a box at once").not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await expect(page.getByRole("menu")).toHaveCount(0);
      // The last item reverses the order.
      await expect
        .poll(() => page.getByTestId("file-card").allTextContents(), {
          message: "the menu item acted",
        })
        .toEqual([...before].reverse());

      // Download during the result card's entrance.
      await page.getByTestId("primary-action").click();
      const dl = page.getByRole("link", { name: "Download" });
      await expect(dl).toHaveAttribute("href", /^blob:/, { timeout: 30_000 });
      const b = await dl.boundingBox();
      const download = page.waitForEvent("download", { timeout: 5000 });
      await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
      expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    });

    test("4: overlays, filtering and adding files cause no layout shift", async ({
      page,
    }) => {
      const hits = watchEngine(page);
      await page.goto("/");
      await primeEngine(page, hits);
      await page.waitForTimeout(500);
      await resetShifts(page);
      // Typed (real key presses), as a visitor filters.
      await page.getByRole("searchbox").first().click();
      await page.keyboard.type("pdf to");
      await page.waitForTimeout(500);
      for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
      await page.waitForTimeout(500);
      expect(await shifts(page), "filtering").toEqual([]);
      await page.getByTestId("all-tools-button").first().click();
      await expect(page.getByTestId("tool-menu").first()).toBeVisible();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      expect(await shifts(page), "All tools").toEqual([]);

      await openMerge(page);
      await primeEngine(page, hits);
      await page.waitForTimeout(500);
      await resetShifts(page);
      await addMergeFiles(page);
      await page.waitForTimeout(500);
      // Adding files swaps the drop area for the file list (new content, not movement); nothing that was
      // already there may move afterwards.
      await resetShifts(page);
      await page.getByTestId("sort-menu").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      if (size.project === "desktop")
        await page.getByTestId("file-card").first().hover();
      await cardAction(page, "alpha.pdf", "Enlarge");
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      expect(await shifts(page), "menu and dialog").toEqual([]);
    });

    test("5: the All tools menu, a dialog and a menu exit (shown a frame after Escape, gone within 200ms plus a frame)", async ({
      page,
    }) => {
      const hits = watchEngine(page);
      await page.goto("/");
      await primeEngine(page, hits);
      await page.getByTestId("all-tools-button").first().click();
      await expect(page.getByTestId("tool-menu").first()).toBeVisible();
      await page.waitForTimeout(400);
      await armExitWatch(
        page,
        size.project === "desktop" ? "tool-menu" : "dialog",
      );
      await page.keyboard.press("Escape");
      await expectExit(page, "All tools", 120, true);

      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      await page.getByTestId("sort-menu").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.waitForTimeout(300);
      await armExitWatch(page, "menu");
      await page.keyboard.press("Escape");
      await expectExit(page, "the Sort menu", 120, false);

      if (size.project === "desktop")
        await page.getByTestId("file-card").first().hover();
      await cardAction(page, "alpha.pdf", "Enlarge");
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      await armExitWatch(page, "dialog");
      await page.keyboard.press("Escape");
      await expectExit(page, "the preview dialog", 200, true);
    });

    test("8: each Escape exit returns focus to the trigger; the leaving part is inert and aria-hidden while painted", async ({ page }) => {
      const hits = watchEngine(page);
      await page.goto("/");
      await primeEngine(page, hits);
      const allTools = page.getByTestId("all-tools-button").first();
      await allTools.click();
      await expect(page.getByTestId("tool-menu").first()).toBeVisible();
      await page.waitForTimeout(400);
      // Desktop: the panel (usePresence). Phone: the full-screen dialog (Dialog).
      await armLeaveWatch(page, size.project === "desktop" ? "[data-testid=tool-menu]" : "dialog:has([data-testid=tool-menu])");
      await page.keyboard.press("Escape");
      await expectLeaving(page, "All tools");
      await expect(allTools).toBeFocused();

      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      const sort = page.getByTestId("sort-menu");
      await sort.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.waitForTimeout(300);
      await armLeaveWatch(page, ".mp-menu[popover]:popover-open");
      await page.keyboard.press("Escape");
      await expectLeaving(page, "the Sort menu");
      await expect(sort).toBeFocused();

      if (size.project === "desktop") await page.getByTestId("file-card").first().hover();
      const enlarge = await cardAction(page, "alpha.pdf", "Enlarge");
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      await armLeaveWatch(page, "dialog[open]");
      await page.keyboard.press("Escape");
      await expectLeaving(page, "the preview dialog");
      await expect(enlarge).toBeFocused();
    });

    test("9: reopening mid-exit leaves the parts settled and interactive", async ({ page }) => {
      const hits = watchEngine(page);
      await page.goto("/");
      await primeEngine(page, hits);
      if (size.project === "desktop") {
        // usePresence: the All tools panel and its scrim, reopened two frames into their exit.
        await page.getByTestId("all-tools-button").first().click();
        await expect(page.getByTestId("tool-menu")).toBeVisible();
        await page.waitForTimeout(400);
        // Close, check it is leaving (inert set, its tween live) as soon as React has committed the click
        // (microtasks, never a frame), and reopen in that same task, so a slow frame can never outlast the
        // 120ms exit first.
        const midExit = await page.evaluate(async () => {
          const trigger = document.querySelector<HTMLButtonElement>("[data-testid=all-tools-button]")!;
          const panel = document.querySelector<HTMLElement>("[data-testid=tool-menu]");
          trigger.click();
          for (let i = 0; i < 100 && !panel?.inert; i++) await Promise.resolve();
          const leaving = !!panel?.inert && panel.isConnected && (window as unknown as { __motionLive: number }).__motionLive > 0;
          trigger.click();
          return leaving;
        });
        expect(midExit, "the panel was mid-exit when it reopened").toBe(true);
        await expect(page.getByTestId("tool-menu")).toBeVisible();
        expect(await leftovers(page, "[data-testid=tool-menu]")).toEqual(SETTLED);
        // The scrim keeps the aria-hidden its markup sets (review S2).
        expect(await leftovers(page, "[data-testid=tool-menu-scrim]")).toEqual({ ...SETTLED, ariaHidden: "true" });
        const search = page.getByTestId("tool-menu").getByRole("searchbox");
        await search.fill("rot");
        await expect(search).toHaveValue("rot");
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("tool-menu")).toHaveCount(0);
      }

      // Dialog: the preview dialog, reopened two frames into its exit.
      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      if (size.project === "desktop") await page.getByTestId("file-card").first().hover();
      const enlarge = await cardAction(page, "alpha.pdf", "Enlarge");
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      // The control that opened the preview (the Enlarge button, or the page itself where the card folds it).
      await enlarge.evaluate((e) => e.setAttribute("data-reopen", ""));
      const midExit = await page.evaluate(async () => {
        const d = document.querySelector<HTMLDialogElement>("dialog[open]")!;
        d.dataset.probe = "";
        // What Escape does (the dialog's cancel event), from script so the reopen lands mid-fade. React
        // commits that update in a microtask: wait microtasks (never a frame) until the dialog has closed.
        d.dispatchEvent(new Event("cancel", { cancelable: true }));
        for (let i = 0; i < 100 && d.open; i++) await Promise.resolve();
        const leaving = !d.open && d.hasAttribute("data-leaving") && d.inert && (window as unknown as { __motionLive: number }).__motionLive > 0;
        document.querySelector<HTMLButtonElement>("[data-reopen]")!.click();
        return leaving;
      });
      expect(midExit, "the dialog was mid-exit when it reopened").toBe(true);
      const dialog = page.locator("dialog[data-probe]");
      await expect(dialog).toHaveJSProperty("open", true);
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await leftovers(page, "dialog[data-probe]")).toEqual(SETTLED);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector("dialog[data-probe]")!).opacity)).toBe("1");
      // Interactive: Escape closes it again and focus returns.
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await expect(enlarge).toBeFocused();
    });

    test("10: focus never drops to <body> while the work area leaves for the result, and on Back to options", async ({ page }) => {
      const hits = watchEngine(page);
      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      // Samples where focus is on every frame, from the moment the progress bar has it.
      await page.evaluate(() => {
        const w = window as unknown as { focusTrail: string[] };
        w.focusTrail = [];
        const at = () => {
          const a = document.activeElement as HTMLElement | null;
          return !a || a === document.body ? "body" : (a.dataset.testid ?? a.tagName.toLowerCase());
        };
        let on = false;
        const tick = () => {
          const now = at();
          on ||= now === "processing";
          if (on && w.focusTrail.at(-1) !== now) w.focusTrail.push(now);
          requestAnimationFrame(tick);
        };
        tick();
      });
      await page.getByTestId("primary-action").click();
      const download = page.getByRole("link", { name: "Download" });
      await expect(download).toBeFocused({ timeout: 30_000 });
      const trail = await page.evaluate(() => (window as unknown as { focusTrail: string[] }).focusTrail);
      expect(trail[0], "the progress bar had focus").toBe("processing");
      expect(trail, "focus on the way to the result").not.toContain("body");
      expect(trail.at(-1)).toBe("a");

      // Back to options: the card leaves (inert) with focus on the tool heading, and the work area returns.
      await page.evaluate(() => ((window as unknown as { focusTrail: string[] }).focusTrail = []));
      await page.getByRole("button", { name: "Back to options" }).click();
      await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __motionLive: number }).__motionLive)).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { focusTrail: string[] }).focusTrail), "focus on Back to options").not.toContain("body");
      expect(await strayTransforms(page), "after Back to options").toEqual([]);
    });

    for (const path of [
      "/merge-pdf",
      "/rotate-pdf",
      "/split-pdf",
      "/split-pdf-by-bookmarks",
      "/edit-pdf",
    ]) {
      test(`7: ${path} is still 5s after load`, async ({ page }) => {
        await page.goto(path);
        await page.waitForTimeout(5200);
        const running = await page.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a.playState === "running")
            .map((a) => {
              const t = (a.effect as KeyframeEffect | null)
                ?.target as Element | null;
              return `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "animation"} on ${t?.tagName.toLowerCase()}.${t?.className}`;
            }),
        );
        expect(running).toEqual([]);
      });
    }
  });
}
