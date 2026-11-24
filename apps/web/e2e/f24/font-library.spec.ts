/**
 * F24 font library and font matching, in the editor (/edit-pdf): the font menu, the fonts of
 * the open PDF with their closest matches, the stand-in notice, the user's own fonts.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
const host = () => new URL(process.env.BASE_URL ?? "http://localhost:3000").host;

/** Every request: font library and matcher fetches, and anything that leaves this origin or sends a body. */
function watch(page: Page) {
  const library: string[] = [];
  const sent: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "blob:" || u.protocol === "data:") return;
    if (u.host !== host() || (r.method() !== "GET" && r.method() !== "HEAD")) sent.push(`${r.method()} ${r.url()}`);
    if (u.pathname.startsWith("/fonts/lib/") || u.pathname.includes("berry_fontmatch")) library.push(u.pathname);
  });
  return { library, sent };
}

async function open(page: Page, file = "font-coverage-1p.pdf") {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function openMenu(page: Page) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  await page.getByTestId("font-picker").first().click();
  await expect(page.getByTestId("font-menu")).toBeVisible();
}

async function addText(page: Page, text: string, fy = 0.4) {
  let b = (await page.getByTestId("page-1").boundingBox())!;
  // The page can be taller than the window (wide layouts open at fit width): bring the spot into view.
  const vh = page.viewportSize()!.height;
  const y = b.y + b.height * fy;
  if (y > vh - 120) {
    await page.getByTestId("canvas").evaluate((c, d) => c.scrollBy(0, d), y - vh / 2);
    await page.waitForTimeout(150);
    b = (await page.getByTestId("page-1").boundingBox())!;
  }
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * fy);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return new Uint8Array(await readFile((await dl.path())!));
}

/** BaseFont names of every font object in a PDF. */
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Font")) out.push(String(obj.get(PDFName.of("BaseFont"))));
  }
  return out;
}

test.describe("font library (desktop)", () => {
  test.skip(({ isMobile }) => isMobile, "the pointer flows are checked on desktop; the layout check below runs on mobile");

  test("AC-290: nothing of the library loads until the font menu opens", async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("t");
    await addText(page, "Plain");
    expect(seen.library).toEqual([]);
    await page.getByTestId("font-picker").first().click();
    await expect(page.getByTestId("font-menu")).toBeVisible();
    await expect.poll(() => seen.library.some((p) => p.endsWith("/fonts/lib/manifest.json"))).toBe(true);
    expect(seen.sent).toEqual([]);
  });

  test("AC-293: the menu lists the PDF's fonts with their closest match in words, and searches every family", async ({ page }) => {
    await open(page);
    await openMenu(page);
    const menu = page.getByTestId("font-menu");
    for (const title of ["In this document", "Standard", "On this device", "All fonts"]) await expect(menu.getByRole("group", { name: title })).toBeVisible();
    const doc = menu.getByTestId("font-doc");
    await expect(doc).toHaveCount(3);
    // The file's Liberation Serif is the open twin of Times: Tinos, and it says how close in words.
    await expect(doc.filter({ hasText: /^Liberation Serif(?! Bold)/ })).toContainText(/Tinos · (Exact|Very close)/, { timeout: 20_000 });
    await expect(doc.filter({ hasText: "Mono" })).toContainText(/· (Exact|Very close|Close|Similar)$/, { timeout: 20_000 });
    await expect(menu).not.toContainText(/\d\s?%/);

    // One scroll region: the list. The panel itself does not scroll, and nothing scrolls sideways.
    const scrollers = await menu.evaluate((el) => [el, ...el.querySelectorAll("*")].filter((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight).map((n) => n.getAttribute("data-ip-scroll")));
    expect(scrollers).toEqual(["overlay"]);
    expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.getByTestId("font-search").fill("robo mono");
    await expect(menu.getByRole("group", { name: "All fonts" }).getByRole("option")).toHaveText(["Roboto Mono"]);
    await page.getByTestId("font-search").fill("qqqq");
    await expect(menu).toContainText("No font with that name.");
  });

  test("AC-291, AC-292: a library font is fetched when picked, previewed, and embedded in the download", async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await openMenu(page);
    await page.getByTestId("font-search").fill("playfair");
    expect(seen.library.filter((p) => p.includes("/fonts/playfair-display/"))).toEqual([]);
    await page.locator('[data-font="playfair-display"]').click();
    await expect(page.getByTestId("font-picker").first()).toContainText("Playfair");
    await addText(page, "Set in a library font");
    await expect.poll(() => seen.library.filter((p) => /\/fonts\/playfair-display\/latin-400-normal\.[0-9a-f]{8}\.woff$/.test(p)).length).toBeGreaterThan(0);
    // Only the Latin slice the text needs.
    expect(seen.library.filter((p) => p.includes("/fonts/playfair-display/") && !p.includes("/latin-400-normal."))).toEqual([]);
    expect(await page.evaluate(() => document.fonts.check('16px "bp-playfair-display"'))).toBe(true);
    const names = await fontNames(await download(page));
    expect(names.some((n) => /PlayfairDisplay/.test(n))).toBe(true);
    expect(seen.sent).toEqual([]);
  });

  test("picking a font of the document uses its closest match", async ({ page }) => {
    await open(page);
    await openMenu(page);
    const row = page.getByTestId("font-doc").filter({ hasText: /^Liberation Serif(?! Bold)/ });
    await expect(row).toContainText("Tinos", { timeout: 20_000 });
    await row.click();
    await expect(page.getByTestId("font-picker").first()).toContainText("Tinos");
  });

  test("AC-286: a character the PDF's font lacks comes from the closest font, with an inline notice that offers another", async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("e");
    const line = page.getByTestId("line").nth(1);
    await expect(line).toBeVisible({ timeout: 30_000 });
    const before = (await line.getAttribute("data-text"))!;
    await line.click();
    await page.getByTestId("line-input").fill(`${before} QXZ`);
    await page.keyboard.press("Enter");
    const notice = page.getByTestId("font-notice");
    await expect(notice).toContainText("Liberation Serif isn’t complete in this file. Using Tinos.", { timeout: 30_000 });
    // A notice, not a dialog: nothing modal opened and the page still takes the keyboard.
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(notice.getByRole("button", { name: "Use your own font" })).toBeVisible();

    await notice.getByTestId("font-change").click();
    const menu = page.getByTestId("font-menu");
    const closest = menu.getByRole("group", { name: "Closest matches" }).getByRole("option");
    await expect(closest.first()).toContainText(/Tinos\s*(Exact|Very close)/);
    await expect(menu.getByRole("group", { name: "Closest matches" })).toBeInViewport({ ratio: 1 });
    await page.getByTestId("font-search").fill("lora");
    await page.locator('[data-font="lora"]').click();
    await expect(notice).toContainText("Using Lora.", { timeout: 30_000 });
    await expect(page.getByTestId("line").nth(1)).toHaveAttribute("data-text", `${before} QXZ`);

    const names = await fontNames(await download(page));
    expect(names.some((n) => /\+Lora/.test(n))).toBe(true);
    // The first stand-in was undone with the edit it came with.
    expect(names.some((n) => /\+Tinos/.test(n))).toBe(false);
    // The rest of the line keeps the embedded font.
    expect(names.some((n) => /LiberationSerif$/.test(n))).toBe(true);
    expect(seen.sent).toEqual([]);
  });

  test("each font and style of the document gets its own closest font", async ({ page }) => {
    await open(page);
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("e");
    const edit = async (n: number, add: string) => {
      const line = page.getByTestId("line").nth(n);
      await expect(line).toBeVisible({ timeout: 30_000 });
      const before = (await line.getAttribute("data-text"))!;
      await line.click();
      await page.getByTestId("line-input").fill(`${before}${add}`);
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("line").nth(n)).toHaveAttribute("data-text", `${before}${add}`, { timeout: 30_000 });
    };
    // Regular serif, then the bold heading, then the monospaced line.
    await edit(1, " QXZ");
    await expect(page.getByTestId("font-notice")).toContainText("Using Tinos.");
    await edit(0, " QXZ");
    await expect(page.getByTestId("font-notice")).toContainText(/Using Tinos Bold\./);
    await edit(3, " QXZ");
    await expect(page.getByTestId("font-notice")).toContainText(/JetBrains Mono isn’t complete in this file\. Using (?!Tinos)/);
    const names = await fontNames(await download(page));
    expect(names.filter((n) => /\+Tinos/.test(n)).length).toBeGreaterThanOrEqual(2);
  });

  test("a character no font here can draw is refused with a plain message; the typed text stays in the box and the file is unchanged", async ({ page }) => {
    await open(page);
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("e");
    const line = page.getByTestId("line").nth(1);
    await expect(line).toBeVisible({ timeout: 30_000 });
    const before = (await line.getAttribute("data-text"))!;
    await line.click();
    // A private-use code point: no document font and no library font has it.
    await page.getByTestId("line-input").fill(`${before} \uE123`);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("editor-notice")).toContainText("This font has no", { timeout: 30_000 });
    await expect(page.getByTestId("editor-notice")).toContainText("Your text is still in the box.");
    await expect(page.getByTestId("font-notice")).toHaveCount(0);
    // Nothing typed is thrown away: the box is open again with it, and it has the caret.
    const input = page.getByTestId("line-input");
    await expect(input).toHaveText(`${before} \uE123`);
    await expect(input).toBeFocused();
    // The hint says no font has it and offers the person's own, without ending the edit.
    await expect(page.getByTestId("line-missing-none")).toHaveText("No font here has it.");
    await expect(page.getByTestId("line-missing-own")).toHaveText("Use your own font");
    // Leaving the box with the same text doesn't try again or drop it.
    const notices = await page.getByTestId("editor-notice").count();
    await input.evaluate((el) => (el as HTMLElement).blur());
    await expect(input).toHaveText(`${before} \uE123`);
    expect(await page.getByTestId("editor-notice").count()).toBe(notices);
    // Without the character the edit goes through; Escape would have given the line back as it was.
    await input.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(" ok");
    await page.keyboard.press("Enter");
    await expect(input).toHaveCount(0);
    await expect(page.locator(`[data-testid="line"][data-text="${before} ok"]`)).toBeAttached({ timeout: 15_000 });
  });

  test("AC-294: your own font file is used and embedded without leaving the device; a file that isn't a font is refused", async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await openMenu(page);
    await page.getByTestId("font-file").setInputFiles({ name: "notes.ttf", mimeType: "font/ttf", buffer: Buffer.from("this is not a font") });
    await expect(page.getByTestId("font-error")).toContainText("isn’t a font we can read");
    await page.getByTestId("font-file").setInputFiles(corpus("fonts/NotoSansDevanagari-Regular.ttf"));
    await expect(page.getByTestId("font-picker").first()).toContainText("Noto Sans Dev");
    await addText(page, "कखग");
    await page.keyboard.press("t");
    await page.getByTestId("font-picker").first().click();
    await expect(page.getByTestId("font-menu").getByRole("group", { name: "On this device" }).getByRole("option", { name: /Noto Sans Devanagari/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    const names = await fontNames(await download(page));
    expect(names.some((n) => /NotoSansDevanagari/.test(n))).toBe(true);
    expect(seen.sent).toEqual([]);
  });

  test("AC-296: installed fonts are offered only where the browser can list them", async ({ page }) => {
    await open(page);
    await openMenu(page);
    const can = await page.evaluate(() => "queryLocalFonts" in window);
    await expect(page.getByTestId("font-installed")).toHaveCount(can ? 1 : 0);
    await expect(page.getByTestId("font-add")).toBeVisible();
  });

  test("AC-275: library files are content-addressed and cached for a year; the list is not", async ({ request }) => {
    const manifest = await request.get("/fonts/lib/manifest.json");
    expect(manifest.headers()["cache-control"]).toBe("public, max-age=300");
    const m = (await manifest.json()) as { families: string; features: string };
    for (const path of [m.families, m.features]) {
      expect(path).toMatch(/\.[0-9a-f]{8}\.(json|bin)$/);
      const res = await request.get(`/fonts/lib/${path}`);
      expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    }
    const families = (await (await request.get(`/fonts/lib/${m.families}`)).json()) as { i: string; l: string }[];
    expect(families.length).toBeGreaterThan(40);
    // AC-270: only licences on the serving list.
    expect(families.filter((f) => !["OFL-1.1", "Apache-2.0", "MIT"].includes(f.l))).toEqual([]);
    // AC-271: each family's licence text is published beside it.
    expect((await request.get(`/fonts/lib/licences/${families[0].i}.txt`)).ok()).toBe(true);
  });
});

test("on a phone the stand-in notice names both fonts in one compact row, with your own font inside Change", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await open(page);
  await page.getByTestId("dock-more").click();
  await page.getByRole("button", { name: /Edit text/ }).first().click();
  // A tool without options shows no empty strip.
  await expect(page.getByTestId("context-strip")).toBeHidden();
  const line = page.getByTestId("line").nth(1);
  await expect(line).toBeVisible({ timeout: 30_000 });
  const before = (await line.getAttribute("data-text"))!;
  await line.click();
  await page.getByTestId("line-input").fill(`${before} QXZ`);
  await page.keyboard.press("Enter");
  const notice = page.getByTestId("font-notice");
  // Both fonts are named in full (AC-286), never cut with an ellipsis.
  await expect(notice).toContainText("Liberation Serif isn’t complete. Using Tinos.", { timeout: 30_000 });
  expect(await notice.locator("span").first().evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const box = (await notice.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(60);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // It sits clear of the tool dock.
  const dock = (await page.getByTestId("dock").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(dock.y);
  await expect(notice.getByTestId("font-own")).toHaveCount(0);
  await notice.getByTestId("font-change").click();
  const menu = page.getByTestId("font-menu");
  await expect(menu.getByRole("group", { name: "Closest matches" })).toBeVisible();
  // No keyboard over the list: the search field is not focused on a touch screen.
  await expect(page.getByTestId("font-search")).not.toBeFocused();
  await expect(menu.getByTestId("font-own")).toHaveText("Use your own font");
});

test("the font menu fits a phone screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await open(page);
  const picker = page.getByTestId("font-picker").first();
  if (!(await picker.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^Text/ }).first().click();
  }
  await picker.click();
  const panel = page.locator(".ed-fonts-pop:popover-open");
  await expect(panel).toBeVisible();
  const vp = page.viewportSize()!;
  // The panel is placed again as its list fills in.
  await expect
    .poll(async () => {
      const box = (await panel.boundingBox())!;
      return box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y + box.height <= vp.height;
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
