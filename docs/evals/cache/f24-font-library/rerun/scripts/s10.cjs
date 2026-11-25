const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs"); const fs = require("fs");
(async () => {
  { const { browser, page } = await open(); await load(page, "scripts-chrome.pdf"); await install(page);
    const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => l.dataset.text)); log("scripts-chrome lines", JSON.stringify(lines));
    const res = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i]; const kind = /[ऀ-ॿ]/.test(t) ? "hindi" : /[؀-ۿ]/.test(t) ? "arabic" : /[֐-׿]/.test(t) ? "hebrew" : null; if (!kind || res.filter((r) => r.kind === kind).length >= 2) continue;
      const o = page.getByTestId("line").nth(i); await o.scrollIntoViewIfNeeded(); await page.mouse.move(5, 5); await page.waitForTimeout(300); const b = await o.boundingBox();
      const clip = { x: Math.max(0, b.x - 30), y: Math.max(0, b.y - 30), width: Math.min(1280 - Math.max(0, b.x - 30), b.width + 60), height: b.height + 60 };
      await page.screenshot({ path: `out/s10-${i}-before.png`, clip });
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(1500); await page.mouse.move(5, 5); await page.waitForTimeout(200);
      await page.screenshot({ path: `out/s10-${i}-open.png`, clip });
      const s = await state(page); const add = kind === "hindi" ? " नया" : kind === "arabic" ? " جديد" : " חדש";
      await page.keyboard.press(kind === "hindi" ? "End" : "End"); await page.keyboard.insertText(add); await page.waitForTimeout(3500);
      await page.screenshot({ path: `out/s10-${i}-typed.png`, clip: { ...clip, y: Math.max(0, clip.y - 30), height: clip.height + 60 } });
      const s2 = await state(page);
      await page.keyboard.press("Enter"); await page.waitForTimeout(3500); await page.mouse.move(5, 5);
      const s3 = await state(page); await page.screenshot({ path: `out/s10-${i}-saved.png`, clip });
      const snap = await page.locator("body").ariaSnapshot();
      res.push({ i, kind, text: t.slice(0, 30), open: { face: s.box.face, attrs: s.box.attrs.slice(0, 200) }, typed: { hint: s2.hint && s2.hint.text, missing: s2.box.missing }, saved: { box: s3.box && s3.box.text.slice(-20), notice: s3.notice && s3.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0], line: (s3.lines[i] || "").slice(-20) }, line: b, clip });
      if (s3.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    }
    fs.writeFileSync("out/s10-res.json", JSON.stringify(res, null, 1)); for (const r of res) log(JSON.stringify(r).slice(0, 900));
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s10-scripts.pdf");
    await browser.close(); }
  { const { browser, page } = await open(); await load(page, "std14-reportlab.pdf"); await install(page);
    const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => l.dataset.text)); log("std14 lines", JSON.stringify(lines));
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(1100, 720); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(7000); const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    log("std14 doc rows", JSON.stringify(await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => "))))); await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Select", exact: true }).click().catch(() => {}); await page.keyboard.press("Escape");
    for (let i = 0; i < Math.min(lines.length, 6); i++) { const o = page.getByTestId("line").nth(i); const b = await o.boundingBox(); if (!b) continue; await page.mouse.click(b.x + 4, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(600);
      await page.keyboard.press("Home"); await page.keyboard.press("Delete"); await page.keyboard.type(lines[i][0]); await page.waitForTimeout(600); await page.keyboard.press("Enter"); await page.waitForTimeout(2000); const s = await state(page); const snap = await page.locator("body").ariaSnapshot(); log("std14 line", i, JSON.stringify({ box: !!s.box, notice: s.notice && s.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0] })); if (s.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); } }
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s10-std14.pdf");
    await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
