/**
 * Modal guard (docs/design/berrypdf.md "Modals"). Written after the owner's review of the Merge page preview
 * (2026-11-24): a small white page in a huge white modal, a decorative wave on top, a big title and file name,
 * and three chunky full-width buttons with an off-theme ring. Every rule below is something a screenshot review
 * missed, so it is checked here at a phone (390x844) and a laptop (1280x720) size:
 *
 * 1. The page preview fills the space: page height ≥ 85% of the dialog (desktop), width ≥ 90% (phone).
 * 2. Buttons are normal-sized: none is taller than 48px.
 * 3. Nothing sits above the content (the description under the title counts as content) except the title, the
 *    page counter and the close button (no bands, badges,
 *    handles or file names up there), and the modal surface carries no background image (the wave).
 * 4. A pointer click shows no focus ring; keyboard focus shows one, on-theme (not the blueberry link ring).
 * 5. Escape closes it.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fx } from "../support/flow";

const SIZES = [
  { name: "phone", width: 390, height: 844, project: "mobile" },
  { name: "desktop", width: 1280, height: 720, project: "desktop" },
] as const;

/** The site's link blue (--link), the old modal focus ring the owner flagged as off-theme. */
const LINK_BLUE = "rgb(74, 99, 217)";

const openDialog = (page: Page) => page.locator("dialog[open]").last();

async function openTool(page: Page, slug: string, files: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(files.map(fx));
}
const ready = (page: Page) => expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");

/** Rule 2. */
async function expectNormalButtons(dialog: Locator, where: string) {
  // Action buttons: choice tiles (role=radio) and page tiles in the picker are content, not controls.
  const heights = await dialog.locator("button:visible:not([role=radio], [data-pick])").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("aria-label") ?? e.textContent?.trim() ?? "", h: e.getBoundingClientRect().height })),
  );
  expect(heights.length, `${where}: has buttons`).toBeGreaterThan(0);
  for (const b of heights) expect(b.h, `${where}: button "${b.name}" height`).toBeLessThanOrEqual(48);
}

/**
 * Rule 3. `contentTop` is where the content starts: everything visible whose top is above it must be part of
 * the title, the counter or the close button.
 */
async function expectQuietTop(dialog: Locator, contentTop: Locator, where: string) {
  const stray = await dialog.evaluate((d, top) => {
    const limit = top.getBoundingClientRect().top;
    // The description under the title is body copy: it counts as content.
    const desc = d.getAttribute("aria-describedby");
    const allowed = `h2, [aria-label="Close"], [data-testid="page-preview-counter"]${desc ? `, [id="${desc}"]` : ""}`;
    const out: string[] = [];
    for (const el of d.querySelectorAll("*")) {
      if (el.children.length && !(el instanceof SVGElement)) continue; // leaves only (and whole icons)
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top >= limit - 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      if (!el.closest(allowed)) out.push(`<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}"> "${el.textContent?.trim().slice(0, 30)}"`);
    }
    for (const el of [d, ...d.querySelectorAll(":scope > *")]) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg !== "none") out.push(`background image on <${el.tagName.toLowerCase()}>: ${bg.slice(0, 40)}`);
    }
    return out;
  }, await contentTop.elementHandle());
  expect(stray, `${where}: only the title, counter and close sit above the content; no decoration`).toEqual([]);
}

/** Rule 4: `button` is clicked with the pointer (it must not close the dialog). */
async function expectFocusRules(page: Page, button: Locator, where: string) {
  await button.click();
  const afterClick = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const cs = getComputedStyle(a);
    return { ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0, focusVisible: a.matches(":focus-visible") };
  });
  expect(afterClick, `${where}: a pointer click shows no focus ring`).toEqual({ ring: false, focusVisible: false });
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const cs = getComputedStyle(a);
    return { visible: a.matches(":focus-visible"), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, field: a.matches(".ip-field") };
  });
  expect(afterTab.visible, `${where}: Tab shows focus`).toBe(true);
  if (!afterTab.field) {
    expect(afterTab.style, `${where}: keyboard focus ring`).not.toBe("none");
    expect(afterTab.width, `${where}: keyboard focus ring width`).toBeGreaterThanOrEqual(2);
    expect(afterTab.color, `${where}: focus ring is on-theme`).not.toBe(LINK_BLUE);
  }
}

/** Rule 5. */
async function expectEscapeCloses(page: Page, where: string) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]"), `${where}: Escape closes it`).toHaveCount(0);
}

for (const size of SIZES) {
  test.describe(`modals at ${size.width}x${size.height}`, () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== size.project, `${size.name} size runs in the ${size.project} project`);
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("page preview: the page fills the view, chrome is quiet, keys and swipe move, Escape and a backdrop tap close", async ({ page }) => {
      await openTool(page, "merge-pdf", ["sixty-pages.pdf", "alpha.pdf"]);
      await ready(page);
      if (size.project === "desktop") await page.getByTestId("file-card").first().hover();
      await page.getByRole("button", { name: "Enlarge sixty-pages.pdf" }).click({ force: size.project === "mobile" });
      const dialog = openDialog(page);
      const paper = dialog.getByTestId("page-preview-page");
      await expect(paper.locator("canvas")).toBeVisible();

      // 1. Fill: against the dialog's own box (the viewer covers the viewport).
      const d = (await dialog.boundingBox())!;
      const p = (await paper.boundingBox())!;
      if (size.project === "desktop") expect(p.height / d.height, "page height / dialog height").toBeGreaterThanOrEqual(0.85);
      else expect(p.width / d.width, "page width / dialog width").toBeGreaterThanOrEqual(0.9);
      // Sharp: the canvas has at least the screen's pixel ratio of pixels.
      const sharp = await paper.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width / c.getBoundingClientRect().width >= Math.min(devicePixelRatio, 3) - 0.05);
      expect(sharp, "drawn at the device pixel ratio").toBe(true);
      // The white page has an edge on the dark backdrop.
      expect(await paper.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none");

      // 2-3. Chrome.
      await expectNormalButtons(dialog, "preview");
      await expectQuietTop(dialog, paper, "preview");
      await expect(dialog.getByTestId("page-preview-counter")).toHaveText(/^\s*1 \/ 60/);
      // Phones: the arrows are in the thumb zone (bottom quarter).
      if (size.project === "mobile") {
        const next = (await dialog.getByRole("button", { name: "Next page" }).boundingBox())!;
        expect(next.y, "Next is in the thumb zone").toBeGreaterThan(size.height * 0.75);
      }

      // Navigation: arrows, Home / End, swipe (phone).
      await page.keyboard.press("ArrowRight");
      await expect(dialog.getByTestId("page-preview-counter")).toHaveText(/^\s*2 \/ 60/);
      await page.keyboard.press("End");
      await expect(dialog.getByTestId("page-preview-counter")).toHaveText(/^\s*60 \/ 60/);
      await page.keyboard.press("Home");
      await expect(dialog.getByTestId("page-preview-counter")).toHaveText(/^\s*1 \/ 60/);
      if (size.project === "mobile") {
        const box = (await paper.boundingBox())!;
        const y = box.y + box.height / 2;
        await paper.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: box.x + box.width * 0.8, clientY: y });
        await paper.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: box.x + box.width * 0.2, clientY: y + 6 });
        await expect(dialog.getByTestId("page-preview-counter"), "a left swipe shows the next page").toHaveText(/^\s*2 \/ 60/);
      }

      // 4. Focus.
      await expectFocusRules(page, dialog.getByRole("button", { name: "Next page" }), "preview");

      // 5. Escape closes; reopen, and a tap on the backdrop closes too.
      await expectEscapeCloses(page, "preview");
      if (size.project === "desktop") await page.getByTestId("file-card").first().hover();
      await page.getByRole("button", { name: "Enlarge sixty-pages.pdf" }).click({ force: size.project === "mobile" });
      await expect(openDialog(page).getByTestId("page-preview-page")).toBeVisible();
      await page.mouse.click(size.width / 2, size.project === "desktop" ? 20 : 24);
      await expect(page.locator("dialog[open]"), "a click on the backdrop closes it").toHaveCount(0);
    });

    test("password dialog", async ({ page }) => {
      await openTool(page, "rotate-pdf", ["user-pw.pdf"]);
      const dialog = openDialog(page);
      await expect(dialog.getByLabel("Password", { exact: true })).toBeVisible();
      await expectNormalButtons(dialog, "password");
      await expectQuietTop(dialog, dialog.locator("[data-ip-scroll] > :nth-child(2)"), "password");
      await expectFocusRules(page, dialog.getByRole("button", { name: "Show password" }), "password");
      await expectEscapeCloses(page, "password");
    });

    test("leave guard", async ({ page }) => {
      await openTool(page, "rotate-pdf", ["three-pages.pdf"]);
      await ready(page);
      await page.locator('header a[href="/"]').first().click();
      const dialog = openDialog(page);
      await expect(dialog).toBeVisible();
      await expectNormalButtons(dialog, "leave guard");
      await expectQuietTop(dialog, dialog.getByTestId("dialog-footer"), "leave guard");
      await expectEscapeCloses(page, "leave guard");
    });

    test("page picker", async ({ page }) => {
      await openTool(page, "merge-pdf", ["alpha.pdf", "bravo.pdf"]);
      await ready(page);
      await page.getByRole("button", { name: size.width < 640 ? "Add" : "Add pages", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Pages from a file…", exact: true }).click();
      await page.getByTestId("pages-file-input").setInputFiles(fx("three-pages.pdf"));
      const dialog = openDialog(page);
      await expect(dialog.getByTestId("picker-grid")).toBeVisible();
      await expectNormalButtons(dialog, "page picker");
      await expectQuietTop(dialog, dialog.locator("[data-ip-scroll] > :nth-child(2)"), "page picker");
      await expectFocusRules(page, dialog.getByRole("button", { name: "Select all" }), "page picker");
      await expectEscapeCloses(page, "page picker");
    });

    test("move to position", async ({ page }) => {
      await openTool(page, "merge-pdf", ["alpha.pdf", "bravo.pdf"]);
      await ready(page);
      await page.getByRole("radio", { name: "Pages" }).click();
      const tile = page.locator("[data-uid]").filter({ has: page.getByTestId("tile-label").getByText("B2", { exact: true }) });
      await tile.hover();
      await tile.getByTestId("tile-more").click();
      await page.getByRole("menuitem", { name: /Move to position/ }).click();
      const dialog = openDialog(page);
      await expect(dialog).toBeVisible();
      await expectNormalButtons(dialog, "move to position");
      await expectQuietTop(dialog, dialog.locator("[data-ip-scroll] > :nth-child(2)"), "move to position");
      await expectEscapeCloses(page, "move to position");
    });

    test("editor sign dialog", async ({ page }) => {
      await page.goto("/edit-pdf");
      await page.getByTestId("editor-input").setInputFiles(fx("three-pages.pdf"));
      await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
      await page.getByTestId("canvas").focus();
      await page.keyboard.press("s");
      const content = page.getByTestId("sign-dialog");
      await expect(content).toBeVisible();
      const dialog = openDialog(page);
      await expectNormalButtons(dialog, "sign");
      await expectQuietTop(dialog, content, "sign");
      await expectFocusRules(page, dialog.getByRole("radio", { name: "Draw" }), "sign");
      await expectEscapeCloses(page, "sign");
    });
  });
}
