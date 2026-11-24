// AC-281/282/284: what the matcher says for generated PDFs
const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  for (const f of ["match-regular", "match-bold-italic", "ac281-library-family", "ac282-name-lies"]) {
    const { browser, page, reqs } = await open();
    const t0 = Date.now();
    await load(page, __dirname + "/fx/" + f + ".pdf");
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(400);
    const pg = await page.locator(".ed-page").first().boundingBox();
    await page.mouse.click(pg.x + pg.width - 60, Math.min(700, pg.y + pg.height - 40)); await page.waitForTimeout(600);
    await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const t1 = Date.now();
    await page.getByTestId("font-picker").click();
    const id = await page.getByTestId("font-picker").getAttribute("aria-controls");
    const dlg = page.locator("#" + id);
    // wait until the In this document rows stop changing
    let rows = [], trace = [];
    for (let i = 0; i < 300; i++) { await page.waitForTimeout(500); rows = await dlg.locator('[role=group]').first().locator('[role=option]').evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))); const pend = rows.filter((r) => /No match yet|…|Matching|\.\.\./.test(r) || !/ => /.test(r)).length; if (i % 10 === 0) trace.push(Math.round((Date.now() - t1) / 1000) + "s:" + pend); if (rows.length && pend === 0) break; }
    log(f, "pending over time", trace.join(" "));
    log(f, "rows", rows.length, "settled after ms", Date.now() - t1);
    fs.writeFileSync(`${__dirname}/out/d-${f}.json`, JSON.stringify({ rows, groups: await dlg.locator('[role=group]').evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + g.querySelectorAll("[role=option]").length)) }, null, 1));
    if (/^ac/.test(f)) { console.log(rows.join("\n")); await page.screenshot({ path: SHOTS + `ours-menu-${f}-1280.png` }); }
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    if (/^ac/.test(f)) {
      await page.getByRole("button", { name: "Select", exact: true }).click().catch(() => {});
      const n = await page.getByTestId("line").count();
      for (let i = 0; i < n; i++) {
        const l = page.getByTestId("line").nth(i); const b = await l.boundingBox();
        await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
        await page.keyboard.type(" QZ Dvořák", { delay: 40 }); await page.waitForTimeout(3000);
        log(f, "line", i, JSON.stringify({ hint: (await page.getByTestId("line-missing").innerText().catch(() => "none")).replace(/\n/g, " | "), status: await page.getByTestId("line-missing-status").textContent().catch(() => ""), fam: await page.getByTestId("line-input").evaluate((el) => el.querySelector("span").style.fontFamily) }));
        await page.screenshot({ path: SHOTS + `ours-${f}-line${i}-typed-1280.png` });
        await page.keyboard.press("Enter"); await page.waitForTimeout(2000);
        const snap = await page.locator("body").ariaSnapshot();
        log("   notice:", snap.split("\n").filter((l) => /isn’t|Using|This font/.test(l)).map((l) => l.trim()).join(" || "));
      }
      await page.screenshot({ path: SHOTS + `ours-${f}-committed-1280.png` });
      const dl = page.waitForEvent("download", { timeout: 20000 }); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/d-${f}-output.pdf`);
      log(f, "font files fetched", reqs.filter((r) => r.u && /fonts\/(lib\/fonts|editor)\/.*woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]).filter((v, i, a) => a.indexOf(v) === i));
    }
    log(f, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 400));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
