/**
 * F24, joined scripts (Hindi, Arabic) in the edit box: a browser can't join letters with a PDF's
 * subset, so the box draws the line as the engine would draw the edit (previewLine). Opening it
 * changes nothing on screen, and what it shows while typing is what Enter writes.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page, file: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-engine", "ready", { timeout: 30_000 });
}

const lineStarting = (page: Page, text: string) => page.locator(`[data-testid="line"][data-text^="${text}"]`).first();

/** Where the dark pixels of a screenshot are (its ink), in CSS pixels. Read on a blank page. */
async function ink(page: Page, png: Buffer) {
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let left = img.width, right = -1, top = img.height, bottom = -1, count = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          // Dark ink on light paper (the ring is taken away before a shot).
          if (d[i]! + d[i + 1]! + d[i + 2]! > 300) continue;
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

/** A screenshot once the page stops changing (pdf.js draws it sharper a moment after it shows). */
async function settled(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  await page.mouse.move(2, 2);
  let shot = await page.screenshot({ clip });
  await expect(async () => {
    await page.waitForTimeout(250);
    const next = await page.screenshot({ clip });
    const same = next.equals(shot);
    shot = next;
    expect(same).toBe(true);
  }).toPass({ timeout: 10_000 });
  return shot;
}

/** Only the text is compared: the caret and the ring are taken away (the paper stays). */
async function textOnly(input: Locator) {
  await input.evaluate((el: HTMLElement) => {
    el.style.caretColor = "transparent";
    el.style.backgroundImage = el.style.backgroundImage.split("), ").slice(-1)[0]!;
    el.style.backgroundPosition = el.style.backgroundPosition.split(", ").slice(-1)[0]!;
    el.style.backgroundSize = el.style.backgroundSize.split(", ").slice(-1)[0]!;
  });
}

const near = (a: Awaited<ReturnType<typeof ink>>, b: Awaited<ReturnType<typeof ink>>, what: string) => {
  expect(b.count, `${what}: ink`).toBeGreaterThan(50);
  for (const k of ["left", "right", "top", "bottom"] as const) expect(Math.abs(a[k] - b[k]), `${what}: ${k}`).toBeLessThanOrEqual(1.5);
  expect(a.count / b.count, `${what}: amount of ink`).toBeGreaterThan(0.8);
  expect(a.count / b.count, `${what}: amount of ink`).toBeLessThan(1.25);
};

const CASES: [file: string, starts: string, typed: string][] = [
  ["scripts-plain.pdf", "कुल", " नया"],
  ["scripts-plain.pdf", "مرحبا", " جديد"],
  // Chrome's subsets have no joining rules: the new word reuses glyphs already on the line.
  ["scripts-chrome.pdf", "कुल", " समय"],
  ["scripts-chrome.pdf", "مرحبا", " نص"],
];

for (const [file, starts, typed] of CASES) {
  test(`a joined-script line opens as it is on the page and shows what Enter writes: ${file}, "${starts}…" + "${typed}"`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "pixel positions are compared at one size");
    await open(page, file);
    const line = lineStarting(page, starts);
    const want = (await line.getAttribute("data-text"))! + typed;
    const b = (await line.boundingBox())!;
    // Room on both sides: the line grows to the right (Hindi) or to the left (Arabic).
    const clip = { x: Math.max(0, Math.floor(b.x) - 90), y: Math.floor(b.y) + 1, width: Math.ceil(b.width) + 180, height: Math.ceil(b.height) - 2 };
    const before = await ink(page, await settled(page, clip));

    await line.click();
    const input = page.getByTestId("line-input");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("data-drawn", "engine", { timeout: 20_000 });
    await expect(page.getByTestId("line-glyphs")).toBeVisible();
    await textOnly(input);
    near(await ink(page, await settled(page, clip)), before, "opened");

    await page.keyboard.press("End");
    await page.keyboard.type(typed, { delay: 30 });
    await expect(input).toHaveAttribute("data-drawn", "engine", { timeout: 20_000 });
    await textOnly(input);
    const typedInk = await ink(page, await settled(page, clip));
    expect(typedInk.count).toBeGreaterThan(before.count);

    await page.keyboard.press("Enter");
    await expect(page.locator(`[data-testid="line"][data-text="${want}"]`)).toHaveCount(1, { timeout: 20_000 });
    near(await ink(page, await settled(page, clip)), typedInk, "written");
  });
}

test("an edit the engine refuses shows the typed text in a font that joins letters, and nothing is written", async ({ page }) => {
  await open(page, "scripts-plain.pdf");
  const line = lineStarting(page, "مرحبا");
  const text = (await line.getAttribute("data-text"))!;
  await line.click();
  const input = page.getByTestId("line-input");
  await expect(input).toHaveAttribute("data-drawn", "engine", { timeout: 20_000 });
  await page.keyboard.press("End");
  // Punctuation next to punctuation in a right-to-left line: PDFium would reorder it.
  await page.keyboard.type("!");
  await expect(input).toHaveAttribute("data-drawn", "stand-in", { timeout: 20_000 });
  await expect(page.getByTestId("line-glyphs")).toHaveCount(0);
  await expect(input).toHaveText(`${text}!`);
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-testid="line"][data-text="${text}"]`)).toHaveCount(1);
});
