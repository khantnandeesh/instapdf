/**
 * Eval G-7: after a mouse or touch pick, "Add files" shows no focus ring; keyboard focus shows it,
 * and a window that loses focus (the system file dialog, another tab) does not bring it back either.
 * Picks go through the real buttons and the browser's file chooser, not the hidden input.
 * Alternate's file cards are a focus stop named for the card, as on Merge.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { f5fx, flow } from "./support";

const ring = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    return n.matches(":focus-visible") && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
  });

async function choose(page: Page, button: Locator, names: string[]) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
  await chooser.setFiles(await Promise.all(names.map(f5fx)));
}

/** What the browser does while its file dialog is open: the window loses focus, then gets it back. */
async function windowAway(el: Locator) {
  await el.evaluate((n) => {
    const real = Document.prototype.hasFocus;
    document.hasFocus = () => false;
    n.dispatchEvent(new FocusEvent("blur"));
    document.hasFocus = real;
    n.dispatchEvent(new FocusEvent("focus"));
  });
}

for (const slug of ["alternate-mix-pdf", "extract-pdf-pages", "organize-pdf"] as const)
  test(`${slug}: a mouse pick leaves focus without a ring, keyboard focus shows it`, async ({ page }, info) => {
    await page.goto(`/${slug}`);
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
    await choose(page, page.getByRole("button", { name: /^Choose/ }).first(), slug === "extract-pdf-pages" ? ["twelve.pdf"] : ["odd.pdf", "even.pdf"]);
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    // Focus moves to the toolbar's picker (eval G-7 saw "Add files"); on a phone's compact toolbar the
    // add control may be a menu instead, and focus then stays where it was.
    const focused = page.locator(":focus");
    const moved = (await focused.count()) > 0 && (await focused.evaluate((n) => n !== document.body));
    if (info.project.name === "desktop") expect(moved, "focus moves to the toolbar's picker").toBe(true);
    if (moved) {
      const el = page.locator(":focus");
      await windowAway(el);
      // Headless pages never lose window focus, so the browser's own ring on return cannot show here;
      // the quiet mark that keeps it off must survive the window's blur.
      await expect(el).toHaveAttribute("data-quiet-focus", "");
      expect(await ring(el)).toBe(false);
    }

    // The toolbar's own picker, clicked with the mouse: no ring when the window comes back either.
    const add = page.getByRole("button", { name: /^(Add files|Replace file)$/ }).first();
    if (slug !== "extract-pdf-pages" && (await add.isVisible())) {
      await choose(page, add, ["three-pages.pdf"]);
      await expect(page.getByText("three-pages.pdf").first()).toBeAttached();
      await expect(add).toBeFocused();
      await windowAway(add);
      await expect(add).toHaveAttribute("data-quiet-focus", "");
      expect(await ring(add)).toBe(false);
    }

    // Keyboard users see it: Tab to the picker.
    if (await add.isVisible()) {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      if (!(await add.evaluate((n) => n === document.activeElement))) await tabToEl(page, add);
      await expect.poll(() => ring(add)).toBe(true);
    }
  });

async function tabToEl(page: Page, el: Locator) {
  await page.locator("body").focus();
  for (let i = 0; i < 40 && !(await el.evaluate((n) => n === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(el).toBeFocused();
}

test("Alternate: each file card is a focus stop named for the file", async ({ page }) => {
  await page.goto("/alternate-mix-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(await Promise.all(["odd.pdf", "even.pdf"].map(f5fx)));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  const card = page.getByRole("button", { name: "odd.pdf, 5 pages", exact: true });
  await expect(card).toHaveAttribute("tabindex", "0");
  await card.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "even.pdf, 5 pages", exact: true })).toBeFocused();
});
