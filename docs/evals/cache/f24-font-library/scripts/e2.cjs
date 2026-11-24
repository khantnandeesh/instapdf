const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page, reqs } = await open({ phone }); await load(page, "chrome-justified-mixed.pdf");
    const l = page.getByRole("option", { name: /^in full/ }); const b = await l.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width - 2, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 2, b.y + b.height / 2);
    await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.type(" Dvořák", { delay: 40 }); await page.waitForTimeout(2000);
    await page.screenshot({ path: SHOTS + `ours-hint-under-${tag}.png` });
    log(tag, "hint side (line with blank space under it)", await page.getByTestId("line-missing").getAttribute("data-side"), JSON.stringify(await page.getByTestId("line-missing").boundingBox()), JSON.stringify(await page.getByTestId("line-input").boundingBox()));
    await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
    const notice = page.getByRole("button", { name: "Change font" });
    log(tag, "notice text", JSON.stringify(await notice.evaluate((b) => b.parentElement.innerText.replace(/\n/g, " | ")).catch(() => "none")), "blocking", await page.evaluate(() => [...document.querySelectorAll("dialog[open],[aria-modal=true]")].length));
    // notice does not block: Tab order / page still clickable
    await notice.click(); await page.waitForTimeout(6000);
    await page.screenshot({ path: SHOTS + `ours-change-menu-${tag}.png` });
    const dlg = page.locator("[role=dialog]").filter({ has: page.getByRole("searchbox") }).last();
    log(tag, "Change menu", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ": " + [...g.querySelectorAll("[role=option]")].slice(0, 8).map((o) => [...o.children].map((c) => c.textContent.trim()).join("=>").slice(0, 50)).join(" , "))).catch((e) => String(e).slice(0, 200))));
    const opt = dlg.getByRole("option", { name: /^EB Garamond/ }).first();
    if (await opt.count()) { await opt.click(); await page.waitForTimeout(3500); await page.screenshot({ path: SHOTS + `ours-changed-${tag}.png` }); log(tag, "after Change: notice", JSON.stringify(await page.getByRole("button", { name: "Change font" }).evaluate((b) => b.parentElement.innerText.replace(/\n/g, " | ")).catch(() => "none")), "undo/redo", await page.getByRole("button", { name: "Undo" }).isEnabled(), await page.getByRole("button", { name: "Redo" }).isEnabled()); }
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/e2-changed-${tag}.pdf`);
    const own = page.getByRole("button", { name: "Use your own font" });
    log(tag, "'Use your own font' visible", await own.isVisible().catch(() => false));
    if (await own.isVisible().catch(() => false)) { const fc = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null); await own.click(); const c = await fc; log(tag, "own font opens file chooser", !!c); if (c) { await c.setFiles(__dirname + "/fx/own-dejavu.ttf"); await page.waitForTimeout(3000); log(tag, "after own font: notice", JSON.stringify(await page.locator("body").ariaSnapshot().then((s) => s.split("\n").filter((x) => /isn’t|Using|DejaVu|alert:/.test(x)).map((x) => x.trim()).join(" || ")))); await page.screenshot({ path: SHOTS + `ours-own-font-for-missing-${tag}.png` }); const dl2 = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl2).saveAs(`${__dirname}/out/e2-own-${tag}.pdf`); } }
    log(tag, "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 300));
    await browser.close();
  }
  // no Local Font Access: control absent, upload offered
  {
    const { chromium, BASE, FX } = require("./lib.cjs");
    const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(() => { try { delete window.queryLocalFonts; delete Window.prototype.queryLocalFonts; } catch {} });
    const page = await ctx.newPage(); await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle" });
    log("no-LFA: queryLocalFonts", await page.evaluate(() => "queryLocalFonts" in window));
    await page.locator('input[type="file"]').first().setInputFiles(FX + "libreoffice-memo.pdf"); await page.waitForTimeout(4000);
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.mouse.click(900, 650); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(1500);
    log("no-LFA device group", JSON.stringify(await page.locator('[role=group][aria-label="On this device"] [role=option]').evaluateAll((os) => os.map((o) => o.textContent.trim()))));
    await browser.close();
  }
  // keyboard: focus after Enter
  {
    const { browser, page } = await open(); await load(page, "chrome-justified-mixed.pdf");
    const lb = page.getByRole("listbox", { name: "Text on page 1" }); await lb.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
    await page.keyboard.type("x"); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
    log("focus after keyboard edit + Enter", await page.evaluate(() => document.activeElement.tagName + ":" + (document.activeElement.getAttribute("role") || "") + ":" + (document.activeElement.getAttribute("aria-label") || "")));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
