/**
 * F24, editing a line in the PDF's own font (/edit-pdf): the edit box draws each part of the line
 * in the font, colour and place it has on the page, so opening it changes nothing on screen; a
 * typed character the font lacks is marked as typed, with the closest fonts to draw it.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { webFontFromProgram } from "../../src/lib/font-library/embedded-face";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page, file: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-engine", "ready", { timeout: 30_000 });
}

const lineWith = (page: Page, text: string) => page.locator(`[data-testid="line"][data-text*="${text}"]`).first();

async function edit(page: Page, line: Locator): Promise<Locator> {
  await line.click();
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  await expect(input).not.toHaveAttribute("data-faces", /pending/);
  return input;
}

/** Where the dark pixels of a screenshot are (its ink), in CSS pixels. Read on a blank page: the app's own page fetches nothing. */
async function ink(page: Page, png: Buffer) {
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      // The paper is the commonest colour; ink is what differs clearly from it.
      const paper = [d[0]!, d[1]!, d[2]!];
      let left = img.width, right = -1, top = img.height, bottom = -1, count = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (Math.abs(d[i]! - paper[0]!) + Math.abs(d[i + 1]! - paper[1]!) + Math.abs(d[i + 2]! - paper[2]!) < 200) continue;
          count++;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      const k = window.devicePixelRatio || 1;
      return { left: left / k, right: right / k, top: top / k, bottom: bottom / k, count };
    }, png.toString("base64"));
  } finally {
    await blank.close();
  }
}

const SAME_PLACE: [file: string, text: string, faces: RegExp][] = [
  ["chrome-justified-mixed.pdf", "Service Agreement", /^own$/],
  ["chrome-justified-mixed.pdf", "This agreement is made", /^own own own$/],
  ["libreoffice-memo.pdf", "The meeting moves", /^own/],
  ["font-coverage-1p.pdf", "charter line one", /^own$/],
  ["report-form-3p.pdf", "This report was made", /^own$/],
  ["std14-reportlab.pdf", "Quarterly review", /^close$/],
];

for (const [file, text, faces] of SAME_PLACE) {
  test(`the edit box opens over the text as it is on the page: ${file}, "${text}"`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "pixel positions are compared at one size");
    await open(page, file);
    const line = lineWith(page, text);
    const b = (await line.boundingBox())!;
    const clip = { x: Math.floor(b.x) - 2, y: Math.floor(b.y) + 1, width: Math.ceil(b.width) + 4, height: Math.ceil(b.height) - 2 };
    await page.mouse.move(2, 2);
    // The page is drawn sharper a moment after it first shows: wait until it stops changing.
    let shot = await page.screenshot({ clip });
    await expect(async () => {
      await page.waitForTimeout(250);
      const next = await page.screenshot({ clip });
      const same = next.equals(shot);
      shot = next;
      expect(same).toBe(true);
    }).toPass({ timeout: 10_000 });
    const before = await ink(page, shot);
    const input = await edit(page, line);
    await expect(input).toHaveAttribute("data-faces", faces);
    await expect(input).not.toHaveClass(/ed-input--settling/);
    // Only the text is compared: the caret, the outline and the pointer are taken away.
    await input.evaluate((el: HTMLElement) => {
      el.style.caretColor = "transparent";
      el.style.outline = "none";
      el.style.boxShadow = "none";
    });
    await page.mouse.move(2, 2);
    const during = await ink(page, await page.screenshot({ clip }));
    expect(before.count).toBeGreaterThan(50);
    // Same start, same baseline band and same length. (The amount of ink is only a sanity check:
    // the page is a scaled raster and the box is live text, so their edges are smoothed differently.)
    expect(Math.abs(during.left - before.left), "start").toBeLessThanOrEqual(1.5);
    // (A stand-in font has its own letter shapes, so its ink may reach a little further.)
    const reach = faces.source.includes("close") ? 3 : 1.5;
    expect(Math.abs(during.top - before.top), "top").toBeLessThanOrEqual(reach);
    expect(Math.abs(during.bottom - before.bottom), "bottom").toBeLessThanOrEqual(reach);
    expect(Math.abs(during.right - before.right), "end").toBeLessThanOrEqual(faces.source.includes("close") ? 6 : 2.5);
    expect(during.count / before.count).toBeGreaterThan(0.5);
    expect(during.count / before.count).toBeLessThan(2.2);
  });
}

test("the paper under the edit box never covers the line below it (tight leading)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "pixels are compared at one size");
  await open(page, "chrome-justified-mixed.pdf");
  const next = lineWith(page, "and it stays in force");
  const nb = (await next.boundingBox())!;
  // The lower two thirds of the next line: its own letters, clear of the edited line's descenders.
  const clip = { x: Math.floor(nb.x) + 4, y: Math.floor(nb.y + nb.height * 0.35), width: Math.ceil(nb.width) - 8, height: Math.floor(nb.height * 0.6) };
  await page.mouse.move(2, 2);
  let shot = await page.screenshot({ clip });
  await expect(async () => {
    await page.waitForTimeout(250);
    const again = await page.screenshot({ clip });
    const same = again.equals(shot);
    shot = again;
    expect(same).toBe(true);
  }).toPass({ timeout: 10_000 });
  const input = await edit(page, lineWith(page, "This agreement is made"));
  await input.evaluate((el: HTMLElement) => {
    el.style.caretColor = "transparent";
    el.style.outline = "none";
    el.style.boxShadow = "none";
  });
  await page.mouse.move(2, 2);
  // Not one pixel of the line below changes while the line above it is open.
  expect((await page.screenshot({ clip })).equals(shot)).toBe(true);
  // And the hint goes over the box here, because text lies right under it.
  await page.keyboard.press("End");
  await page.keyboard.type("ř");
  await expect(page.getByTestId("line-missing")).toHaveAttribute("data-side", "over");
  const hb = (await page.getByTestId("line-missing").boundingBox())!;
  expect(hb.y + hb.height).toBeLessThanOrEqual((await input.boundingBox())!.y);
  expect(hb.height).toBeLessThanOrEqual(30);
  expect(await page.getByTestId("line-missing").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
});

test("each part of a line is drawn in the font and colour it has in the PDF, never in another font", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = lineWith(page, "This agreement is made");
  await line.click();
  const input = page.getByTestId("line-input");
  // From the first moment: either the PDF's fonts are in, or the box is still clear and the page's own text shows through.
  const first = await input.evaluate((el) => ({ faces: el.dataset.faces ?? "", clear: el.classList.contains("ed-input--settling") }));
  expect(first.clear || !first.faces.includes("pending")).toBe(true);
  await expect(input).toHaveAttribute("data-faces", "own own own");
  await expect(input).not.toHaveClass(/ed-input--settling/);
  const parts = await input.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-font]")].map((s) => {
      const cs = getComputedStyle(s);
      const family = cs.fontFamily.split(",")[0]!.trim().replace(/"/g, "");
      return { text: s.textContent ?? "", family, loaded: document.fonts.check(`${cs.fontSize} "${family}"`, s.textContent ?? ""), weight: cs.fontWeight, style: cs.fontStyle, color: cs.color };
    }),
  );
  expect(parts.length).toBeGreaterThanOrEqual(3);
  for (const p of parts) {
    expect(p.family, p.text).toMatch(/^bp-doc-\d+-\d+$/);
    expect(p.loaded, p.text).toBe(true);
    // The embedded font is the bold or italic face itself: nothing is faked on top.
    expect([p.weight, p.style]).toEqual(["400", "normal"]);
  }
  expect(new Set(parts.map((p) => p.family)).size).toBe(3);
  expect(parts.find((p) => p.text.includes("Provider"))!.family).not.toBe(parts[0]!.family);
  await input.press("Escape");

  // The heading keeps its colour in the box.
  const heading = await edit(page, lineWith(page, "Service Agreement"));
  const color = await heading.evaluate((el) => getComputedStyle(el.querySelector("[data-font]")!).color);
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  expect(r! > g! + 40 && r! > b! + 20, color).toBe(true);
  expect(await heading.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("rgb(255, 255, 255)");
});

test("a click puts the caret where it landed", async ({ page }) => {
  await open(page, "report-form-3p.pdf");
  const line = lineWith(page, "This report was made");
  const text = (await line.getAttribute("data-text"))!;
  const b = (await line.boundingBox())!;
  await line.click({ position: { x: b.width * 0.3, y: b.height / 2 } });
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  await expect(input).not.toHaveAttribute("data-faces", /pending/);
  await expect(input).toHaveText(text);
  await page.keyboard.type("Q");
  const at = ((await input.textContent()) ?? "").indexOf("Q");
  expect(at, "caret near the click, not at either end").toBeGreaterThan(text.length * 0.1);
  expect(at).toBeLessThan(text.length * 0.5);
  await input.press("Escape");
  await expect(input).toHaveCount(0);

});

test("the keyboard opens a line with the caret at its end", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard path is the desktop one");
  await open(page, "report-form-3p.pdf");
  const input = page.getByTestId("line-input");
  await page.getByRole("listbox", { name: "Text on page 1" }).focus();
  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await page.keyboard.type("Z");
  expect(await input.textContent()).toMatch(/Z$/);
  await input.press("Escape");
});

test("a typed letter the font lacks is marked as typed, with fonts to draw it; picking one keeps the edit going", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = lineWith(page, "and it stays in force");
  const text = (await line.getAttribute("data-text"))!;
  const input = await edit(page, line);
  await expect(input).toHaveAttribute("data-missing", "");
  await expect(page.getByTestId("line-missing")).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.type(" Dvořák");
  // Typing is never blocked: the text is in, and the letter is named and underlined in place.
  await expect(input).toHaveText(`${text} Dvořák`);
  await expect(input).toHaveAttribute("data-missing", /ř/);
  const hint = page.getByTestId("line-missing");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Not in this font");
  await expect(hint).toContainText("ř");
  expect(await page.evaluate(() => (CSS.highlights.get("ed-miss")?.size ?? 0) > 0)).toBe(true);
  expect(await input.getAttribute("aria-describedby")).toBe(await hint.getAttribute("id"));

  const picks = page.getByTestId("line-missing-font");
  await expect(picks.first()).toBeVisible();
  expect(await picks.count()).toBeGreaterThanOrEqual(2);
  await expect(picks.first()).toHaveAttribute("aria-pressed", "true");
  // The whole hint stays inside the window (phones too).
  const hb = (await hint.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(hb.x).toBeGreaterThanOrEqual(0);
  expect(hb.x + hb.width).toBeLessThanOrEqual(vw);

  const second = picks.nth(1);
  const id = (await second.getAttribute("data-font-id"))!;
  const label = (await second.textContent())!;
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveText(`${text} Dvořák`);
  // The picked font draws the letter in the box at once: it comes right after the PDF's own font.
  expect(await input.evaluate((el) => getComputedStyle(el.querySelector("[data-font]")!).fontFamily)).toMatch(new RegExp(`^"?bp-doc-[\\d-]+"?, "?bp-${id}"?`));

  // Deleting the letters clears the marks.
  for (let i = 0; i < " Dvořák".length; i++) await page.keyboard.press("Backspace");
  await expect(input).toHaveAttribute("data-missing", "");
  await expect(hint).toHaveCount(0);
  await page.keyboard.type(" Dvořák");
  await expect(hint).toBeVisible();

  // A screen reader is told, and the fonts are reachable by keyboard without ending the edit.
  await expect(page.getByTestId("line-missing-status")).toContainText("Not in this font: ř");
  await page.keyboard.press("Tab");
  await expect(picks.first()).toBeFocused();
  await expect(input).toHaveCount(1);
  // The row keeps its order after a pick; Enter on the first font picks it and hands the caret back.
  await expect(second).toHaveAttribute("data-font-id", id);
  const firstLabel = (await picks.first().textContent())!;
  await page.keyboard.press("Enter");
  await expect(picks.first()).toHaveAttribute("aria-pressed", "true");
  await expect(input).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(lineWith(page, "Dvořák")).toBeAttached({ timeout: 15_000 });
  // The file is written with the font that was picked.
  await expect(page.getByTestId("font-notice")).toContainText(`Using ${firstLabel}`);
  expect(firstLabel).not.toBe(label);
});

test("a PDF's bare CFF font program becomes a font the browser loads, with the PDF's widths", async ({ page }) => {
  const cff = new Uint8Array(readFileSync("src/lib/font-library/__fixtures__/berry-test.cff"));
  const file = webFontFromProgram({
    bytes: cff,
    format: "cff",
    glyphs: [
      { cp: 65, gid: 1, width: 600 },
      { cp: 66, gid: 2, width: 700 },
    ],
  })!;
  await page.goto("/edit-pdf");
  const widths = await page.evaluate(async (bytes) => {
    const face = new FontFace("bp-test-cff", new Uint8Array(bytes).buffer);
    await face.load();
    document.fonts.add(face);
    const g = document.createElement("canvas").getContext("2d")!;
    g.font = '100px "bp-test-cff"';
    return [g.measureText("A").width, g.measureText("B").width, document.fonts.check('100px "bp-test-cff"', "AB")];
  }, [...file]);
  expect(widths[0]).toBeCloseTo(60, 2);
  expect(widths[1]).toBeCloseTo(70, 2);
  expect(widths[2]).toBe(true);
});
