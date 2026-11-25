// Sixth evaluation, gap 10: "Use your own font" from the keyboard, straight from typing " ⸘" on "in full.": Tab, then Enter (or Space). Does the file dialog open?
// REPS runs per variant at 1280 and 390; WAIT = ms between typing and Tab (the hint needs to be there), and the pause between Tab and the key.
const { chromium, BASE, log, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
const SIZES = { 1280: { viewport: { width: 1280, height: 800 } }, 390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } };
(async () => { const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const tally = {};
  for (const tag of (process.env.SIZES || "1280,390").split(",")) for (const [key, pause] of [["Enter", 300], ["Enter", 1500], ["Space", 300]]) for (let rep = 0; rep < +(process.env.REPS || 4); rep++) {
    const phone = tag !== "1280"; const ctx = await browser.newContext({ deviceScaleFactor: 2, ...SIZES[tag] }); const page = await ctx.newPage();
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 }); await page.locator('input[type="file"]').first().setInputFiles(FX + "chrome-justified-mixed.pdf"); await page.waitForTimeout(4000); await install(page);
    const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.insertText(" ⸘"); await page.waitForTimeout(+(process.env.WAIT || 2500));
    await page.keyboard.press("Tab"); await page.waitForTimeout(pause); const s1 = await state(page);
    const fc = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.keyboard.press(key); const got = !!(await fc); const s2 = await state(page);
    const k = `${tag} Tab +${pause} ms ${key}`; tally[k] = tally[k] || [0, 0]; tally[k][got ? 0 : 1]++;
    log(k, "run", rep, "focus after Tab:", s1.focus.slice(0, 40), "| chooser", got, "| focus after key:", s2.focus.slice(0, 40), "| box", !!s2.box, s2.box && JSON.stringify(s2.box.text.slice(-10)), "| notice", s2.notice && s2.notice.text.slice(0, 60));
    await ctx.close(); }
  for (const [k, v] of Object.entries(tally)) console.log("TALLY", k, "dialog opened", v[0], "not opened", v[1]);
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
