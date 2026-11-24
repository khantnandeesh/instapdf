/**
 * F23's menus and the phone sheet against the modal guard (docs/design/berrypdf.md "Modals", the rules
 * e2e/ui/modals.spec.ts checks on the site's dialogs). The cloud parts open no <dialog>: the caret's
 * menu (a sheet above the dock on phones) and Merge's add menus are popovers, so the rules that apply
 * to them are checked here: no decoration, normal-sized controls, focus shown the site menus' way (no
 * ring, an on-theme highlight), Escape closes, nothing scrolls sideways.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { caret, needsCloud, openRotate } from "./support";

needsCloud();

/** The site's link blue (--link), the off-theme ring the owner flagged on the old modals. */
const LINK_BLUE = "rgb(74, 99, 217)";

const popup = (page: Page) => page.locator(".mp-menu").filter({ has: page.getByRole("menu") });

async function expectQuiet(menu: Locator, where: string) {
  const found = await menu.evaluate((m) => {
    const out: string[] = [];
    // Controls: menu items and buttons are normal-sized (rule 4).
    for (const b of m.querySelectorAll<HTMLElement>("button, [role=menuitem]")) {
      const r = b.getBoundingClientRect();
      if (r.height > 48) out.push(`"${b.textContent?.trim()}" is ${r.height}px tall`);
    }
    // No decoration (rule 3): no background image on the surface or its direct children, no grab handle.
    for (const el of [m, ...m.querySelectorAll(":scope > *")]) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg !== "none") out.push(`background image on <${el.tagName.toLowerCase()}>: ${bg.slice(0, 40)}`);
    }
    // Nothing sideways (Scrolling rule 4).
    if (m.scrollWidth > m.clientWidth + 1) out.push(`scrolls sideways (${m.scrollWidth} > ${m.clientWidth})`);
    if (document.documentElement.scrollWidth > innerWidth) out.push("the page scrolls sideways");
    return out;
  });
  expect(found, `${where}: quiet, normal-sized, no sideways scroll`).toEqual([]);
}

/**
 * Rule 5 as the site's menus apply it (components/ui/Menu.tsx, which our CloudMenu matches): menu items
 * never draw a ring; the item that has focus is the highlighted one (the pink band and berry text), the
 * ARIA menu pattern's active item. So: no ring after a pointer click, and from the keyboard the focused
 * item is highlighted on-theme, still without the off-theme ring.
 */
async function expectFocusRules(page: Page, where: string) {
  const state = () =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const cs = getComputedStyle(a);
      return { item: a.getAttribute("role"), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0, bg: cs.backgroundColor, color: cs.color, outline: cs.outlineColor };
    });
  const afterClick = await state();
  expect(afterClick.item, `${where}: opens with focus on its first item`).toBe("menuitem");
  expect(afterClick.ring, `${where}: a pointer click shows no focus ring`).toBe(false);
  await page.keyboard.press("ArrowDown");
  // The highlight fades in (transition-colors).
  await expect.poll(async () => (await state()).bg, { message: `${where}: the focused item is highlighted` }).not.toBe("rgba(0, 0, 0, 0)");
  const afterKey = await state();
  expect(afterKey.item, `${where}: arrows move between items`).toBe("menuitem");
  expect(afterKey.ring, `${where}: menu items draw no ring`).toBe(false);
  expect([afterKey.bg, afterKey.color], `${where}: the highlight is on-theme`).not.toContain(LINK_BLUE);
}

test("the source menu (a sheet on phones) meets the modal guard", async ({ page }, info) => {
  await openRotate(page);
  await caret(page).click();
  const menu = popup(page);
  await expect(menu).toBeVisible();
  const where = info.project.name === "desktop" ? "source menu" : "source sheet";
  await expectQuiet(menu, where);
  await expectFocusRules(page, where);
  await page.keyboard.press("Escape");
  await expect(menu, `${where}: Escape closes it`).toBeHidden();
  await expect(caret(page)).toBeFocused();
});

test("Merge's add menus meet the modal guard", async ({ page }, info) => {
  await page.goto("/merge-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(["tests/fixtures/alpha.pdf", "tests/fixtures/bravo.pdf"]);
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
  const menus: [string, () => Promise<void>][] =
    info.project.name === "desktop"
      ? [
          ["add files menu", () => page.getByTestId("cloud-caret-toolbar").click()],
          ["add pages menu", () => page.getByRole("button", { name: "Add pages", exact: true }).click()],
        ]
      : [["phone add sheet", () => page.getByRole("button", { name: "Add", exact: true }).click()]];
  for (const [where, open] of menus) {
    await open();
    const menu = popup(page);
    await expect(menu).toBeVisible();
    await expectQuiet(menu, where);
    await expectFocusRules(page, where);
    await page.keyboard.press("Escape");
    await expect(menu, `${where}: Escape closes it`).toBeHidden();
  }
});
