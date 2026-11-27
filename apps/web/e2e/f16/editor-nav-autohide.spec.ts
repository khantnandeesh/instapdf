/**
 * F25 eval G-1 (M12 on Edit PDF): from 1024px, scrolling the pages down slides the site navbar away and
 * the editor bar takes its place, so the pages get the navbar's height. The navbar comes back on a
 * scroll up, when the pointer reaches the top edge, and when focus goes into it. Transforms only: no
 * layout shift. Phones keep the navbar. Built behind NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE (0 turns it off).
 */
import { expect, test, type Page } from "@playwright/test";
import { fx } from "../support/flow";

test.skip(process.env.NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE === "0", "auto-hide switched off in this build");

/** The eval's M12 measure: visible page area over the window height, between the editor bar and the bottom. */
const pagesShare = (page: Page) =>
  page.evaluate(() => {
    const sc = document.querySelector<HTMLElement>("[data-testid=canvas]")!.getBoundingClientRect();
    const top = Math.max(sc.top, document.querySelector(".ed-top")!.getBoundingClientRect().bottom);
    const bottom = Math.min(sc.bottom, innerHeight);
    let h = 0;
    for (const p of document.querySelectorAll<HTMLElement>("[data-testid^=page-]")) {
      if (!/^page-\d+$/.test(p.dataset.testid!)) continue;
      const b = p.getBoundingClientRect();
      h += Math.max(0, Math.min(b.bottom, bottom) - Math.max(b.top, top));
    }
    return (100 * h) / innerHeight;
  });
const nav = (page: Page) => page.evaluate(() => document.documentElement.dataset.edNav ?? "shown");
const headerBottom = (page: Page) => page.evaluate(() => document.querySelector(".ip-site-header")!.getBoundingClientRect().bottom);
const barTop = (page: Page) => page.evaluate(() => document.querySelector(".ed-top")!.getBoundingClientRect().top);
// Each scroll waits for the next frame, so the page sees it as a scroll of its own (scroll events come once
// a frame): two scripted jumps in one busy frame would read as one move, which no person can make.
const scrollDown = (page: Page, px: number) =>
  page.evaluate((px) => {
    document.querySelector<HTMLElement>("[data-testid=canvas]")!.scrollBy(0, px);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, px);
const scrollTo = (page: Page, f: number) =>
  page.evaluate((f) => {
    const s = document.querySelector<HTMLElement>("[data-testid=canvas]")!;
    s.scrollTop = (s.scrollHeight - s.clientHeight) * f;
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, f);

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(fx("sixty-pages.pdf"));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

for (const [w, h] of [
  [1280, 632],
  [1366, 657],
] as const)
  test(`G-1 ${w}x${h}: the navbar slides away on scroll down, the pages get >= 88% of the height, nothing shifts`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await open(page, w, h);
    // At rest both bars show: the navbar, then the editor bar right under it.
    expect(await nav(page)).toBe("shown");
    const hh = await headerBottom(page);
    expect(hh).toBeGreaterThan(40);
    expect(Math.abs((await barTop(page)) - hh)).toBeLessThanOrEqual(1);
    const cls0 = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);

    await scrollTo(page, 0.6);
    await expect.poll(() => nav(page)).toBe("hidden");
    await expect.poll(() => headerBottom(page)).toBeLessThanOrEqual(0);
    await expect.poll(() => barTop(page)).toBe(0);
    expect(await pagesShare(page)).toBeGreaterThanOrEqual(88);
    // Reading on down from 25%, every 5% of the way the pages keep >= 88% (only a 12px gap between two
    // pages). The jump back to 25% is a scroll up, which shows the navbar; the next step down hides it again.
    await scrollTo(page, 0.25);
    await expect.poll(() => nav(page)).toBe("shown");
    await scrollTo(page, 0.3);
    await expect.poll(() => nav(page)).toBe("hidden");
    await expect.poll(() => barTop(page)).toBe(0);
    for (let f = 0.3; f < 0.9; f += 0.05) {
      await scrollTo(page, f);
      expect(await nav(page)).toBe("hidden");
      expect(await barTop(page)).toBe(0);
      expect(await pagesShare(page)).toBeGreaterThanOrEqual(88);
    }

    // A scroll up brings it back, and the editor bar moves back under it.
    await scrollDown(page, -120);
    await expect.poll(() => nav(page)).toBe("shown");
    await expect.poll(() => barTop(page)).toBe(hh);

    // The pointer resting at the top edge brings it back; one passing through it on the way to the editor
    // bar's buttons does not (the bar would slide down from under it).
    await scrollDown(page, 300);
    await expect.poll(() => nav(page)).toBe("hidden");
    await page.mouse.move(w / 2, 300);
    await page.mouse.move(w / 2, 4);
    await page.waitForTimeout(120);
    await page.mouse.move(w / 2, 28);
    await page.waitForTimeout(600);
    expect(await nav(page)).toBe("hidden");
    await page.mouse.move(w / 2, 2);
    await expect.poll(() => nav(page)).toBe("shown");

    // Focus in the navbar keeps it: a scroll down with a navbar link focused does not hide it.
    await page.locator(".ip-site-header a").first().focus();
    await scrollDown(page, 300);
    await page.waitForTimeout(300);
    expect(await nav(page)).toBe("shown");
    await page.getByTestId("canvas").focus();

    // Focus going into it (Tab from the page, a skip link) brings it back.
    await page.mouse.move(w / 2, 300);
    await scrollDown(page, 300);
    await expect.poll(() => nav(page)).toBe("hidden");
    await page.locator(".ip-site-header a").first().focus();
    await expect.poll(() => nav(page)).toBe("shown");
    await expect.poll(() => headerBottom(page)).toBe(hh);

    // Transforms only: none of this is a layout shift.
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls - cls0).toBe(0);
  });

test("G-1: go to page lands the page right under the editor bar with the navbar away (no 72px gap), and back up under both", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await open(page, 1280, 632);
  const settle = async (n: number) => {
    let last = NaN;
    await expect
      .poll(async () => {
        const y = (await page.getByTestId(`page-${n}`).boundingBox())!.y;
        const still = Math.abs(y - last) < 0.5;
        last = y;
        return still;
      }, { intervals: [200] })
      .toBe(true);
    await page.waitForTimeout(250); // the bars' slide (150ms)
  };
  const gap = (n: number) => page.evaluate((n) => document.querySelector(`[data-testid=page-${n}]`)!.getBoundingClientRect().top - document.querySelector(".ed-top")!.getBoundingClientRect().bottom, n);
  await page.getByTestId("editor-strip").getByRole("button", { name: "Page 12 of 60" }).click();
  await settle(12);
  expect(await nav(page)).toBe("hidden");
  const down = await gap(12);
  expect(down, `page 12 sits under the bar, not 72px lower (${down})`).toBeGreaterThanOrEqual(0);
  expect(down).toBeLessThanOrEqual(24);
  await page.getByTestId("editor-strip").getByRole("button", { name: "Page 3 of 60" }).click();
  await settle(3);
  expect(await nav(page)).toBe("shown");
  const up = await gap(3);
  expect(up, `page 3 sits under the bar, not behind the navbar (${up})`).toBeGreaterThanOrEqual(0);
  expect(up).toBeLessThanOrEqual(24);
});

test("G-1: reduced motion moves the navbar without a transition; the page strip and bar move with it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1280, 632);
  await scrollTo(page, 0.5);
  await expect.poll(() => nav(page)).toBe("hidden");
  const t = await page.evaluate(() => [".ip-site-header", ".ed-top", ".ed-panel > .ed-side"].map((s) => getComputedStyle(document.querySelector(s)!).transitionDuration));
  expect(t.every((d) => d.split(",").every((x) => parseFloat(x) === 0))).toBe(true);
  // The page strip's tabs sit right under the bar, and its list reaches the bottom of the window.
  const strip = await page.evaluate(() => {
    const tabs = document.querySelector(".ed-panel .ed-tabs")!.getBoundingClientRect();
    const side = document.querySelector(".ed-panel > .ed-side")!.getBoundingClientRect();
    return { tabs: tabs.top, bottom: side.bottom };
  });
  expect(strip.tabs).toBeGreaterThanOrEqual(56);
  expect(strip.tabs).toBeLessThanOrEqual(58);
  expect(Math.abs(strip.bottom - 632)).toBeLessThanOrEqual(1);
});

test("G-1: phones keep the navbar while the pages scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await open(page, 390, 664);
  await scrollTo(page, 0.6);
  await page.waitForTimeout(400);
  expect(await nav(page)).toBe("shown");
  expect(await headerBottom(page)).toBeGreaterThan(40);
});
