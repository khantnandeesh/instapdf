/**
 * Design-system guards from the owner's UI polish rounds (2026-11-27; docs/design/berrypdf.md "Polish rules"):
 * nothing moves when an option toggles, a page grid keeps equal space left and right at every zoom,
 * focus rings show for the keyboard only, and a number stepper is one joined control with its value centred.
 */
import { expect, test, type Page } from "@playwright/test";
import { fileInput, flow, isDesktop } from "../support/flow";

test.skip(({ browserName }) => browserName !== "chromium");

async function ready(page: Page, path: string, file = "big-250.pdf") {
  await page.goto(path);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await fileInput(page).setInputFiles(`tests/fixtures/${file}`);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
}

const box = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).first().boundingBox())!;
  return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 2) / 2);
};

test.describe("polish guards (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("toggling an option moves nothing else: the More options trigger and its popover keep their boxes", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the popover is desktop; the phone sheet is covered by modals.spec");
    await ready(page, "/delete-pdf-pages");
    await page.getByTestId("more-options").first().click();
    const pop = page.getByTestId("more-options-dialog");
    await expect(pop).toBeVisible();
    await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const before = [await box(page, "more-options"), await box(page, "more-options-dialog")];
    const switches = pop.getByRole("switch").or(pop.getByRole("checkbox"));
    expect(await switches.count()).toBeGreaterThan(0);
    for (const i of [0, 0]) {
      await switches.nth(i).click({ force: true });
      await page.waitForTimeout(350);
      expect([await box(page, "more-options"), await box(page, "more-options-dialog")]).toEqual(before);
    }
  });

  for (const width of [1280, 1100]) {
    test(`a page grid keeps equal space left and right at every zoom (${width} px)`, async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name), "the zoom slider is desktop");
      await page.setViewportSize({ width, height: 800 });
      await ready(page, "/extract-pdf-pages");
      const slider = page.getByRole("slider", { name: "Thumbnail size" });
      for (const size of [96, 160, 224, 288, 352, 400]) {
        await slider.fill(String(size));
        await page.waitForTimeout(400);
        const gaps = await page.locator(".ip-tile-grid").first().evaluate((grid) => {
          // Measured against the visible panel the pages sit on, not the grid: a scroll gutter or padding on
          // one side only (it once reserved 10px on the right) shifts the whole grid off centre.
          const panel = grid.closest(".rounded-panel") ?? grid;
          const g = panel.getBoundingClientRect();
          const s = getComputedStyle(panel);
          const inner = { left: g.left + parseFloat(s.borderLeftWidth), right: g.right - parseFloat(s.borderRightWidth) };
          const kids = [...grid.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
          const top = Math.min(...kids.map((r) => r.top));
          const row = kids.filter((r) => Math.abs(r.top - top) < 2);
          return { left: Math.min(...row.map((r) => r.left)) - inner.left, right: inner.right - Math.max(...row.map((r) => r.right)) };
        });
        expect(Math.abs(gaps.left - gaps.right), `zoom ${size}: ${JSON.stringify(gaps)}`).toBeLessThanOrEqual(1.5);
      }
    });
  }

  test("a click leaves no focus ring; the keyboard brings it back", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "pointer and keyboard on desktop");
    await ready(page, "/rotate-pdf", "alpha.pdf");
    const ring = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      });
    const target = page.getByRole("button", { name: "Rotate right", exact: true });
    await target.click();
    await expect(target).toBeFocused();
    expect(await ring(), "after a click").toBe(false);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(target).toBeFocused();
    expect(await ring(), "after Tab").toBe(true);
  });

  test("a number stepper is one joined control: buttons the control's height, value centred", async ({ page }) => {
    await ready(page, "/split-pdf");
    const select = page.getByRole("combobox", { name: "Split" });
    if (await select.isVisible()) await select.selectOption({ label: "Every N" });
    else await page.getByRole("radiogroup", { name: "Split" }).getByRole("radio", { name: "Every N pages" }).click();
    const m = await page.locator(".ip-stepper").first().evaluate((c) => {
      const r = c.getBoundingClientRect();
      const [dec, value, inc] = [...c.children].map((e) => e.getBoundingClientRect());
      const input = c.querySelector("input")!;
      return { h: r.height, dec, value, inc, align: getComputedStyle(input).textAlign, cx: r.left + r.width / 2 };
    });
    for (const b of [m.dec, m.inc]) {
      expect(Math.abs(b.height - (m.h - 3))).toBeLessThanOrEqual(1); // inside the 1.5 px border
      expect(Math.abs(b.width - b.height)).toBeLessThanOrEqual(1); // square hit areas
    }
    expect(m.align).toBe("center");
    expect(Math.abs(m.value.left + m.value.width / 2 - m.cx)).toBeLessThanOrEqual(1);
  });

  test("the selected pill's tick stays clear of the next pill; the status line never wraps around a '·'", async ({ page }) => {
    await ready(page, "/split-pdf");
    const gap = await page.getByRole("radiogroup", { name: "Split" }).evaluate((g) => {
      const [a, b] = [...g.querySelectorAll('[role="radio"]')].slice(0, 2);
      const tick = getComputedStyle(a, "::after");
      return b.getBoundingClientRect().left - (a.getBoundingClientRect().right - parseFloat(tick.right));
    });
    expect(gap, "space between the tick's right edge and the next pill").toBeGreaterThanOrEqual(4);
    const status = page.getByTestId("dock-status");
    await expect(status).toHaveText("250 pages · 250 files");
    for (const width of [1280, 1100]) {
      await page.setViewportSize({ width, height: 800 });
      const lines = await status.evaluate((p) => {
        const tops = new Map<number, string>();
        for (const n of p.querySelectorAll("span")) {
          if (!n.getClientRects().length) continue;
          const t = Math.round(n.getBoundingClientRect().top);
          tops.set(t, ((tops.get(t) ?? "") + n.textContent).trim());
        }
        return [...tops.values()];
      });
      for (const line of lines) expect(line, `${width}px: ${JSON.stringify(lines)}`).not.toMatch(/^·|·$/);
    }
  });

  test("no 4px halo at rest on tool buttons (it reads as a focus ring); the zoom slider rings its thumb, not a box", async ({ page }) => {
    await ready(page, "/split-pdf");
    const shadows = await page.locator(".ip-split--tool, .mp-toolbar").evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow));
    for (const s of shadows) expect(s).not.toMatch(/0px 0px 0px 4px/);
    const slider = page.getByRole("slider", { name: "Thumbnail size" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    expect(await slider.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("none");
  });
});
