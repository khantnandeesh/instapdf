const { chromium, BASE, FX, SHOTS, log } = require("./lib.cjs");
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const vps = [[1366, 657], [1280, 632], [1536, 730], [1920, 969], [390, 664], [1280, 800], [390, 844]];
  for (const [w, h] of vps) {
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone });
    const page = await ctx.newPage();
    const t0 = Date.now(); await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle" });
    const land = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Open PDF/.test(x.textContent)); const r = b.getBoundingClientRect(); const js = performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)).reduce((s, e) => s + e.transferSize, 0); const all = performance.getEntriesByType("resource").reduce((s, e) => s + e.transferSize, 0); const main = document.querySelector("main"); let words = 0; const tw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const el = tw.currentNode.parentElement; const rr = el.getBoundingClientRect(); if (rr.height > 0 && rr.bottom <= r.top && !el.closest(".sr-only")) words += tw.currentNode.textContent.trim().split(/\s+/).filter(Boolean).length; } return { openTop: Math.round(r.top), openBottom: Math.round(r.bottom), inView: r.bottom <= innerHeight, jsKB: Math.round(js / 1024), allKB: Math.round(all / 1024), wordsBefore: words, sw: document.documentElement.scrollWidth }; });
    if ((w === 1280 && h === 800) || (w === 390 && h === 844)) await page.screenshot({ path: SHOTS + `landing-${w}.png` });
    const times = [];
    for (let i = 0; i < 3; i++) {
      if (i) { await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle" }); }
      const t = Date.now(); await page.locator('input[type="file"]').first().setInputFiles(FX + "chrome-justified-mixed.pdf");
      await page.locator(".ed-page--drawn").first().waitFor({ timeout: 20000 }); times.push(Date.now() - t);
    }
    await page.waitForTimeout(1500);
    const fit = await page.evaluate(() => { const p = document.querySelector(".ed-page").getBoundingClientRect(); const vis = { w: Math.max(0, Math.min(p.right, innerWidth) - Math.max(p.left, 0)), h: Math.max(0, Math.min(p.bottom, innerHeight) - Math.max(p.top, 0)) }; const d = [...document.querySelectorAll("button")].find((x) => /Download/.test(x.getAttribute("aria-label") || x.textContent)); const dr = d.getBoundingClientRect(); return { pageWpct: Math.round(100 * vis.w / innerWidth), pageHpct: Math.round(100 * vis.h / innerHeight), areaPct: Math.round(100 * vis.w * vis.h / (innerWidth * innerHeight)), downloadInView: dr.top >= 0 && dr.bottom <= innerHeight && dr.right <= innerWidth, sw: document.documentElement.scrollWidth, zoom: [...document.querySelectorAll("button")].find((x) => /^Zoom \d/.test(x.getAttribute("aria-label") || ""))?.textContent }; });
    if ((w === 1280 && h === 800) || (w === 390 && h === 844)) await page.screenshot({ path: SHOTS + `editor-open-${w}.png` });
    log(`${w}x${h}`, JSON.stringify({ land, firstPageMs: times, fit }));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
