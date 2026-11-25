const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page, reqs } = await open({ phone });
    const mf = await page.request.get("https://web-staging-qzq5fa2g7q-uc.a.run.app/fonts/lib/manifest.json"); log("manifest", mf.status(), (await mf.text()).slice(0, 400));
    await load(page, "chrome-justified-mixed.pdf");
    const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    const opt = page.getByRole("option", { name: /^This agreement/ }); const b = await opt.boundingBox();
    await tap(b.x + b.width * 0.3, b.y + b.height / 2);
    const box = page.getByTestId("line-input"); await box.waitFor(); await page.waitForTimeout(600);
    await page.keyboard.press("End"); await page.keyboard.type(" for Dvořák", { delay: 60 }); await page.waitForTimeout(2500);
    await page.screenshot({ path: `out/r1-${tag}-typed.png` });
    log(tag, "testids", JSON.stringify(await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-testid]")].map(e => e.dataset.testid))])));
    for (const id of ["line-missing", "line-missing-status", "line-hint-row", "line-missing-row"]) { const l = page.getByTestId(id); if (await l.count()) log(tag, id, JSON.stringify(await l.first().evaluate(e => ({ html: e.outerHTML.slice(0, 900), r: e.getBoundingClientRect().toJSON() })))); }
    await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
    await page.screenshot({ path: `out/r1-${tag}-enter.png` });
    const snap = await page.locator("body").ariaSnapshot(); fs.writeFileSync(`out/r1-${tag}-snap.txt`, snap);
    console.log(snap.split("\n").filter((l) => /status|alert|Tinos|Change|own font|dialog|still|Replace|page/i.test(l)).join("\n"));
    log(tag, "box open", await box.count(), "testids", JSON.stringify(await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-testid]")].map(e => e.dataset.testid))])));
    log(tag, "lines", JSON.stringify(await page.getByTestId("line").evaluateAll(ls => ls.map(l => l.dataset.text.slice(0, 80)))));
    await browser.close();
  }
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
