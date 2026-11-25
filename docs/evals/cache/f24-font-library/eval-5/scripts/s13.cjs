const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  for (const [file, idx] of [["std14-reportlab.pdf", 0], ["latex-type1.pdf", 0], ["std14-reportlab.pdf", 4]]) {
    const { browser, page } = await open({}); await load(page, file);
    const o = page.getByTestId("line").nth(idx); const b = await o.boundingBox(); const cx = b.x + b.width * 0.5;
    const t0 = Date.now(); await page.mouse.click(cx, b.y + b.height / 2); await page.getByTestId("line-input").waitFor();
    let last = ""; const out = [];
    while (Date.now() - t0 < 12000) { const s = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); const sel = getSelection(); const rs = sel.rangeCount ? [...sel.getRangeAt(0).getClientRects()] : []; const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null; return [el.dataset.face, getComputedStyle(el.querySelector("span") || el).fontFamily.split(",")[0], Math.round(rs[0] ? rs[0].x : r ? r.x : -1)]; }); const k = JSON.stringify(s); if (k !== last) { out.push([Date.now() - t0, s[0], s[1], "caretDx=" + Math.round(s[2] - cx)]); last = k; } await page.waitForTimeout(100); }
    log(file, idx, JSON.stringify(out));
    if (idx === 0 && /std14/.test(file)) await page.screenshot({ path: SHOTS + "ac299-first-line-pending-1280.png" });
    // type a letter where the caret is and see where it lands
    await page.keyboard.type("Z"); await page.waitForTimeout(500); log("  text after typing Z at caret:", await page.getByTestId("line-input").textContent());
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
