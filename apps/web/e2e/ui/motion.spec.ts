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
        return !!document.querySelector("dialog[open], dialog[data-leaving]");
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
            const poll = () =>
              shown()
                ? requestAnimationFrame(poll)
                : (w.exitWatch!.goneAfter = performance.now() - t0);
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
  expect(r.goneAfter, `${what} is gone within 250ms`).toBeLessThanOrEqual(250);
}

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
