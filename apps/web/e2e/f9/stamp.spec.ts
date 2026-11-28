/** F9 stamping tools: spec docs/specs/f9-stamps.md, AC-1130 onwards. */
import { expect, test, type Page } from "@playwright/test";
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, flow, fx, isDesktop, pick, primary, run, textsOf, tiles, unzip } from "../support/flow";

async function open(page: Page, slug: string, ...names: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Works on the options that sit in the side panel from 1024 px and in the More options sheet below. */
async function inOptions(page: Page, change: (where: "side" | "more") => Promise<void>) {
  if (wide(page)) return change("side");
  await page.getByRole("button", { name: /More options/ }).click();
  await change("more");
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
}
const stamps = (page: Page) => page.getByTestId("stamp-text");

test.describe("Page numbers", () => {
  test("AC-1130, AC-1131: every page gets its number, and the pages on screen show it first", async ({ page }) => {
    await open(page, "add-page-numbers", "three-pages.pdf");
    await expect(primary(page)).toHaveText("Number 3 pages");
    await expect(stamps(page)).toHaveText(["1", "2", "3"]);
    await expectNoSeriousAxeViolations(page, "Page numbers, loaded");
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    expect(texts.map((t) => t.slice(-1))).toEqual(["1", "2", "3"]);
  });

  test("AC-1132: format, first number and picked pages", async ({ page }) => {
    await open(page, "add-page-numbers", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.locator(`#numbers-format-${where}`).selectOption("page-n-of");
      await page.locator(`#numbers-first-${where}`).fill("5");
    });
    await tiles(page).nth(1).getByRole("button", { name: /^Page 2/ }).click();
    await tiles(page).nth(2).getByRole("button", { name: /^Page 3/ }).click();
    await expect(primary(page)).toHaveText("Number 2 pages");
    await expect(stamps(page)).toHaveText(["Page 5 of 6", "Page 6 of 6"]);
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    expect(texts[0]).not.toContain("of 6");
    expect(texts[1]).toContain("Page 5 of 6");
    expect(texts[2]).toContain("Page 6 of 6");
  });

  test("AC-1133: a first number that is not a number keeps the button waiting", async ({ page }) => {
    await open(page, "add-page-numbers", "three-pages.pdf");
    await inOptions(page, (where) => page.locator(`#numbers-first-${where}`).fill("x"));
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Enter the first number");
  });

  test("AC-1134: the position moves the number on the page", async ({ page }) => {
    await open(page, "add-page-numbers", "three-pages.pdf");
    const box = async () => {
      const tile = (await page.getByTestId("stamp-layer").first().boundingBox())!;
      const text = (await stamps(page).first().boundingBox())!;
      return { top: (text.y - tile.y) / tile.height, bottom: (tile.y + tile.height - text.y - text.height) / tile.height };
    };
    expect((await box()).bottom).toBeLessThan(0.08);
    await page.locator("#numbers-place-bar").selectOption("top-right");
    expect((await box()).top).toBeLessThan(0.08);
  });
});

test.describe("Header and footer", () => {
  test("AC-1140, AC-1141: lines with the file name and page numbers; the button waits for text", async ({ page }) => {
    await open(page, "pdf-header-footer", "three-pages.pdf");
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Type a header or a footer");
    await inOptions(page, async (where) => {
      await page.locator(`#hf-top-left-${where}`).fill("{file}");
      await page.locator(`#hf-bottom-right-${where}`).fill("Page {n} of {total}");
    });
    await expect(primary(page)).toHaveText("Add to 3 pages");
    await expect(stamps(page).first()).toHaveText("three-pages");
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    expect(texts[0]).toContain("three-pages");
    expect(texts[2]).toContain("Page 3 of 3");
  });

  test("AC-1142: Hindi and Arabic lines are written as typed", async ({ page }) => {
    await open(page, "pdf-header-footer", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.locator(`#hf-top-right-${where}`).fill("पृष्ठ {n}");
      await page.locator(`#hf-bottom-left-${where}`).fill("صفحة {n}");
    });
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    // A reader may put spaces or joiners between the joined letters it reads back: only letters, marks and digits are compared.
    const read = texts[1].normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]/gu, "");
    expect(read).toContain("पृष्ठ2");
    expect(read).toContain("صفحة");
  });
});

test.describe("Watermark", () => {
  test("AC-1150, AC-1151: text across the picked pages; empty text keeps the button waiting", async ({ page }) => {
    await open(page, "watermark-pdf", "three-pages.pdf");
    await expect(stamps(page)).toHaveText(["DRAFT", "DRAFT", "DRAFT"]);
    const text = page.getByLabel("Watermark text").locator("visible=true");
    await text.fill("");
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Type the watermark text");
    await text.fill("SAMPLE");
    await tiles(page).first().getByRole("button", { name: /^Page 1/ }).click();
    await expect(primary(page)).toHaveText("Watermark 1 page");
    await run(page);
    const out = await downloadResult(page);
    const texts = await textsOf(out.bytes);
    expect(texts[0]).toContain("SAMPLE");
    expect(texts[1]).not.toContain("SAMPLE");
    // See-through: the page has a graphics state with the chosen strength.
    const doc = await PDFDocument.load(out.bytes);
    const states = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
    expect(states.values().map((v) => String(doc.context.lookup(v))).join(" ")).toContain("/ca 0.3");
  });

  test("AC-1152: repeated across the page", async ({ page }) => {
    await open(page, "watermark-pdf", "three-pages.pdf");
    await inOptions(page, (where) => page.locator(`#mark-layout-${where}`).selectOption("tile").then(() => {}));
    expect(await stamps(page).count()).toBeGreaterThanOrEqual(12);
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    expect(texts[0].split("DRAFT").length - 1).toBeGreaterThanOrEqual(4);
  });

  test("AC-1153: a picture as the watermark", async ({ page }) => {
    await open(page, "watermark-pdf", "three-pages.pdf");
    await page.getByRole("radio", { name: "Picture" }).click();
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Choose a picture");
    await page.getByTestId("mark-image-input").setInputFiles(fx("delta.jpg"));
    await expect(page.getByTestId("stamp-layer").first().locator("img")).toBeVisible();
    await run(page);
    const doc = await PDFDocument.load((await downloadResult(page)).bytes);
    const xobjects = doc.getPage(2).node.Resources()!.lookup(PDFName.of("XObject"));
    expect(String(xobjects)).toMatch(/Image|\d+ 0 R/);
  });

  test("AC-1154: several files come back as a ZIP, each watermarked", async ({ page }) => {
    await open(page, "watermark-pdf", "three-pages.pdf", "alpha.pdf");
    await run(page);
    const files = unzip((await downloadResult(page)).bytes);
    expect(Object.keys(files).sort()).toEqual(["alpha.pdf", "three-pages.pdf"]);
    for (const bytes of Object.values(files)) expect((await textsOf(bytes))[0]).toContain("DRAFT");
  });
});

test.describe("Bates numbering", () => {
  test("AC-1170, AC-1171: numbers count on from file to file, shown on the pages first, and each file comes back numbered", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf", "twelve.pdf");
    await expect(primary(page)).toHaveText("Number 15 pages");
    await expect(stamps(page).nth(0)).toHaveText("000001");
    await expect(stamps(page).nth(3)).toHaveText("000004");
    await expectNoSeriousAxeViolations(page, "Bates numbering, loaded");
    await run(page);
    const zip = unzip((await downloadResult(page)).bytes);
    const first = await textsOf(zip["three-pages.pdf"]);
    const second = await textsOf(zip["twelve.pdf"]);
    expect(first.map((t) => /0000\d\d/.exec(t)?.[0])).toEqual(["000001", "000002", "000003"]);
    expect(/0000\d\d/.exec(second[0])?.[0]).toBe("000004");
    expect(/0000\d\d/.exec(second[11])?.[0]).toBe("000015");
  });

  test("AC-1172: line, digits, text before, first number and first file number", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.locator(`#bates-style-${where}`).selectOption("exhibit-page");
      await page.locator(`#bates-digits-${where}`).selectOption("4");
      await page.locator(`#bates-prefix-${where}`).fill("Case XYZ");
      await page.locator(`#bates-start-${where}`).fill("98");
      await page.locator(`#bates-doc-${where}`).fill("7");
    });
    await expect(stamps(page)).toHaveText(["Exhibit 7 Case XYZ 0098 Page 1", "Exhibit 7 Case XYZ 0099 Page 2", "Exhibit 7 Case XYZ 0100 Page 3"]);
    await run(page);
    const texts = await textsOf((await downloadResult(page)).bytes);
    expect(texts[2]).toContain("Exhibit 7 Case XYZ 0100 Page 3");
  });

  test("AC-1173: your own line with tokens; a first number that is not a number keeps the button waiting", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.locator(`#bates-style-${where}`).selectOption("custom");
      await page.locator(`#bates-custom-${where}`).fill("ABC-{bates} ({file})");
    });
    await expect(stamps(page).first()).toHaveText("ABC-000001 (three-pages)");
    await inOptions(page, (where) => page.locator(`#bates-start-${where}`).fill("x1"));
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Enter the first number");
  });

  test("AC-1174: an added strip grows the page at that edge; nothing on it moves or shrinks", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf");
    const before = (await PDFDocument.load(await (await import("node:fs/promises")).readFile(fx("three-pages.pdf")))).getPage(0).getSize();
    await inOptions(page, (where) => page.locator(`#bates-margin-${where}`).selectOption("room").then(() => {}));
    await run(page);
    const out = await PDFDocument.load((await downloadResult(page)).bytes);
    const after = out.getPage(0).getSize();
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeGreaterThan(before.height + 30);
    expect(after.height).toBeLessThan(before.height + 60);
  });

  test("AC-1175: pages picked in the second file only: the count starts there, and the pages show what the file gets", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf", "twelve.pdf");
    await tiles(page).nth(4).getByRole("button", { name: /^Page 2/ }).click();
    await tiles(page).nth(6).getByRole("button", { name: /^Page 4/ }).click();
    await expect(primary(page)).toHaveText("Number 2 pages");
    await expect(stamps(page)).toHaveText(["000001", "000002"]);
    await run(page);
    const zip = unzip((await downloadResult(page)).bytes);
    const second = await textsOf(zip["twelve.pdf"]);
    expect((await textsOf(zip["three-pages.pdf"])).some((t) => /0000\d\d/.test(t))).toBe(false);
    expect(/0000\d\d/.exec(second[1])?.[0]).toBe("000001");
    expect(/0000\d\d/.exec(second[3])?.[0]).toBe("000002");
    expect(/0000\d\d/.test(second[0])).toBe(false);
  });

  test("AC-1176: a file number left empty does not hold up a line that does not use it", async ({ page }) => {
    await open(page, "bates-numbering", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.locator(`#bates-style-${where}`).selectOption("exhibit");
      await page.locator(`#bates-doc-${where}`).fill("");
    });
    await expect(primary(page)).toBeDisabled();
    await inOptions(page, (where) => page.locator(`#bates-style-${where}`).selectOption("number").then(() => {}));
    await expect(primary(page)).toBeEnabled();
    await expect(stamps(page).first()).toHaveText("000001");
  });

  test("AC-1177: the number takes a colour and sizes from 6 to 60 pt, and a line of your own still ends above the fold", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the phone sheet scrolls; AC-1175 covers the phone layout");
    await page.setViewportSize({ width: 1280, height: 632 });
    await page.goto("/bates-numbering");
    await page.getByTestId("file-input").setInputFiles(fx("scan.pdf"));
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    const panel = page.locator(".ip-opt-side").last();
    const sizes = await panel.getByLabel("Text size", { exact: true }).locator("option").allTextContents();
    expect(sizes[0]).toBe("6");
    expect(sizes.at(-1)).toBe("60");
    await panel.getByLabel("Colour", { exact: true }).selectOption({ label: "Red" });
    await panel.getByLabel("Line", { exact: true }).selectOption({ label: "Your own" });
    await panel.getByLabel("Your line", { exact: true }).fill("ACME {bates} Doc {doc} of {file}");
    await expect(panel.getByLabel("Files from", { exact: true })).toBeVisible();
    // The result's name takes a prefix; what a file name cannot hold is dropped.
    await panel.getByLabel("Result name starts with", { exact: true }).fill("X9/-");
    expect(await panel.evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(632);
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("X9-scan.pdf");
    // The {file} token still gives the name the file came with.
    const line = (await textsOf(out.bytes))[0];
    expect(line).toContain("of scan");
    expect(line).not.toContain("X9-");
    const doc = await PDFDocument.load(out.bytes);
    const text = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => {
        try {
          return o instanceof PDFRawStream ? new TextDecoder("latin1").decode(decodePDFRawStream(o).decode()) : "";
        } catch {
          return "";
        }
      })
      .join("\n");
    // Red, as the fill colour of the line.
    expect(text).toMatch(/0?\.75\d* 0?\.22\d* 0?\.1[67]\d* (rg|sc|scn)\b/);
  });
});
