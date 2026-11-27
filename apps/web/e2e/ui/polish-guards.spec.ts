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
          const g = grid.getBoundingClientRect();
          const s = getComputedStyle(grid);
          const inner = { left: g.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth), right: g.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) };
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
});
