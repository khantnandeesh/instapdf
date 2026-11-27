/**
 * F5 fields use the text as typed (eval G-3): Alternate's pages per turn and Organize's Move to
 * position, filled in one go and acted on at once, on a slow page (lazy chunks late, React's commits
 * held by a stylesheet still loading). See e2e/f4/typed-run.spec.ts for the F4 fields.
 */
import { expect, test, type Page } from "@playwright/test";
import { holdCommits, slowLazyChunks } from "../support/slow";
import { downloadResult, flow, isDesktop, label, open, pickF5, primary, tabTo, textsOf, tileAction, tileLabels } from "./support";

const SLOW = { "late chunks": slowLazyChunks, "held commits": holdCommits } as const;
const perTurn = (page: Page, name: string) => page.getByRole("textbox", { name: `Pages per turn from ${name}` });
// odd.pdf holds Page 1, 3, 5, 7, 9 and even.pdf Page 2, 4, … 10; 2 per turn from odd.pdf: A1 A2 B1 A3 A4 B2 A5 B3 B4 B5.
const TWO_FROM_ODD = [1, 3, 2, 5, 7, 4, 9, 6, 8, 10].map((n) => `Page ${n}`);

async function finish(page: Page) {
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect(page.getByTestId("result")).toBeVisible();
  return downloadResult(page);
}

for (const [slow, apply] of Object.entries(SLOW)) {
  test.describe(slow, () => {
    for (const how of ["Enter", "Tab, Enter", "click"] as const)
      test(`Alternate: 2 per turn put in one go, then ${how}, mixes 2 from odd.pdf each turn`, async ({ page }) => {
        await open(page, "alternate-mix-pdf");
        await pickF5(page, "odd.pdf", "even.pdf");
        await expect(perTurn(page, "odd.pdf")).toHaveValue("1");
        await apply(page);
        await perTurn(page, "odd.pdf").fill("2");
        if (how === "Enter") await perTurn(page, "odd.pdf").press("Enter");
        else if (how === "click") await primary(page).click();
        else {
          await page.keyboard.press("Tab");
          await tabTo(page, primary(page));
          await page.keyboard.press("Enter");
        }
        const out = await finish(page);
        expect((await textsOf(out.bytes)).map(label)).toEqual(TWO_FROM_ODD);
      });

    test("Organize: Move to position 1 typed in one go and Enter moves the page to the front", async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name), "tile menu by hover, desktop");
      await open(page, "organize-pdf");
      await pickF5(page, "twelve.pdf");
      await tileAction(page, "A3", "Move to position…");
      const input = page.getByTestId("move-input");
      await expect(input).toBeVisible();
      await apply(page);
      await input.fill("1");
      await input.press("Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect.poll(async () => (await tileLabels(page)).slice(0, 3)).toEqual(["A3", "A1", "A2"]);
    });
  });
}
