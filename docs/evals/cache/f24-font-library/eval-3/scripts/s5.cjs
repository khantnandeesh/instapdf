const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page, reqs } = await open({ phone }); await load(page, "libreoffice-memo.pdf"); await install(page);
    const o = page.getByRole("option", { name: /^The meeting/ }); const b = await o.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.type(" Monday ₹5", { delay: 40 }); await page.waitForTimeout(3500);
    const s = await state(page); log(tag, "typed", JSON.stringify({ hint: s.hint, status: s.status }));
    await page.screenshot({ path: SHOTS + `memo-typed-${tag}.png` });
    await page.keyboard.press("Enter"); await page.waitForTimeout(3500);
    await page.screenshot({ path: SHOTS + `ac286-memo-notice-${tag}.png` });
    const snap = await page.locator("body").ariaSnapshot();
    log(tag, "notice aria", snap.split("\n").filter((x) => /isn’t|Using|Change|own font|dialog/.test(x)).map((x) => x.trim()).join(" || "));
    log(tag, "notice visible text", JSON.stringify(await page.evaluate(() => { const els = [...document.querySelectorAll("*")].filter((e) => /Using /.test(e.textContent) && e.children.length < 8 && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 200); const e = els[els.length - 1]; if (!e) return null; let n = e; while (n.parentElement && !/Change/.test(n.textContent)) n = n.parentElement; const r = n.getBoundingClientRect(); const vis = []; const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const p = w.currentNode.parentElement; const pr = p.getBoundingClientRect(); const cs = getComputedStyle(p); const hidden = p.closest(".sr-only") || pr.width <= 1 || cs.visibility === "hidden"; vis.push((hidden ? "[sr]" : "") + w.currentNode.textContent.trim()); } return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], parts: vis.filter(Boolean), cls: n.className.toString().slice(0, 80), btns: [...n.querySelectorAll("button")].map((b) => (b.textContent.trim() || b.getAttribute("aria-label")) + "@" + Math.round(b.getBoundingClientRect().width)) }; })));
    log(tag, "modals", await page.evaluate(() => [...document.querySelectorAll("dialog[open], [aria-modal=true]")].filter((e) => e.offsetParent || e.open).length));
    const ch = page.getByRole("button", { name: /^Change/ }).first();
    if (await ch.count()) { await ch.click(); await page.waitForTimeout(6000); await page.screenshot({ path: SHOTS + `ac286-change-menu-${tag}.png` });
      const dlg = page.locator("[role=dialog]").filter({ has: page.getByRole("searchbox") }).last();
      log(tag, "Change menu", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + [...g.querySelectorAll("[role=option]")].slice(0, 6).map((o) => o.textContent.trim().slice(0, 40)).join(","))).catch((e) => String(e).slice(0, 100))), "own-font options", await dlg.getByRole("option", { name: /font file|own font/i }).count().catch(() => -1));
      await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s5-memo-${tag}.pdf`);
    log(tag, "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 300));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
