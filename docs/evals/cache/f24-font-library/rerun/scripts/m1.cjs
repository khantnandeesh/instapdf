const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  for (const f of ["/home/user/instapdf/tests/parity/editor/reportlab-mono-subset.pdf", __dirname + "/fx/match-regular.pdf", __dirname + "/fx/match-bold-italic.pdf"]) {
    const { browser, page } = await open(); await load(page, f);
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300);
    await page.mouse.click(1150, 700); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(600);
    const t1 = Date.now(); const picker = page.getByTestId("font-picker"); await picker.click();
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls"))); let rows = [], pend = -1;
    for (let k = 0; k < 240; k++) { await page.waitForTimeout(500); rows = await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))); pend = rows.filter((r) => /No match yet|Matching/.test(r) || !/ => /.test(r)).length; if (rows.length && pend === 0) break; }
    log(f.split("/").pop(), "rows", rows.length, "pending", pend, "ms", Date.now() - t1, JSON.stringify(rows.slice(0, 3)), JSON.stringify(rows.filter((r) => /No match yet|Matching/.test(r) || !/ => /.test(r)).slice(0, 5)));
    if (/mono/.test(f)) await page.screenshot({ path: SHOTS + "matcher-mono-subset-1280.png" });
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
