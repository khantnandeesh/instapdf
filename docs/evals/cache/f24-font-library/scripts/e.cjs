// AC-280, 286, 293 (Closest matches), 296
const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  // --- AC-280: covered characters keep the same font object
  {
    const { browser, page } = await open(); await load(page, "chrome-justified-mixed.pdf");
    const l = page.getByRole("option", { name: /^and it stays/ }); const b = await l.boundingBox();
    await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("us all", { delay: 30 }); await page.waitForTimeout(800);
    log("AC-280 hint while typing covered chars:", await page.getByTestId("line-missing").count());
    await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
    log("AC-280 notice:", (await page.locator("body").ariaSnapshot()).split("\n").filter((x) => /isn’t|Using|This font/.test(x)).join("|") || "none");
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(__dirname + "/out/e-ac280.pdf");
    await browser.close();
  }
  // --- AC-293: menu sections on documents whose fonts are not library families; and via Change
  for (const f of ["std14-reportlab.pdf", "latex-type1.pdf", "font-coverage-1p.pdf", "libreoffice-memo.pdf"]) {
    const { browser, page } = await open(); await load(page, f);
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300);
    await page.mouse.click(900, 650); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(6000);
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    log(f, "groups", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + g.querySelectorAll("[role=option]").length))), "doc rows", JSON.stringify(await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => ")))));
    await page.screenshot({ path: SHOTS + `ours-font-menu-${f.replace(".pdf", "")}-1280.png` });
    await browser.close();
  }
  // --- AC-286: notice and Change on libreoffice-memo (Friday -> Monday, M missing)
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page, reqs } = await open({ phone }); await load(page, "libreoffice-memo.pdf");
    const l = page.getByRole("option", { name: /^The meeting/ }); const b = await l.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2);
    await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.type(" Monday ₹5", { delay: 40 }); await page.waitForTimeout(2500);
    log(tag, "memo hint", (await page.getByTestId("line-missing").innerText().catch(() => "none")).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOTS + `ours-memo-typed-${tag}.png` });
    await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOTS + `ours-memo-notice-${tag}.png` });
    const snap = await page.locator("body").ariaSnapshot();
    log(tag, "notice lines", snap.split("\n").filter((x) => /isn’t|Using|Change|own font|dialog|Dismiss|Close/.test(x)).map((x) => x.trim()).join(" || "));
    log(tag, "modal dialogs open", await page.evaluate(() => [...document.querySelectorAll("dialog[open], [aria-modal=true]")].filter((e) => e.offsetParent || e.open).length), "focus", await page.evaluate(() => document.activeElement.tagName + ":" + (document.activeElement.getAttribute("aria-label") || document.activeElement.className.toString().slice(0, 30))));
    const ch = page.getByRole("button", { name: "Change font" });
    if (await ch.count()) {
      await ch.click(); await page.waitForTimeout(5000);
      await page.screenshot({ path: SHOTS + `ours-memo-change-${tag}.png` });
      const dlg = page.locator("[role=dialog]").filter({ has: page.getByRole("searchbox") }).last();
      log(tag, "Change menu groups", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + [...g.querySelectorAll("[role=option]")].slice(0, 6).map((o) => o.textContent.trim().slice(0, 40)).join(","))).catch((e) => String(e).slice(0, 100))));
      const opt = dlg.getByRole("option", { name: /^Lato/ }).first();
      if (await opt.count()) { await opt.click(); await page.waitForTimeout(3000); log(tag, "after Change -> Lato: line", JSON.stringify(await page.getByTestId("line").evaluateAll((ls) => ls.map((x) => x.dataset.text))), "notice", (await page.locator("body").ariaSnapshot()).split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim()).join("||")); await page.screenshot({ path: SHOTS + `ours-memo-changed-${tag}.png` }); }
    }
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/e-memo-${tag}.pdf`);
    log(tag, "undo enabled", await page.getByRole("button", { name: "Undo" }).isEnabled().catch(() => null), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
    await browser.close();
  }
  // --- AC-296: installed fonts with the permission granted / without the API
  {
    const { browser, ctx, page } = await open(); 
    log("queryLocalFonts in window", await page.evaluate(() => "queryLocalFonts" in window));
    await ctx.grantPermissions(["local-fonts"]).catch((e) => log("grant", String(e).slice(0, 100)));
    await load(page, "libreoffice-memo.pdf");
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.mouse.click(900, 650); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(1500);
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    await dlg.getByRole("option", { name: /Show installed fonts/ }).click(); await page.waitForTimeout(4000);
    const dev = await dlg.locator('[role=group][aria-label="On this device"] [role=option]').evaluateAll((os) => os.map((o) => o.textContent.trim().slice(0, 40)));
    log("AC-296 device group", dev.length, JSON.stringify(dev.slice(0, 12)), "alerts", (await page.locator("body").ariaSnapshot()).split("\n").filter((x) => /alert:|installed|permission/i.test(x)).join("|").slice(0, 300));
    await page.screenshot({ path: SHOTS + "ours-installed-fonts-1280.png" });
    const car = dlg.getByRole("option", { name: /^Carlito/ }); log("Carlito rows (PDF font is Carlito)", await car.count());
    const dv = dlg.locator('[role=group][aria-label="On this device"]').getByRole("option", { name: /DejaVu Sans$/ }).first();
    if (await dv.count()) { await dv.click(); await page.waitForTimeout(2500); log("picked installed font:", await picker.getAttribute("aria-label"), (await page.locator("body").ariaSnapshot()).split("\n").filter((x) => /alert:/.test(x)).join("|")); const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/e-installed.pdf`); }
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
