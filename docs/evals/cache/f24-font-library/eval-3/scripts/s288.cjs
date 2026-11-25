const { open, load, log, SHOTS, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs"); const fs = require("fs");
const T = { hindi: " नया", arabic: " جديد", hebrew: " חדש", bengali: " নতুন", tamil: " புதிய", thai: " ใหม่", greek: " Ωμέγα", cyrillic: " Жизнь", georgian: " ახალი", armenian: " նոր" };
(async () => {
  const part = process.env.PART || "AB"; const out = {};
  if (/A/.test(part)) for (const [name, file, which, kind] of [["serif-LiberationSerif", "chrome-justified-mixed.pdf", /^in full/, "serif"], ["sans-Carlito", "libreoffice-memo.pdf", /^The meeting/, "sans"], ["sans-Arial-named", __dirname + "/fx/ac283-named-only.pdf", 0, "sans"], ["serif-Georgia-named", __dirname + "/fx/ac283-named-only.pdf", 16, "serif"], ["mono-Courier-named", __dirname + "/fx/ac283-named-only.pdf", 10, "mono"]]) {
    out[name] = {};
    for (const [sc, txt] of Object.entries(T)) {
      const { browser, page, reqs } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, file); await install(page);
      const o = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which }); const b = await o.boundingBox();
      await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End"); await page.keyboard.insertText(txt);
      const t0 = Date.now(); let s = null; for (let k = 0; k < 80; k++) { s = await state(page); if (s.hint && s.hint.btns.length) break; await page.waitForTimeout(100); } const ms = Date.now() - t0; await page.waitForTimeout(1500); s = await state(page);
      out[name][sc] = { btns: s.hint && s.hint.btns, hint: s.hint && s.hint.text, status: s.status, ms, under: s.box && s.box.under };
      log(name, sc, JSON.stringify(out[name][sc]));
      if (/hindi|arabic|hebrew/.test(sc) && /Liberation|Carlito/.test(name)) await page.screenshot({ path: SHOTS + `ac288-${name}-${sc}-1280.png` });
      if (sc === "arabic" || sc === "hindi") { await page.keyboard.press("Enter"); await page.waitForTimeout(3500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot(); log("   saved:", JSON.stringify({ box: s2.box && s2.box.text.slice(-10), notice: s2.notice && s2.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0] })); if (!s2.box) { const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s288-${name}-${sc}.pdf`); } }
      await browser.close();
    }
  }
  if (/B/.test(part)) {
    { const { browser, page } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, __dirname + "/fx/ac288-scripts.pdf");
      await page.screenshot({ path: SHOTS + "ac288-scripts-loaded-1280.png" });
      await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(1100, 1350); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
      const picker = page.getByTestId("font-picker"); const t1 = Date.now(); await picker.click(); const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
      let rows = [], pend = -1; for (let k = 0; k < 120; k++) { await page.waitForTimeout(500); rows = await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))); pend = rows.filter((r) => /No match yet|Matching/.test(r) || !/ => /.test(r)).length; if (rows.length && pend === 0) break; }
      log("B menu settled ms", Date.now() - t1, "pending", pend); console.log(rows.join("\n")); await page.screenshot({ path: SHOTS + "ac288-scripts-menu-1280.png" }); await browser.close(); }
    const add = [" جديد ظ", " جديد ظ", " جديد ظ", " جديد ظ", " नया झ", " नया झ", " חדש ץ", " חדש ץ", " নতুন ঝ", " புதிய ஞ", " ใหม่ ฬ"];
    const { browser, page, reqs } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, __dirname + "/fx/ac288-scripts.pdf"); await install(page);
    const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => [l.dataset.text, Math.round(l.getBoundingClientRect().y)])); log("B lines", JSON.stringify(lines));
    // group lines by y so each visual row is tried once
    const ys = [...new Set(lines.map((l) => l[1]))]; let row = 0;
    for (const y of ys) { const i = lines.findIndex((l) => l[1] === y); const o = page.getByTestId("line").nth(i); const b = await o.boundingBox(); if (!b) continue; const m = reqs.length;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); const ok = await page.getByTestId("line-input").waitFor({ timeout: 8000 }).then(() => true).catch(() => false); if (!ok) { log("B row", row++, "did not open", lines[i][0]); continue; }
      await page.waitForTimeout(1200); const s0 = await state(page); await page.keyboard.press("End"); await page.keyboard.insertText(add[Math.min(row, add.length - 1)]); await page.waitForTimeout(4000); const s1 = await state(page);
      await page.screenshot({ path: SHOTS + `ac288-scripts-row${row}-typed-1280.png` });
      await page.keyboard.press("Enter"); await page.waitForTimeout(3500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
      log("B row", row, JSON.stringify({ text: lines[i][0].slice(0, 20), face: s0.box && s0.box.face, hint: s1.hint && s1.hint.text, btns: s1.hint && s1.hint.btns, status: s1.status, box: s2.box && s2.box.text.slice(-10), notice: s2.notice && s2.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0], woff: reqs.slice(m).filter((r) => r.u && /woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]) }));
      if (s2.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(600); } row++; }
    await page.screenshot({ path: SHOTS + "ac288-scripts-saved-1280.png" });
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s288-scripts.pdf");
    log("errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 400), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length); await browser.close();
  }
  fs.writeFileSync("out/s288-res.json", JSON.stringify(out, null, 1));
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
