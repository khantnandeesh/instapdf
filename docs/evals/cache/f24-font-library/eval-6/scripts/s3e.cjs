// Sixth evaluation, AC-310 / AC-311: " for Dvořák" typed at the end of "This agreement…" (the line would run past the page edge; ř is not in the font).
// From Enter: when is the box closed, when does the message come, what is on screen in between, which requests are made. REPS runs at 1280 and 390.
const { chromium, BASE, log, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
const SIZES = { 1280: { viewport: { width: 1280, height: 800 } }, 390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } };
(async () => { const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  for (const tag of (process.env.SIZES || "1280,390").split(",")) for (const txt of (process.env.TEXTS ? JSON.parse(process.env.TEXTS) : [" for Dvořák", " for Dvorak"])) for (let rep = 0; rep < +(process.env.REPS || 3); rep++) {
    const phone = tag !== "1280"; const ctx = await browser.newContext({ deviceScaleFactor: 2, ...SIZES[tag] }); const page = await ctx.newPage(); const reqs = []; page.on("request", (r) => reqs.push({ t: Date.now(), m: r.method(), u: r.url() }));
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 }); await page.locator('input[type="file"]').first().setInputFiles(FX + "chrome-justified-mixed.pdf"); await page.waitForTimeout(4000); await install(page);
    const o = page.getByRole("option", { name: /^This agreement/ }); const b = await o.boundingBox(); phone ? await page.touchscreen.tap(b.x + b.width * 0.3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(400); await page.keyboard.press("End");
    await page.keyboard.type(txt, { delay: 30 }); await page.waitForTimeout(+(process.env.WAIT || 1200)); const s0 = await state(page);
    const n0 = reqs.length; await page.keyboard.press("Enter"); const t0 = Date.now(); let last = "", tl = [], ans = null;
    while (Date.now() - t0 < 15000) { const st = await state(page); const busy = await page.evaluate(() => [...document.querySelectorAll("[aria-busy=true], [role=progressbar], .ed-saving, [data-saving]")].length); const k = JSON.stringify({ box: !!st.box, focused: !!(st.box && st.box.focused), notice: st.notice && st.notice.text.slice(0, 70), busy }); if (k !== last) { tl.push("+" + (Date.now() - t0) + " " + k); last = k; } if (ans == null && st.notice) ans = Date.now() - t0; if (ans != null && Date.now() - t0 > ans + 1000) break; await page.waitForTimeout(30); }
    log(tag, JSON.stringify(txt), "run", rep, "hint before Enter:", s0.hint && s0.hint.text, "| message after ms", ans, "| timeline", tl.join("  "), "| requests after Enter", JSON.stringify(reqs.slice(n0).map((r) => "+" + (r.t - t0) + " " + r.u.split("/").slice(-2).join("/").slice(0, 46)).slice(0, 14)), "non-GET", reqs.filter((r) => r.m !== "GET").length);
    await ctx.close(); }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
