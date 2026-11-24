/**
 * Scrolling rules in the browser (docs/design/berrypdf.md "Scrolling"). The source twin is
 * src/lib/ui/scroll-rules.test.ts. On every page and tool state, at phone, tablet and laptop sizes:
 *
 * 1. The page never scrolls sideways.
 * 2. Anything that actually scrolls (content taller or wider than its box, overflow auto/scroll)
 *    is a registered region: data-ip-scroll = pages | rail | overlay | chips. A panel or card never
 *    scrolls inside itself (the owner's report: Merge's options box scrolling inside the page).
 * 3. No scroller inside another scroller (siblings are fine: the editor's canvas and its rail).
 * 4. Only chip rows scroll sideways, and only below 1024 px (they wrap from there).
 */
import { expect, test, type Page } from "@playwright/test";
import { isUsable, tools } from "../../src/tools/registry";
import { fx } from "../support/flow";

const usable = tools.filter((t) => isUsable(t) && t.flow);
const comingSoon = tools.find((t) => !isUsable(t));

const DESKTOP: [number, number][] = [
  [1280, 632],
  [1366, 657],
  [1440, 789],
  [1920, 969],
  [1024, 768],
];
const PHONE: [number, number][] = [
  [375, 667],
  [390, 664],
  [768, 1024],
];

/** Every rule violation on the page as it is now, as readable strings (empty = clean). */
async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const name = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const tid = el.getAttribute("data-testid");
      const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
      return `<${el.tagName.toLowerCase()}${id}${tid ? ` data-testid=${tid}` : ""}${cls ? ` .${cls}` : ""}>`;
    };
    const scrolls = (el: Element) => {
      const cs = getComputedStyle(el);
      const can = (v: string) => /(auto|scroll|overlay)/.test(v);
      return {
        x: can(cs.overflowX) && el.scrollWidth > el.clientWidth + 1,
        y: can(cs.overflowY) && el.scrollHeight > el.clientHeight + 1,
      };
    };
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`the page scrolls sideways by ${de.scrollWidth - de.clientWidth}px`);
    const wide = innerWidth >= 1024;
    for (const el of document.body.querySelectorAll("*")) {
      if (!el.getClientRects().length) continue;
      const s = scrolls(el);
      if (!s.x && !s.y) continue;
      const kind = el.getAttribute("data-ip-scroll");
      if (!kind) {
        out.push(`${name(el)} scrolls ${s.y ? "vertically" : ""}${s.x && s.y ? " and " : ""}${s.x ? "sideways" : ""} but is not a registered scroll region`);
        continue;
      }
      if (s.x && kind !== "chips") out.push(`${name(el)} (${kind}) scrolls sideways by ${el.scrollWidth - el.clientWidth}px`);
      if (s.x && kind === "chips" && wide) out.push(`${name(el)} (chips) scrolls sideways at ${innerWidth}px; chip rows wrap from 1024px`);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = scrolls(p);
        if (ps.x || ps.y) {
          out.push(`${name(el)} scrolls inside another scroller ${name(p)}`);
          break;
        }
      }
    }
    return out;
  });
}

async function expectClean(page: Page, where: string) {
  // Let entrance animations and late layout (thumbnails, fonts) settle.
  await page.waitForTimeout(400);
  expect(await violations(page), where).toEqual([]);
}

async function openTool(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

const pages = ["/", "/cookies", "/privacy", "/terms", "/edit-pdf", ...(comingSoon ? [`/${comingSoon.slug}`] : [])];

for (const [project, sizes] of [
  ["desktop", DESKTOP],
  ["mobile", PHONE],
] as const) {
  for (const [width, height] of sizes) {
    test.describe(`scroll rules ${width}x${height}`, () => {
      test.beforeEach(async ({ page }, info) => {
        test.skip(info.project.name !== project, `${project} sizes run in the ${project} project`);
        await page.setViewportSize({ width, height });
      });

      for (const path of pages) {
        test(`${path}: one scroller, nothing sideways`, async ({ page }) => {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await expectClean(page, `${path} on load`);
          // Pinned bars (the home search) and the end of the page too.
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
          await expectClean(page, `${path} scrolled`);
        });
      }

      for (const tool of usable) {
        test(`${tool.slug}: empty, loaded and options are free of nested or sideways scrollers`, async ({ page }) => {
          await openTool(page, tool.slug);
          await expectClean(page, "empty state");
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await expectClean(page, "empty state, scrolled to the end");
          await page.evaluate(() => window.scrollTo(0, 0));

          await page.getByTestId("file-input").setInputFiles(fx("sixty-pages.pdf"));
          await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready");
          await expectClean(page, "loaded");
          const pagesView = page.getByRole("radio", { name: "Pages", exact: true });
          if (await pagesView.count()) {
            await pagesView.click();
            await expectClean(page, "loaded, pages view");
          }
          const optionsButton = page.getByTestId("options-button");
          if (await optionsButton.isVisible()) {
            await optionsButton.click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expectClean(page, "options sheet open");
          }
        });
      }
    });
  }
}
