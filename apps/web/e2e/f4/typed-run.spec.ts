/**
 * The run uses the field's text as typed (eval G-3; spec F4/F5 P-8 "Enter"). Putting text into a field
 * in one go (a paste, Playwright's fill) and at once pressing Enter, Tab then Enter on the primary, or
 * the primary itself, must give the output of that text, on a slow page too: lazy chunks late (the
 * staging failure) and React's commits held by a stylesheet still loading.
 */
import { expect, test, type Page } from "@playwright/test";
import { holdCommits, slowLazyChunks } from "../support/slow";
import { downloadResult, field, flow, openReady, primary, splitMode, stepper, tabTo, textsOf, unzipOrdered } from "./support";

type How = "Enter" | "Tab, Enter" | "click";
const HOWS: How[] = ["Enter", "Tab, Enter", "click"];
const SLOW = { "late chunks": slowLazyChunks, "held commits": holdCommits } as const;

async function go(page: Page, how: How, target: () => ReturnType<Page["getByRole"]>) {
  if (how === "Enter") await target().press("Enter");
  else if (how === "Tab, Enter") {
    // Tab leaves the field (its blur rewrites the text); a primary that was disabled before the text
    // can take focus only once it is enabled, so Tab on to it then.
    await page.keyboard.press("Tab");
    await expect(primary(page)).toBeEnabled();
    await tabTo(page, primary(page));
    await page.keyboard.press("Enter");
  } else await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect(page.getByTestId("result")).toBeVisible();
  return downloadResult(page);
}
const twelve = (n: number) => `Twelve ${n}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

for (const [slow, apply] of Object.entries(SLOW))
  for (const how of HOWS) {
    test.describe(`${slow}, ${how}`, () => {
      test(`Split Custom: "1-2, 3-12" in one go gives the two parts`, async ({ page }) => {
        await openReady(page, "split-pdf", "twelve.pdf");
        // The slow-down comes first: the Parts field mounts with the mode, and with it the chunks.
        await apply(page);
        await splitMode(page, "Custom");
        await field(page).fill("1-2, 3-12");
        const out = await go(page, how, () => field(page));
        expect(out.name).toBe("twelve-split.zip");
        expect(unzipOrdered(out.bytes).map(([n]) => n)).toEqual(["twelve-1-2.pdf", "twelve-3-12.pdf"]);
      });

      test("Split Every N: 4 right after picking the mode gives 3 files", async ({ page }) => {
        await openReady(page, "split-pdf", "twelve.pdf");
        // The slow-down comes first here: the stepper mounts with the mode, and with it the chunks.
        await apply(page);
        await splitMode(page, "Every N pages");
        await stepper(page).fill("4");
        const out = await go(page, how, () => stepper(page));
        expect(unzipOrdered(out.bytes).map(([n]) => n)).toEqual(["twelve-1-4.pdf", "twelve-5-8.pdf", "twelve-9-12.pdf"]);
      });

      test(`Extract: "9, 2-3" in one go gives pages 2, 3, 9`, async ({ page }) => {
        await openReady(page, "extract-pdf-pages", "twelve.pdf");
        await apply(page);
        await field(page).fill("9, 2-3");
        const out = await go(page, how, () => field(page));
        expect(await textsOf(out.bytes)).toEqual([2, 3, 9].map(twelve));
      });

      test(`Delete: "5" in one go gives 11 pages without page 5`, async ({ page }) => {
        await openReady(page, "delete-pdf-pages", "twelve.pdf");
        await apply(page);
        await field(page).fill("5");
        const out = await go(page, how, () => field(page));
        expect(await textsOf(out.bytes)).toEqual(range(1, 12).filter((n) => n !== 5).map(twelve));
      });
    });
  }

test("Enter on invalid parts does not run and says what is wrong", async ({ page }) => {
  await openReady(page, "split-pdf", "twelve.pdf");
  await splitMode(page, "Custom");
  await holdCommits(page, 600);
  await field(page).fill("5-3");
  await field(page).press("Enter");
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("field-error")).toContainText("“5-3”");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});
