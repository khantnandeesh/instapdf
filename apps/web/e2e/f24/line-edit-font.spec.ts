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
  // An embedded CFF program (Type 1C), and a subset whose own advance table is wrong: both are
  // set by the widths the PDF declares.
  ["latex-type1c.pdf", "The e", /^own/],
  ["reportlab-mono-subset.pdf", "The quick brown fox", /^own$/],
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
    // Only the text is compared: the caret, the ring and the pointer are taken away.
    await input.evaluate((el: HTMLElement) => {
      el.style.caretColor = "transparent";
      // (the ring is the first background layers; the paper is the last)
      el.style.backgroundImage = el.style.backgroundImage.split("), ").slice(-1)[0]!;
      el.style.backgroundPosition = el.style.backgroundPosition.split(", ").slice(-1)[0]!;
      el.style.backgroundSize = el.style.backgroundSize.split(", ").slice(-1)[0]!;
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

test("nothing of the edit box (paper, ring) covers the line below it, at any size (tight leading)", async ({ page }, info) => {
  await open(page, "chrome-justified-mixed.pdf");
  const next = lineWith(page, "and it stays in force");
  const nb = (await next.boundingBox())!;
  // The next line's own text box: the line's hit area less its padding (15% of the text's height, 2px at least).
  const pad = Math.max(2, (nb.height * 0.15) / 1.3);
  const clip = { x: Math.floor(nb.x), y: Math.ceil(nb.y + pad) + 1, width: Math.ceil(nb.width), height: Math.floor(nb.height - 2 * pad) - 2 };
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
  // The box is left exactly as a person sees it, ring and all; only the blinking caret is hidden.
  await input.evaluate((el: HTMLElement) => (el.style.caretColor = "transparent"));
  await page.mouse.move(2, 2);
  await expect(input).not.toHaveClass(/ed-input--settling/);
  // Not one pixel of the line below changes while the line above it is open.
  expect((await page.screenshot({ clip })).equals(shot)).toBe(true);
  // The ring is inside the box and stops short of the next line's text, and it is still a closed
  // rectangle: two sides, top, bottom (and the paper under the text).
  await expect(input).toHaveAttribute("data-inset", /bottom/);
  expect(await input.evaluate((el) => getComputedStyle(el).backgroundImage.split("linear-gradient").length - 1)).toBe(5);
  const ring = await input.evaluate((el) => {
    const cs = getComputedStyle(el);
    const ys = cs.backgroundPositionY.split(", ").map(parseFloat);
    const hs = cs.backgroundSize.split(", ").map((x) => parseFloat(x.split(" ")[1]));
    // Layers: left, right, top, bottom, paper. The bottom edge ends where the sides end.
    return { top: ys[2], sideTop: ys[0], bottomEnd: ys[3] + hs[3], sideEnd: ys[0] + hs[0], height: el.clientHeight };
  });
  expect(ring.top).toBe(ring.sideTop);
  expect(Math.abs(ring.bottomEnd - ring.sideEnd)).toBeLessThanOrEqual(0.5);
  expect(ring.bottomEnd).toBeLessThan(ring.height);
  expect(await input.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).boxShadow])).toEqual(["none", "none"]);
  // And the hint goes over the box here, because text lies right under it.
  await page.keyboard.press("End");
  await page.keyboard.type("ř");
  const hb0 = page.getByTestId("line-missing");
  if (info.project.name === "desktop") {
    await expect(hb0).toHaveAttribute("data-side", "over");
    const hb = (await hb0.boundingBox())!;
    expect(hb.y + hb.height).toBeLessThanOrEqual((await input.boundingBox())!.y);
    expect(hb.height).toBeLessThanOrEqual(30);
    // It stays inside the window on a full-width line.
    expect(hb.x).toBeGreaterThanOrEqual(0);
    expect(hb.x + hb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  } else {
    // On a phone the hint never floats over the page: it is one slim row above the tool dock.
    await expect(hb0).toHaveAttribute("data-side", "docked");
    const hb = (await hb0.boundingBox())!;
    const dock = (await page.getByTestId("dock").boundingBox())!;
    expect(hb.y + hb.height).toBeLessThanOrEqual(dock.y);
    // Always at the same spot, directly above the dock.
    expect(dock.y - (hb.y + hb.height)).toBeLessThanOrEqual(24);
    expect(hb.x).toBeGreaterThanOrEqual(0);
    expect(hb.x + hb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(hb.height).toBeLessThanOrEqual(48);
    // It covers no line of the page's text, and at most two fonts are offered.
    for (const l of await page.getByTestId("line").all()) {
      const b = await l.boundingBox();
      if (b) expect(b.y + b.height <= hb.y || b.y >= hb.y + hb.height).toBe(true);
    }
    expect(await page.getByTestId("line-missing-font").count()).toBeLessThanOrEqual(2);
    await expect(hb0).toContainText("Missing: ř");
    // Picking a font there keeps the edit going.
    await page.getByTestId("line-missing-font").last().tap();
    await expect(input).toHaveCount(1);
    await expect(page.getByTestId("line-missing-font").last()).toHaveAttribute("aria-pressed", "true");
  }
  if (info.project.name === "desktop") expect(await hb0.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
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
  const line = lineWith(page, "in full");
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
  await expect(hint).toContainText(/(Not in this font|Missing): ř/);
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

test("text typed past the page's edge scrolls inside the box: the caret stays in view", async ({ page }) => {
  await open(page, "report-form-3p.pdf");
  const input = await edit(page, lineWith(page, "This report was made"));
  await page.keyboard.press("End");
  await page.keyboard.type(" and then a good many more words than the width of this page can hold on one line, typed to the very end");
  const seen = await input.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const caret = getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { inside: caret.right <= box.right + 1 && caret.left >= box.left - 1, scrolled: el.scrollLeft > 0, within: box.right <= window.innerWidth };
  });
  expect(seen).toEqual({ inside: true, scrolled: true, within: true });
  await input.press("Escape");
});

test("a letter of a joined script typed into a Latin line doesn't turn the marks off", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const input = await edit(page, lineWith(page, "and it stays in force"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř");
  await expect(input).toHaveAttribute("data-missing", /ř/);
  await page.keyboard.type(" ש");
  await page.waitForTimeout(600);
  await expect(input).toHaveAttribute("data-missing", /ř/);
  await expect(input).toHaveAttribute("data-face", "own");
  await expect(page.getByTestId("line-missing")).toBeVisible();
  await input.press("Escape");
});

for (const [script, letter] of [
  ["Hebrew", "ש"],
  ["Arabic", "ب"],
  ["Devanagari", "क"],
  ["Thai", "ก"],
] as const) {
  test(`AC-300: a ${script} letter typed into a Latin line is marked and named like any other missing letter`, async ({ page }) => {
    await open(page, "chrome-justified-mixed.pdf");
    const input = await edit(page, lineWith(page, "in full"));
    await page.keyboard.press("End");
    await page.keyboard.type(` ${letter}`);
    await expect(input).toHaveAttribute("data-missing", letter);
    // The line keeps the document's own font: only the letter is marked.
    await expect(input).toHaveAttribute("data-face", "own");
    await expect(page.getByTestId("line-missing")).toContainText(letter);
    await expect(page.getByTestId("line-missing-status")).toContainText(`Not in this font: ${letter}`);
    expect(await page.evaluate(() => CSS.highlights.get("ed-miss")?.size ?? 0)).toBe(1);
    await input.press("Escape");
  });
}

test("AC-304: the hint goes under the box when no text is drawn there, beside a short line, and over it only inside a paragraph", async ({ page }, info) => {
  // (On a phone at fit-width zoom the page's text is smaller than the hint: nothing under a line is clear.)
  test.skip(info.project.name !== "desktop", "room under a line is judged at the desktop size");
  await open(page, "chrome-justified-mixed.pdf");
  // The paragraph's last line is short: the gap under it is too thin for the hint, the row after it is free.
  let input = await edit(page, lineWith(page, "in full"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř");
  const hint = page.getByTestId("line-missing");
  await expect(hint).toHaveAttribute("data-side", "beside");
  // It covers none of the text of the lines around (their ink: the middle of each line's box).
  const hb = (await hint.boundingBox())!;
  for (const other of ["and it stays in force", "Total amount due"]) {
    const o = (await lineWith(page, other).boundingBox())!;
    const [top, bottom] = [o.y + o.height * 0.2, o.y + o.height * 0.8];
    const apart = hb.y + hb.height <= top || hb.y >= bottom || hb.x >= o.x + o.width || hb.x + hb.width <= o.x;
    expect(apart, other).toBe(true);
  }
  // It doesn't cover the box either, and typing moves it along.
  const ib = (await input.boundingBox())!;
  expect(hb.x).toBeGreaterThanOrEqual(ib.x + ib.width);
  await input.press("Escape");
  // Nothing at all under the last line of the page's text: the hint goes under it.
  input = await edit(page, lineWith(page, "non-refundable"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř");
  await expect(hint).toHaveAttribute("data-side", "under");
  await input.press("Escape");
  // The paragraph's first line: text is right under it.
  input = await edit(page, lineWith(page, "This agreement is made"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř");
  await expect(hint).toHaveAttribute("data-side", "over");
  await input.press("Escape");
});

test("the list of lines never points at the line that is open in the box", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const list = page.getByRole("listbox").first();
  const input = await edit(page, lineWith(page, "in full"));
  // The option is out of the list while its box is open: no reference to an element that isn't there.
  await expect(list).not.toHaveAttribute("aria-activedescendant", /.*/);
  await input.press("Escape");
  // Back in the list, the line is pointed at again.
  await list.focus();
  const after = await list.getAttribute("aria-activedescendant");
  expect(after).toBeTruthy();
  await expect(page.locator(`[id="${after}"]`)).toHaveCount(1);
});

test("AC-298: a line in an embedded CFF font (Type 1C) opens in that font, not a system one", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const input = await edit(page, page.getByTestId("line").first());
  await expect(input).toHaveAttribute("data-face", "own");
  expect(await input.evaluate((el) => getComputedStyle(el.querySelector("[data-font]")!).fontFamily)).toMatch(/^"?bp-doc-/);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.startsWith("bp-doc-") && f.status === "loaded"))).toBe(true);
  await input.press("Escape");
});

test("text typed past where the page clips its content is refused, kept in the box, and can replace the line", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = lineWith(page, "This agreement is made");
  const text = (await line.getAttribute("data-text"))!;
  const input = await edit(page, line);
  await page.keyboard.press("End");
  await page.keyboard.type(" and then the date");
  await page.keyboard.press("Enter");
  // A Chrome print clips to its print area: the words would be in the file but not drawn.
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("The edited line would run past the page edge. Your text is still in the box.", { timeout: 30_000 });
  await expect(input).toHaveText(`${text} and then the date`);
  await expect(input).toBeFocused();
  await expect(lineWith(page, "and then the date")).toHaveCount(0);
  // Download doesn't quietly make a file without the line that is still open.
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(notice).toContainText("couldn’t be saved, so it isn’t in the file yet");
  await expect(input).toHaveText(`${text} and then the date`);
  // Enter asks again (and is told again); leaving the box does not.
  const tries: string[] = [];
  page.on("console", (m) => m.text().includes("edit not applied") && tries.push(m.text()));
  await input.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(500);
  expect(tries).toHaveLength(0);
  await input.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => tries.length).toBe(1);
  await expect(notice).toContainText("would run past the page edge");
  await expect(input).toBeFocused();
  // The text is changed in the box, then the message's own way out is taken: the newer text
  // replaces the line, the box closes, and no second edit of the line is made.
  await page.keyboard.press("End");
  await page.keyboard.type(" shown");
  await notice.getByRole("button", { name: "Replace with new text" }).click();
  await expect(input).toHaveCount(0);
  // M8: the old line leaves the file (nothing is covered up, so copying and searching find the
  // text once), and each part keeps its style: the bold word bold, the italic word italic.
  const boxes = page.locator('[data-kind="text"]');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.last()).toContainText("and then the date shown");
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(0);
  await expect(lineWith(page, "This agreement is made")).toHaveCount(0);
  const styles = await boxes.evaluateAll((els) => els.map((el) => {
    const t = el.querySelector("text")!;
    return `${(t.textContent ?? "").trim().slice(0, 8)}|${Number(t.getAttribute("font-weight")) >= 600 ? "bold" : "regular"}|${t.getAttribute("font-style")}`;
  }));
  expect(styles).toEqual(["This agr|regular|normal", "Provider|bold|normal", "and the|regular|normal", "Client|regular|italic", "on the d|regular|normal"]);
  // All five sit on one baseline and none runs past the page's edge.
  const rects = await boxes.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
  const sheet = (await page.getByTestId("page-1").boundingBox())!;
  for (const r of rects) expect(r.right).toBeLessThanOrEqual(sheet.x + sheet.width);
  for (let i = 1; i < rects.length; i++) expect(rects[i]!.left).toBeGreaterThanOrEqual(rects[i - 1]!.right - 1);
  await page.waitForTimeout(500);
  expect(tries).toHaveLength(1);
  await expect(lineWith(page, "and then the date")).toHaveCount(0);
  // The message about the open line went with the box.
  await expect(notice).toHaveCount(0);
  // One step back brings the line itself back and takes the boxes away.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(lineWith(page, "This agreement is made")).toHaveCount(1, { timeout: 15_000 });
  await expect(boxes).toHaveCount(0);
});

test("gap 8: a message about the line being edited goes when the edit is given up", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const input = await edit(page, lineWith(page, "This agreement is made"));
  await page.keyboard.press("End");
  await page.keyboard.type(" and then the date");
  await page.keyboard.press("Enter");
  const notice = page.getByTestId("editor-notice");
  // What the action will do is said before it is done.
  await expect(notice).toContainText("Your text is still in the box. Replacing it sets your text in Tinos.", { timeout: 30_000 });
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(notice).toHaveCount(0);
});

/** How far the end of the box's text is from where the line ends on the page (0: the text is as long as the line). */
async function drift(page: Page, line: Locator) {
  const at = (await line.boundingBox())!;
  const words = await line.evaluate((el) => (el as HTMLElement).dataset.text ?? "");
  const input = await edit(page, line);
  await expect(input).toHaveAttribute("data-faces", /own|close/);
  await page.waitForTimeout(300);
  return input.evaluate(
    (el, { left, right, text }) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0);
      // The line's box on the page has the same margin on both sides of its text.
      return { end: right - Math.max(...rects.map((x) => x.right)) - (Math.min(...rects.map((x) => x.left)) - left), text: el.textContent === text };
    },
    { left: at.x, right: at.x + at.width, text: words },
  );
}

for (const [file, text, why] of [
  ["latex-type1c.pdf", "nite sti", "ff and ffi ligatures, word gaps the text has no spaces for"],
  ["latex-type1c.pdf", "1.2", "a tab gap and dot leaders"],
  ["latex-type1c.pdf", "Spaced out words", "letter and word spacing"],
  ["latex-type1c.pdf", "Wide scaled", "a wider setting"],
  ["libreoffice-memo.pdf", "The meeting moves", "a ligature the engine counts as one character"],
  ["libreoffice-memo.pdf", "Team memo", "a heading with a narrowed word gap"],
] as const) {
  test(`AC-298: a line opens as long as it is on the page: ${why}`, async ({ page }) => {
    await open(page, file);
    const d = await drift(page, lineWith(page, text));
    expect(d.text).toBe(true);
    expect(Math.abs(d.end)).toBeLessThanOrEqual(2);
  });
}

test("AC-298: ligatures the text layer had no letters for are read and drawn (ff, ffi)", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const line = lineWith(page, "nite sti");
  await expect(line).toHaveAttribute("data-text", "The eﬀect of ﬁnite stiﬀness on the ﬂow is eﬃcient.");
  const before = await line.screenshot();
  const input = await edit(page, line);
  await expect(input).toHaveText("The eﬀect of ﬁnite stiﬀness on the ﬂow is eﬃcient.");
  await expect(input).toHaveAttribute("data-faces", /own/);
  // As much ink in the box as on the page: no glyph is dropped when the line opens.
  await page.mouse.move(2, 2);
  const a = await ink(page, before);
  const b = await ink(page, await input.screenshot());
  expect(b.count).toBeGreaterThan(a.count * 0.9);
});

test("AC-298: an accent the page draws over its letter stays over it in the box", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const input = await edit(page, lineWith(page, "cafe"));
  const gap = await input.evaluate((el) => {
    const span = [...el.querySelectorAll("span")].find((s) => s.textContent === "\u00B4")!;
    const prev = span.previousElementSibling!.firstChild!;
    const r = document.createRange();
    r.setStart(prev, prev.nodeValue!.length - 1);
    r.setEnd(prev, prev.nodeValue!.length);
    const e = r.getBoundingClientRect();
    const a = span.getBoundingClientRect();
    // Centre of the accent against the centre of the letter before it.
    return Math.abs((a.left + a.right) / 2 - (e.left + e.right) / 2);
  });
  expect(gap).toBeLessThanOrEqual(1.5);
});

test("gap 7: the ring goes around a line that holds a raised footnote mark, not through its letters", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const input = await edit(page, lineWith(page, "A footnote mark"));
  await expect(input).not.toHaveAttribute("data-inset", /top/);
});

test("AC-283: a font the PDF only names gets its metric twin, in the menu and in the edit box", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the font menu is checked on the desktop layout");
  await open(page, "std14-reportlab.pdf");
  // The line opens in the twin at once, as long as it is on the page.
  const mono = lineWith(page, "REF-7731-ZEBRA");
  const d = await drift(page, mono);
  expect(Math.abs(d.end)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("line-input").locator("span").first()).toHaveCSS("font-family", /cousine/i);
  await page.keyboard.press("Escape");
  const picker = page.getByTestId("font-picker").first();
  if (!(await picker.isVisible().catch(() => false))) await page.getByRole("button", { name: /^Text/ }).first().click();
  await picker.click();
  await expect(page.getByTestId("font-doc").filter({ hasText: "Courier" }).first()).toContainText("Cousine · Same widths", { timeout: 30_000 });
  await expect(page.getByTestId("font-doc").filter({ hasText: "Helvetica" }).first()).toContainText("Arimo · Same widths");
  await expect(page.getByTestId("font-doc").filter({ hasText: "Times" }).first()).toContainText("Tinos · Same widths");
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

test("a fixed-pitch subset whose own advance table is wrong is still matched to its library family", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the font menu is checked on the desktop layout");
  await open(page, "reportlab-mono-subset.pdf");
  const picker = page.getByTestId("font-picker").first();
  if (!(await picker.isVisible().catch(() => false))) await page.getByRole("button", { name: /^Text/ }).first().click();
  await picker.click();
  const row = page.getByTestId("font-doc").filter({ hasText: "Fixture Mono" });
  await expect(row).toContainText("Roboto Mono · Exact", { timeout: 30_000 });
});

test("Download pressed while a save that fails is under way makes no file; another line or Escape never drops the text silently", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = lineWith(page, "This agreement is made");
  const text = (await line.getAttribute("data-text"))!;
  const input = await edit(page, line);
  await page.keyboard.press("End");
  await page.keyboard.type(" and then the date");
  let files = 0;
  page.on("download", () => files++);
  // Download is pressed with the box still open: leaving it starts the save, which is refused.
  await page.getByRole("button", { name: "Download PDF" }).click();
  const notice = page.getByTestId("editor-notice");
  // The refusal says why itself and keeps its own way out; Download adds nothing over it.
  await expect(notice).toContainText("would run past the page edge. Your text is still in the box.", { timeout: 30_000 });
  await expect(notice.getByRole("button", { name: "Replace with new text" })).toBeVisible();
  await expect(input).toHaveText(`${text} and then the date`);
  await page.waitForTimeout(500);
  await expect(notice).toContainText("would run past the page edge");
  // Another line is not opened over the kept text.
  await lineWith(page, "Total amount due").click({ force: true });
  await expect(input).toHaveText(`${text} and then the date`);
  await expect(input).toBeFocused();
  // Escape gives the line back as it was, also when the focus is not in the box.
  await page.getByRole("button", { name: "Download PDF" }).focus();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(lineWith(page, "This agreement is made")).toHaveAttribute("data-text", text);
  expect(files).toBe(0);
});

test("AC-313: on a phone a message takes the hint's action in; the two are never stacked", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "the docked hint is the phone layout");
  await open(page, "chrome-justified-mixed.pdf");
  const line = lineWith(page, "in full.");
  const text = (await line.getAttribute("data-text"))!;
  const input = await edit(page, line);
  await page.keyboard.press("End");
  // A private-use code point: no font here has it.
  await page.keyboard.type(" \uE123");
  const hint = page.getByTestId("line-missing");
  await expect(hint).toHaveAttribute("data-side", "docked");
  await expect(page.getByTestId("line-missing-own")).toBeVisible();
  await page.keyboard.press("Enter");
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("Your text is still in the box.", { timeout: 30_000 });
  await expect(hint).toHaveCount(1);
  await expect(hint).toHaveAttribute("data-side", "message");
  await expect(notice.getByRole("button", { name: "Use your own font" })).toBeVisible();
  await expect(page.locator('[data-line-hint-slot="dock"] > *')).toHaveCount(0);
  await expect(input).toHaveText(`${text} \uE123`);
  const nb = (await notice.boundingBox())!;
  const dock = (await page.getByTestId("dock").boundingBox())!;
  expect(dock.y - (nb.y + nb.height)).toBeLessThanOrEqual(24);
  expect(nb.x + nb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // When the message goes, the row is back at the same spot.
  await notice.getByRole("button", { name: "Dismiss" }).tap();
  await expect(hint).toHaveAttribute("data-side", "docked");
  await expect(input).toHaveCount(1);
});

test("AC-299: the edit box opens at once: no fade or other animation over the page's own text", async ({ page }) => {
  await open(page, "libreoffice-memo.pdf");
  const input = await edit(page, lineWith(page, "Team memo"));
  const style = await input.evaluate((el) => {
    const s = getComputedStyle(el);
    return { animation: s.animationName, opacity: s.opacity, running: el.getAnimations().length };
  });
  expect(style).toEqual({ animation: "none", opacity: "1", running: 0 });
});

for (const [script, letter] of [
  ["Devanagari", "न"],
  ["symbol", "⸘"],
] as const) {
  test(`AC-300: on a line whose font the PDF only names, a ${script} letter the twin lacks is marked as typed`, async ({ page }) => {
    await open(page, "std14-reportlab.pdf");
    const input = await edit(page, lineWith(page, "REF-7731-ZEBRA"));
    await expect(input).toHaveAttribute("data-missing", "");
    await page.keyboard.press("End");
    await page.keyboard.type(` ${letter}`);
    await expect(input).toHaveAttribute("data-missing", letter);
    await expect(page.getByTestId("line-missing")).toContainText(letter);
    await expect(page.getByTestId("line-missing-status")).toContainText(`Not in this font: ${letter}`);
    await input.press("Escape");
  });
}

test("the hint shows missing letters whole, as typed: a vowel sign is never shown alone", async ({ page }) => {
  await open(page, "std14-reportlab.pdf");
  const input = await edit(page, lineWith(page, "REF-7731-ZEBRA"));
  await page.keyboard.press("End");
  await page.keyboard.type(" नया");
  await expect(input).toHaveAttribute("data-missing", "नया");
  const chars = page.getByTestId("line-missing").locator(".ed-input__chars").first();
  await expect(chars).toHaveText("न या");
  await input.press("Escape");
});

test("AC-300: Enter on a named-only line with a letter no font here draws answers at once and keeps the text", async ({ page }) => {
  await open(page, "std14-reportlab.pdf");
  const input = await edit(page, lineWith(page, "REF-7731-ZEBRA"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ⸘");
  await expect(input).toHaveAttribute("data-missing", "⸘");
  // The fonts were looked for and none has it (the phone's row leaves the words out).
  await expect(page.getByTestId("line-missing")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("line-missing-own")).toBeVisible({ timeout: 15_000 });
  await input.press("Enter");
  // The reason is given within two seconds, with the box open and the text in it.
  await expect(page.locator(".ed-toast")).toContainText("⸘", { timeout: 2000 });
  await expect(page.getByTestId("line-input")).toContainText("⸘");
});

test("AC-298: a letter the page sets apart for its accent keeps its place in the box (caf é)", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const line = lineWith(page, "cafe");
  const pageWidth = (await line.boundingBox())!.width;
  const input = await edit(page, line);
  const got = await input.evaluate((el) => {
    const spans = [...el.querySelectorAll("span")];
    const accent = spans.findIndex((s) => s.textContent === "´");
    const e = spans[accent - 1]!.getBoundingClientRect();
    const f = spans[accent - 2]!.getBoundingClientRect();
    return { gap: e.left - f.right, letter: e.width, text: spans[accent - 1]!.textContent, width: el.getBoundingClientRect().width };
  });
  expect(got.text).toBe("e");
  // The page has about a third of the letter's width between "caf" and its accented letter.
  expect(got.gap).toBeGreaterThan(got.letter * 0.2);
  expect(Math.abs(got.width - pageWidth)).toBeLessThanOrEqual(3);
});

test("AC-304: a raised mark of another line inside the row stays drawn while the row is edited", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  await edit(page, lineWith(page, "A footnote mark"));
  const kept = page.getByTestId("line-kept-ink");
  await expect(kept).toHaveCount(1);
  // The mark itself is in the copy laid over the box's paper, and the copy sits inside the box.
  const dark = await kept.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && d[i]! + d[i + 1]! + d[i + 2]! < 600) n++;
    return n;
  });
  expect(dark).toBeGreaterThan(5);
  const [k, b] = [(await kept.boundingBox())!, (await page.getByTestId("line-input").boundingBox())!];
  expect(k.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(k.x + k.width).toBeLessThanOrEqual(b.x + b.width + 1);
});

test("fonts the file only names are drawn in their twins on the page too, and the saved file never carries the twins", async ({ page, isMobile }) => {
  await open(page, "named-only-twins.pdf");
  const shell = page.getByTestId("editor-shell");
  // Arial, Helvetica, Times, Courier, Calibri and Cambria have their twins in the app itself.
  await expect.poll(async () => Number((await shell.getAttribute("data-twins")) ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(6);
  const twins = await shell.getAttribute("data-twins");
  const line = lineWith(page, "Calibri invoice");
  await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const input = await edit(page, line);
  await page.keyboard.press("End");
  await page.keyboard.type(" ok");
  await page.keyboard.press("Enter");
  await expect(input).toBeHidden({ timeout: 30_000 });
  await expect(lineWith(page, "on time ok")).toBeVisible({ timeout: 30_000 });
  // The edit only added to the file: the page still draws the same fonts in their twins.
  await expect(shell).toHaveAttribute("data-twins", twins!);
  // Going back to the file as it was, and forward again, keeps them too.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(lineWith(page, "on time ok")).toHaveCount(0, { timeout: 30_000 });
  await expect(shell).toHaveAttribute("data-twins", twins!);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(lineWith(page, "on time ok")).toBeVisible({ timeout: 30_000 });
  await expect(shell).toHaveAttribute("data-twins", twins!);
  test.skip(isMobile, "the download is read on desktop");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const saved = readFileSync((await dl.path())!).toString("latin1");
  // The twins are for the screen only: none of their objects or font files is in the download.
  expect(saved).not.toMatch(/\b6000\d{3} 0 obj/);
  expect(saved).not.toContain("/FontFile2");
});

/** The height at which a screenshot's ink sits (darkness-weighted, the brand ring left out), in CSS pixels. */
async function inkHeight(page: Page, png: Buffer): Promise<number> {
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let sum = 0;
      let weight = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const w = d[i]! - d[i + 1]! > 40 ? 0 : 765 - d[i]! - d[i + 1]! - d[i + 2]!;
          sum += y * w;
          weight += w;
        }
      return sum / weight / (window.devicePixelRatio || 1);
    }, png.toString("base64"));
  } finally {
    await blank.close();
  }
}

for (const [file, text] of [
  ["latex-type1c.pdf", "Results don"],
  ["cid-bold-run.pdf", "Office ligatures"],
  ["reportlab-mono-subset.pdf", "The quick brown fox"],
  ["named-only-twins.pdf", "Calibri invoice"],
  ["named-only-twins.pdf", "Cambria invoice"],
] as const) {
  test(`AC-298: the open box's text sits on the page's baseline, to half a pixel: ${file}, "${text}"`, async ({ page }) => {
    await open(page, file);
    // Named-only fonts are first drawn in their twins on the page.
    if (file === "named-only-twins.pdf") await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-twins", /\d/, { timeout: 30_000 });
    const line = lineWith(page, text);
    await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(600);
    const box = (await line.boundingBox())!;
    // The line's own rows, clear of the ring and of the lines above and below.
    const clip = { x: Math.floor(box.x) + 6, y: Math.round(box.y) + 1, width: Math.floor(box.width) - 12, height: Math.floor(box.height) - 2 };
    await page.mouse.move(0, 0);
    const before = await inkHeight(page, await page.screenshot({ clip }));
    await edit(page, line);
    await page.mouse.move(0, 0);
    await expect.poll(async () => Math.abs((await inkHeight(page, await page.screenshot({ clip }))) - before), { timeout: 10_000 }).toBeLessThan(0.5);
  });
}

test("AC-312: of two letters typed together, the one no font has is named, and Enter says so at once", async ({ page, isMobile }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const input = await edit(page, lineWith(page, "in full"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř ⸘");
  // The font that draws ř is offered, and ⸘ is named as the letter no font here has.
  await expect(page.getByTestId("line-missing-font").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("line-missing-status")).toContainText(/draws ř\. No font here has ⸘\./);
  await expect(page.getByTestId("line-missing-none")).toHaveText(isMobile ? "⸘ no font" : "No font has ⸘.");
  // The missing letters are never cut off.
  const label = page.locator(".ed-input__hint > span").first();
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const own = page.getByTestId("line-missing-own");
  await expect(own).toBeVisible();
  // The whole row is on screen: the way out is never cut off.
  const [ob, vw] = [(await own.boundingBox())!, page.viewportSize()!.width];
  expect(ob.x + ob.width).toBeLessThanOrEqual(vw);
  const row = (await own.evaluate((el) => el.closest(".ed-input__hint")!.getBoundingClientRect().right));
  expect(ob.x + ob.width).toBeLessThanOrEqual(row + 0.5);
  const started = Date.now();
  await page.keyboard.press("Enter");
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("“⸘”", { timeout: 5_000 });
  // The bar is 0.6 s; the rest is the test's own round trips.
  expect(Date.now() - started).toBeLessThan(1000);
  // Only the letter that can't be drawn is named, and the text is still in the box.
  await expect(notice).not.toContainText("“ř”");
  await expect(input).toContainText("ř ⸘");
});

test("AC-312: a font the person adds for the letter no font has is named for that letter, drawn in the box, and saved at once", async ({ page, isMobile }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const input = await edit(page, lineWith(page, "in full"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ř ⸘");
  await expect(page.getByTestId("line-missing-none")).toHaveText(isMobile ? "⸘ no font" : "No font has ⸘.", { timeout: 20_000 });
  // On a phone the button's name holds the words on it.
  const own = page.getByTestId("line-missing-own");
  expect(await own.evaluate((el) => (el.getAttribute("aria-label") ?? el.textContent!).includes(el.textContent!))).toBe(true);
  await page.getByTestId("line-missing-own-file").setInputFiles(corpus("fonts/OwnTestSans-Regular.ttf"));
  // Each font is named with the letters it draws, and nothing is said to be missing any more.
  const status = page.getByTestId("line-missing-status");
  await expect(status).toContainText(/ draws ř\. Own Test Sans draws ⸘\./, { timeout: 20_000 });
  await expect(status).not.toContainText("No font here");
  await expect(page.getByTestId("line-missing-none")).toHaveCount(0);
  const fonts = page.getByTestId("line-missing-font");
  const added = fonts.filter({ hasText: "Own Test Sans" });
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await expect(added).toHaveAttribute("data-draws", "⸘");
  await expect(page.locator('[data-testid="line-missing-font"][data-draws="ř"]')).toHaveAttribute("aria-pressed", "true");
  // Every font offered lies inside the row's paper, and the row inside the screen.
  const fits = await page.getByTestId("line-missing").evaluate((row) => {
    const r = row.getBoundingClientRect();
    const inside = [...row.querySelectorAll("button")].every((b) => {
      const q = b.getBoundingClientRect();
      return q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5;
    });
    return inside && r.left >= 0 && r.right <= innerWidth + 0.5;
  });
  expect(fits).toBe(true);
  // The box draws ⸘ with the added font, the one the file gets.
  const family = await added.evaluate((b) => b.style.fontFamily.split(",")[0]!.trim());
  const stack = await input.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue!.includes("⸘")) return getComputedStyle(n.parentElement!).fontFamily;
    return "";
  });
  expect(stack).toContain(family);
  const started = Date.now();
  await page.keyboard.press("Enter");
  await expect(lineWith(page, "ř ⸘")).toBeVisible({ timeout: 5_000 });
  // One try with both fonts, not one font after another.
  expect(Date.now() - started).toBeLessThan(2000);
  await expect(page.getByTestId("line-input")).toHaveCount(0);
});
