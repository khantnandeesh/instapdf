// Fifth evaluation: axe on the states of the mixed case (" ř ⸘" on an embedded line): hint shown, Enter refused, own font added. 1280, 390 and 320.
const { chromium, BASE, log, FX } = require("./lib.cjs"); const fs = require("fs");
const src = fs.readFileSync("/home/user/instapdf/node_modules/.pnpm/axe-core@4.14.1/node_modules/axe-core/axe.min.js", "utf8");
const SIZES = { 1280: { viewport: { width: 1280, height: 800 } }, 390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 320: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true } };
(async () => { const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const all = {};
  for (const tag of ["1280", "390", "320"]) { const phone = tag !== "1280"; const ctx = await browser.newContext({ deviceScaleFactor: 2, ...SIZES[tag] }); const page = await ctx.newPage();
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 }); await page.locator('input[type="file"]').first().setInputFiles(FX + "chrome-justified-mixed.pdf"); await page.waitForTimeout(4000);
    const run = async (name) => { await page.evaluate(src); const r = await page.evaluate(async () => { const r = await axe.run(document, { resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].html.slice(0, 160) })); }); all[tag + " " + name] = r; log(tag, name, JSON.stringify(r)); };
    const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(600); await page.keyboard.press("End");
    await page.keyboard.insertText(" ř ⸘"); await page.waitForTimeout(4000); await run("mixed-hint");
    await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await run("mixed-refused");
    const own = page.getByRole("button", { name: /own font|Your font/ }).first(); const fc = page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null); phone ? await own.tap() : await own.click(); const ch = await fc; if (ch) { await ch.setFiles(process.env.FXD + "/own-dejavu.ttf"); await page.waitForTimeout(2500); await run("mixed-own-font-added"); } else log(tag, "no chooser");
    await ctx.close(); }
  await browser.close(); fs.writeFileSync("out/axe2.json", JSON.stringify(all, null, 1));
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
