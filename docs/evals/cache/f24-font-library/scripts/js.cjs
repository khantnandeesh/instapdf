const { chromium, BASE, log } = require("./lib.cjs");
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  for (const phone of [true, false]) {
    const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: phone, hasTouch: phone });
    const page = await ctx.newPage(); await page.goto(BASE + "/edit-pdf", { waitUntil: "load" });
    const r = await page.evaluate(() => { const le = performance.getEntriesByType("navigation")[0].loadEventEnd || performance.now(); const es = performance.getEntriesByType("resource").filter((e) => /\.js(\?|$)/.test(e.name)); const by = es.filter((e) => e.responseEnd <= le); return { jsByLoadKB: Math.round(by.reduce((s, e) => s + e.transferSize, 0) / 1024), n: by.length, loadMs: Math.round(le) }; });
    await page.waitForLoadState("networkidle");
    const after = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /wasm|font|\.bin/.test(e.name)).map((e) => e.name.split("/").slice(-1)[0] + ":" + Math.round(e.transferSize / 1024) + "KB"));
    log(phone ? "phone" : "desktop", JSON.stringify(r), "non-JS extras by idle", JSON.stringify(after));
    await ctx.close();
  }
  await browser.close();
})();
