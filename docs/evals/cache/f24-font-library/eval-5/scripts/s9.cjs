const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  { // AC-280
    const { browser, page } = await open(); await load(page, "chrome-justified-mixed.pdf");
    const l = page.getByRole("option", { name: /^and it stays/ }); const b = await l.boundingBox();
    await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("us all", { delay: 30 }); await page.waitForTimeout(1500);
    log("AC-280 hint count", await page.getByTestId("line-missing").count());
    await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
    log("AC-280 notice:", (await page.locator("body").ariaSnapshot()).split("\n").filter((x) => /isn’t|Using|This font|page edge/.test(x)).join("|") || "none");
    const t = Date.now(); const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s9-ac280.pdf"); log("download ms", Date.now() - t);
    await browser.close();
  }
  { // AC-292 Playfair Display for added text
    const { browser, page, reqs } = await open(); await load(page, "chrome-justified-mixed.pdf");
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(700, 660); await page.waitForTimeout(700);
    await page.keyboard.type("Approved Quickly 2026"); await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(2500);
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls"))); await dlg.getByRole("searchbox").fill("playfair display"); await page.waitForTimeout(1200);
    const m = reqs.length; await dlg.getByRole("option", { name: "Playfair Display", exact: true }).first().click().catch(async () => { await dlg.locator("[role=option]").filter({ hasText: /^Playfair Display$/ }).first().click(); }); await page.waitForTimeout(3000);
    log("AC-292 picked", await picker.getAttribute("aria-label"), "font requests", JSON.stringify(reqs.filter((r) => r.u && /playfair-display\//.test(r.u)).map((r) => r.u.split("/fonts/")[1])));
    await page.screenshot({ path: SHOTS + "ac292-playfair-1280.png" });
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s9-playfair.pdf");
    log("non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
    await browser.close();
  }
  { // phone: Tab past the last button of the docked row leaves the edit
    const { browser, page } = await open({ phone: true }); await load(page, "chrome-justified-mixed.pdf"); await install(page);
    const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.type(" Dvořák", { delay: 30 }); await page.waitForTimeout(3500);
    const foc = () => page.evaluate(() => { const a = document.activeElement; return (a.dataset.testid || a.tagName) + ":" + (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24) + " boxOpen=" + !!document.querySelector("[data-testid=line-input]"); });
    const seq = []; for (const k of ["Tab", "Shift+Tab", "Tab", "Tab", "Tab"]) { await page.keyboard.press(k); await page.waitForTimeout(k === "Tab" ? 400 : 200); seq.push(k + "→" + await foc()); }
    await page.waitForTimeout(3000); seq.push("end→" + await foc()); log("phone tab order", JSON.stringify(seq));
    const s = await state(page); log("after", JSON.stringify({ box: s.box && s.box.text, lines: s.lines[3], notice: s.notice }));
    await page.screenshot({ path: SHOTS + "ac313-tab-out-saved-390.png" });
    log("stand-in notice", JSON.stringify(await page.evaluate(() => { const e = [...document.querySelectorAll("*")].filter((x) => /Using Tinos/.test(x.textContent || "") && x.getBoundingClientRect().height > 0).pop(); if (!e) return null; let n = e; while (n.parentElement && !/Change/.test(n.textContent)) n = n.parentElement; const r = n.getBoundingClientRect(); const parts = []; const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const p = w.currentNode.parentElement; const pr = p.getBoundingClientRect(); parts.push((p.closest(".sr-only") || pr.width <= 1 ? "[sr]" : "") + w.currentNode.textContent.trim()); } const lh = parseFloat(getComputedStyle(e).lineHeight); return { rect: [r.x, r.y, r.width, r.height].map(Math.round), parts: parts.filter(Boolean), textH: Math.round(e.getBoundingClientRect().height), lh, dock: (() => { const d = document.querySelector("[data-testid=dock]").getBoundingClientRect(); return [Math.round(d.y), Math.round(d.height)]; })() }; })));
    const ch = page.getByRole("button", { name: /^Change/ }).first(); await ch.tap(); await page.waitForTimeout(6000); await page.screenshot({ path: SHOTS + "ac286-change-menu-390.png" });
    const dlg = page.locator("[role=dialog]").filter({ has: page.getByRole("searchbox") }).last();
    log("phone Change menu groups", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + [...g.querySelectorAll("[role=option]")].slice(0, 5).map((o) => o.textContent.trim().slice(0, 30)).join(","))).catch((e) => String(e).slice(0, 100))), "has 'Use your own font'/'Add a font file':", await dlg.getByRole("option", { name: /font file|own font/i }).count().catch(() => -1));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
