const { open, load, log } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  const n = fs.readdirSync(process.env.FXD + "/chunks").filter((f) => f.endsWith(".pdf")).length;
  for (let i = 0; i < n; i++) {
    const { browser, page } = await open();
    await load(page, `${process.env.FXD}/chunks/c${i}.pdf`);
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300);
    await page.mouse.click(1150, 700); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(600);
    const t1 = Date.now(); const picker = page.getByTestId("font-picker"); await picker.click();
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls"))); let rows = [], pend = -1;
    for (let k = 0; k < 120; k++) { await page.waitForTimeout(500); rows = await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))); pend = rows.filter((r) => /No match yet|Matching/.test(r) || !/ => /.test(r)).length; if (rows.length && pend === 0) break; }
    log("chunk", i, "rows", rows.length, "pending", pend, "ms", Date.now() - t1);
    fs.writeFileSync(`out/d2-c${i}.json`, JSON.stringify(rows));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
