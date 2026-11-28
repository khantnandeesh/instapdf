// Writes the F15 OCR fixture: scan.pdf, three pages as a scanner and a word processor might leave them.
//  page 1  a picture of text (no text in the file)   page 2  real text   page 3  a picture of text, lying on its side (/Rotate 90)
// The pictures are drawn by Chromium, so the run needs Playwright's browser.
// Run from apps/web:  node tests/fixtures/generate-scan.mjs
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, degrees } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const browser = await chromium.launch();
const shot = async (lines) => {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:120px 110px;background:#fff;color:#111;font:34px/1.7 Georgia,serif">${lines.map((l) => `<p style="margin:0 0 18px">${l}</p>`).join("")}</body>`);
  const jpg = await page.screenshot({ type: "jpeg", quality: 80 });
  await page.close();
  return jpg;
};
const first = await shot(["Harbour Lane Bakery", "Invoice number 48213", "Twelve sourdough loaves and four trays of plum tarts", "Total due 1,250.00 by the end of March"]);
const third = await shot(["Delivery note", "Leave the crates by the side door before seven", "Signed for by the morning shift"]);
await browser.close();

const doc = await PDFDocument.create();
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
const font = await doc.embedFont(StandardFonts.Helvetica);
const a4 = [595.2, 841.92];
const p1 = doc.addPage(a4);
p1.drawImage(await doc.embedJpg(first), { x: 0, y: 0, width: a4[0], height: a4[1] });
const p2 = doc.addPage(a4);
p2.drawText("This page was typed, not scanned.", { x: 60, y: 760, size: 16, font });
p2.drawText("Its words are already in the file, so they are left as they are.", { x: 60, y: 730, size: 12, font });
// The picture is stored turned a quarter anticlockwise and the page says to show it turned back.
const p3 = doc.addPage([a4[1], a4[0]]);
p3.drawImage(await doc.embedJpg(third), { x: a4[1], y: 0, width: a4[0], height: a4[1], rotate: degrees(90) });
p3.setRotation(degrees(90));
await writeFile(join(here, "scan.pdf"), await doc.save({ useObjectStreams: false }));
console.log("wrote scan.pdf");
