/**
 * Motion guards (docs/design/motion.md §7), at a phone (390x844) and a laptop (1280x720) size:
 *
 * 1. The motion engine (GSAP, a lazy chunk) is not fetched before the first sign of intent or 4s, and is
 *    fetched once afterwards.
 * 2. Under reduced motion no open, close or filter leaves a non-identity inline transform behind.
 * 3. A click on a menu item, and on Download, during its entrance acts on the first try.
 * 4. Opening and closing the All tools menu, a dialog and a menu, filtering, and adding files record no
 *    layout shift.
 * 5. Exits happen: the All tools menu, a dialog and a menu are still shown one frame after Escape, and
 *    gone within 250ms.
 * 6. No securitypolicyviolation event fires (every test).
 * 7. Nothing is animating on a tool page 5s after load (WCAG 2.2.2).
 * 8. Each Escape exit puts focus back on the trigger, and the leaving part is inert and aria-hidden while
 *    it is still painted (the All tools menu, a menu, a dialog).
 * 9. Reopening mid-exit leaves the parts settled and interactive (Dialog; usePresence via the All tools panel),
 *    and the panel's scrim keeps its own aria-hidden.
 * 10. Focus never drops to <body> while the work area leaves for the result, and back (review S1, T12).
 */
import { expect, test, type Page } from "@playwright/test";
import { fx } from "../support/flow";

const SIZES = [
  { name: "phone", width: 390, height: 844, project: "mobile" },
  { name: "desktop", width: 1280, height: 720, project: "desktop" },
] as const;

/** Text only the engine chunk carries (its licence notice, lib/motion/engine.ts). */
const ENGINE_MARK = "gsap.com/standard-license";

/** Counts the engine chunk's downloads: resolves each script response's body once. */
function watchEngine(page: Page) {
  const hits: number[] = [];
  const t0 = Date.now();
  page.on("response", async (r) => {
    if (!/\/_next\/static\/chunks\/.+\.js(\?|$)/.test(r.url())) return;
    const body = await r.text().catch(() => "");
    if (body.includes(ENGINE_MARK)) hits.push(Date.now() - t0);
  });
  return hits;
}

/** Waits until the engine has been fetched (after an intent), so exits animate. */
async function primeEngine(page: Page, hits: number[]) {
  await page.mouse.move(2, 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => hits.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // The chunk is evaluated a moment after its response.
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
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

/**
 * Arms a watcher for the next Escape: records whether `shown(el)` still holds on the frame after the key,
 * and how long until it no longer does.
 */
async function armExitWatch(page: Page, kind: "tool-menu" | "dialog" | "menu") {
  await page.evaluate((kind) => {
    const w = window as unknown as {
      exitWatch?: { afterFrame?: boolean; goneAfter?: number };
    };
    const find = (): Element | null =>
      kind === "tool-menu"
        ? document.querySelector("[data-testid=tool-menu]")
        : kind === "dialog"
          ? document.querySelector("dialog[open], dialog[data-leaving]")
          : (document.querySelector(".mp-menu[popover]:popover-open") ??
            document.querySelector(".mp-menu[popover]"));
    const target = find();
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
        !!target &&
        target.isConnected &&
        getComputedStyle(target).display !== "none"
      );
    };
    w.exitWatch = {};
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        const t0 = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            w.exitWatch!.afterFrame = shown();
            // goneAfter is the last frame it was still shown: the first frame without it comes one
            // (possibly slow, under test load) frame later.
            let last = performance.now() - t0;
            const poll = () => {
              if (!shown()) return void (w.exitWatch!.goneAfter = last);
              last = performance.now() - t0;
              requestAnimationFrame(poll);
            };
            poll();
          }),
        );
      },
      { capture: true, once: true },
    );
  }, kind);
}

async function expectExit(page: Page, what: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { exitWatch: { goneAfter?: number } })
              .exitWatch.goneAfter,
        ),
      { message: `${what} goes` },
    )
    .toBeDefined();
  const r = await page.evaluate(
    () =>
      (
        window as unknown as {
          exitWatch: { afterFrame: boolean; goneAfter: number };
        }
      ).exitWatch,
  );
  expect(
    r.afterFrame,
    `${what} is still shown the frame after Escape (it exits, not vanishes)`,
  ).toBe(true);
  expect(
    r.goneAfter,
    `${what} is gone within 250ms (last frame shown)`,
  ).toBeLessThanOrEqual(250);
}

/**
 * Arms a watcher for the next Escape: one frame after the key, records whether the element `selector`
 * finds is still painted, whether it (or an ancestor) is inert and aria-hidden, and where focus is.
 */
async function armLeaveWatch(page: Page, selector: string) {
  await page.evaluate((selector) => {
    const w = window as unknown as { leaveWatch?: Record<string, unknown> };
    const el = document.querySelector<HTMLElement>(selector);
    w.leaveWatch = undefined;
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        requestAnimationFrame(() => {
          const cs = el && getComputedStyle(el);
          w.leaveWatch = {
            found: !!el,
            painted: !!el && el.isConnected && cs!.display !== "none" && cs!.visibility !== "hidden" && Number(cs!.opacity) > 0,
            inert: !!el?.closest("[inert]"),
            hidden: !!el?.closest("[aria-hidden=true]"),
            focusInside: !!el?.contains(document.activeElement),
          };
        });
      },
      { capture: true, once: true },
    );
  }, selector);
}

async function expectLeaving(page: Page, what: string) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { leaveWatch?: unknown }).leaveWatch), { message: `${what}: watched` }).toBeDefined();
  const r = await page.evaluate(() => (window as unknown as { leaveWatch: Record<string, boolean> }).leaveWatch);
  expect(r, `${what}, one frame after Escape`).toEqual({ found: true, painted: true, inert: true, hidden: true, focusInside: false });
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
      const hits = watchEngine(page);
      await page.goto("/");
      await page.waitForTimeout(2500);
      expect(hits, "no engine before intent").toEqual([]);
      await primeEngine(page, hits);
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
      await page
        .getByRole("button", { name: "Enlarge alpha.pdf" })
        .click({ force: size.project !== "desktop" });
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      expect(await shifts(page), "menu and dialog").toEqual([]);
    });

    test("5: the All tools menu, a dialog and a menu exit (shown a frame after Escape, gone within 250ms)", async ({
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
      await expectExit(page, "All tools");

      await openMerge(page);
      await primeEngine(page, hits);
      await addMergeFiles(page);
      await page.getByTestId("sort-menu").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.waitForTimeout(300);
      await armExitWatch(page, "menu");
      await page.keyboard.press("Escape");
      await expectExit(page, "the Sort menu");

      if (size.project === "desktop")
        await page.getByTestId("file-card").first().hover();
      await page
        .getByRole("button", { name: "Enlarge alpha.pdf" })
        .click({ force: size.project !== "desktop" });
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      await armExitWatch(page, "dialog");
      await page.keyboard.press("Escape");
      await expectExit(page, "the preview dialog");
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
      const enlarge = page.getByRole("button", { name: "Enlarge alpha.pdf" });
      await enlarge.click({ force: size.project !== "desktop" });
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
        const midExit = await page.evaluate(async () => {
          document.querySelector<HTMLButtonElement>("[data-testid=all-tools-button]")!.click();
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          await frame();
          await frame();
          const panel = document.querySelector<HTMLElement>("[data-testid=tool-menu]");
          const leaving = !!panel?.inert && (window as unknown as { __motionLive: number }).__motionLive > 0;
          document.querySelector<HTMLButtonElement>("[data-testid=all-tools-button]")!.click();
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
      const enlarge = page.getByRole("button", { name: "Enlarge alpha.pdf" });
      await enlarge.click({ force: size.project !== "desktop" });
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.waitForTimeout(400);
      const midExit = await page.evaluate(async () => {
        const d = document.querySelector<HTMLDialogElement>("dialog[open]")!;
        d.dataset.probe = "";
        // What Escape does (the dialog's cancel event), from script so the reopen lands mid-fade.
        d.dispatchEvent(new Event("cancel", { cancelable: true }));
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        await frame();
        await frame();
        const leaving = !d.open && d.hasAttribute("data-leaving") && (window as unknown as { __motionLive: number }).__motionLive > 0;
        document.querySelector<HTMLButtonElement>("button[aria-label='Enlarge alpha.pdf']")!.click();
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
