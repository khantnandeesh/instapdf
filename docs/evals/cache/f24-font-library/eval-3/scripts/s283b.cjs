const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs"); const fs = require("fs");
(async () => {
  const file = process.env.F || "ac283-named-only";
  { // fresh menu
    const { browser, page, reqs } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, __dirname + "/fx/" + file + ".pdf");
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(1100, 1300); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); const t1 = Date.now(); await picker.click(); const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    let rows = [], pend = -1, tr = [];
    for (let k = 0; k < 180; k++) { await page.waitForTimeout(500); rows = await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))); pend = rows.filter((r) => /No match yet|Matching/.test(r) || !/ => /.test(r)).length; if (k === 1) { tr.push("at 1s: " + JSON.stringify(rows)); await page.screenshot({ path: SHOTS + `ac283-${file}-menu-fresh-1s-1280.png` }); } if (rows.length && pend === 0) break; }
    log("fresh menu settled ms", Date.now() - t1, "pending", pend); console.log(tr.join("\n")); console.log(rows.join("\n")); await page.screenshot({ path: SHOTS + `ac283-${file}-menu-fresh-1280.png` });
    log("sig files fetched", reqs.filter((r) => r.u && /index\/sig\//.test(r.u)).length, "woff", JSON.stringify(reqs.filter((r) => r.u && /woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]).slice(0, 30)));
    await browser.close();
  }
  { const { browser, page, reqs } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, __dirname + "/fx/" + file + ".pdf"); await install(page);
    const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => l.dataset.text));
    for (let i = 0; i < lines.length; i++) { if (/^END/.test(lines[i])) continue;
      const o = page.getByTestId("line").nth(i); const b = await o.boundingBox(); const m = reqs.length;
      await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End"); await page.keyboard.type(" ř", { delay: 30 });
      const t0 = Date.now(); let hintMs = null; for (let k = 0; k < 60; k++) { const s = await state(page); if (s.hint && s.hint.btns.length) { hintMs = Date.now() - t0; break; } await page.waitForTimeout(100); }
      await page.waitForTimeout(700); const s1 = await state(page);
      if (/Arial inv|Segoe UI inv|Georgia/.test(lines[i])) await page.screenshot({ path: SHOTS + `ac283-${file}-line${i}-hint-1280.png` });
      await page.keyboard.press("Enter"); await page.waitForTimeout(2500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
      const standin = snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim()).join(" || ");
      if (/Arial inv|Segoe UI inv|Georgia/.test(lines[i])) await page.screenshot({ path: SHOTS + `ac283-${file}-line${i}-notice-1280.png` });
      log(i, lines[i].slice(0, 22), JSON.stringify({ hintMs, hint: s1.hint && s1.hint.text, btns: s1.hint && s1.hint.btns, status: s1.status, box: s2.box && s2.box.text.slice(-8), notice: s2.notice && s2.notice.text, standin, req: reqs.slice(m).filter((r) => r.u && /woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]) }));
      if (s2.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    }
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s283b-${file}.pdf`);
    log("non-GET", reqs.filter((r) => r.u && r.m !== "GET").length, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 300));
    await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
