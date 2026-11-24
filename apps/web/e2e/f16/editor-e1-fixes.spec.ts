/**
 * F16 E1 eval follow-ups: AC-48 touch targets, AC-68 Text hint, AC-82 focus on new shapes,
 * AC-98 the 320 px strip, M12 first-screen fit, Esc order, popover vs rotate handle, and desktop
 * tool options while an object is selected.
 */
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

async function drawRect(page: Page) {
  await tool(page, "r");
  const p = (await page.getByTestId("page-1").boundingBox())!;
  const a = { x: p.x + p.width * 0.3, y: p.y + 260 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 40, { steps: 4 });
  await page.mouse.move(a.x + 120, a.y + 80, { steps: 4 });
  await page.mouse.up();
  const shape = page.locator('[data-kind="shape"]');
  await expect(shape).toHaveCount(1);
  return shape;
}

test.describe("desktop", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop layout"));

  test("AC-68: the Text tool's hint says Esc stops it", async ({ page }) => {
    await open(page);
    await tool(page, "t");
    await expect(page.getByTestId("mode-hint")).toContainText("Click to type, drag for a box");
    await expect(page.getByTestId("mode-hint")).toContainText("Esc");
  });

  test("AC-82: a freshly drawn shape and whiteout take keyboard focus, so arrows nudge them", async ({ page }) => {
    await open(page);
    const shape = await drawRect(page);
    await expect(shape).toBeFocused();
    const before = (await shape.boundingBox())!;
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => (await shape.boundingBox())!.x).toBeGreaterThan(before.x + 5);
    await tool(page, "w");
    const p = (await page.getByTestId("page-1").boundingBox())!;
    await page.mouse.move(p.x + 100, p.y + 420);
    await page.mouse.down();
    await page.mouse.move(p.x + 200, p.y + 450, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-kind="whiteout"]')).toBeFocused();
  });

  test("Esc first deselects, then returns to Select; a sticky tool with a selection places on empty space", async ({ page }) => {
    await open(page);
    const shape = await drawRect(page);
    await expect(shape).toHaveAttribute("data-selected", "true");
    // Shapes stays armed: a click on empty space places another shape.
    const p = (await page.getByTestId("page-1").boundingBox())!;
    await page.mouse.click(p.x + p.width * 0.7, p.y + 500);
    await expect(page.locator('[data-kind="shape"]')).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-kind="shape"][data-selected="true"]')).toHaveCount(0);
    await expect(page.getByTestId("mode-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mode-hint")).toHaveCount(0);
  });

  test("the selection popover leaves the rotate handle free, and tool options stay in the top bar", async ({ page }) => {
    await open(page);
    await drawRect(page);
    await expect(page.locator(".ed-top__slot")).not.toBeEmpty();
    const rot = (await page.locator('.ed-rotate').boundingBox())!;
    const pop = page.locator("[data-popover].ed-popover");
    await expect(pop).toBeVisible();
    const b = (await pop.boundingBox())!;
    const overlap = !(b.x + b.width <= rot.x - 9 || rot.x + rot.width + 9 <= b.x || b.y + b.height <= rot.y - 9 || rot.y + rot.height + 9 <= b.y);
    expect(overlap).toBe(false);
    // The rotate handle is what a press there hits.
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-handle]")?.getAttribute("data-handle"), [rot.x + rot.width / 2, rot.y + rot.height / 2]);
    expect(hit).toBe("rot");
  });

  // The page's width over the screen's, at the opening zoom (M12, the forms eval: the reference fills 83-92%).
  for (const [width, height] of [
    [1280, 720],
    [1366, 657],
    [1536, 864],
    [1920, 1080],
  ] as const) {
    test(`M12: at ${width} px the page opens filling at least 83% of the screen's width`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const p = (await page.getByTestId("page-1").boundingBox())!;
      expect(p.width / width).toBeGreaterThanOrEqual(0.83);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(width);
    });
  }

  test("M12: very wide screens are capped, so the page stays crisp and a line a readable length", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1300 });
    await open(page);
    // report-form-3p.pdf is A4: capped at about 217% (lib/editor/open-zoom), about 1,720 px wide.
    expect((await page.getByTestId("page-1").boundingBox())!.width).toBeLessThanOrEqual(1760);
  });
});

test.describe("touch", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "touch layout"));

  test("M12: on a phone the page opens filling the screen's width", async ({ page }) => {
    await open(page);
    const p = (await page.getByTestId("page-1").boundingBox())!;
    expect(p.width / page.viewportSize()!.width).toBeGreaterThanOrEqual(0.93);
  });

  test("AC-48: every handle, rotate included, has a hit area of at least 44 px", async ({ page }) => {
    await open(page);
    await tool(page, "r");
    const p = (await page.getByTestId("page-1").boundingBox())!;
    await page.touchscreen.tap(p.x + p.width / 2, p.y + 300);
    await expect(page.locator('[data-kind="shape"]')).toHaveCount(1);
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".ed-handle, .ed-rotate > span")].map((el) => {
        const cs = el.classList.contains("ed-handle") ? getComputedStyle(el, "::before") : getComputedStyle(el);
        return [parseFloat(cs.width), parseFloat(cs.height)];
      }),
    );
    expect(sizes.length).toBe(9);
    for (const [w, h] of sizes) {
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
  });

  test("AC-98: at 320 px the Text strip has at most 6 controls and fits the screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page);
    await page.getByRole("button", { name: /^Text/ }).first().tap();
    const strip = page.getByTestId("context-strip");
    await expect(strip).toBeVisible();
    const n = await strip.locator("[role=toolbar] button, [role=toolbar] input").count();
    expect(n).toBeLessThanOrEqual(6);
    const more = strip.getByRole("button", { name: "More" });
    await expect(more).toBeVisible();
    const m = (await more.boundingBox())!;
    expect(m.x + m.width).toBeLessThanOrEqual(320);
  });
});
