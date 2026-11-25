const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const br = (s) => JSON.stringify({ box: s.box && [s.box.text.slice(-16), s.box.focused, s.box.missing], notice: s.notice && s.notice.text.slice(0, 90), hint: s.hint && s.hint.text, focus: s.focus.slice(0, 40) });
  { // memo (Carlito) + Greek, ₹; AC-281 same family
    const { browser, page, reqs } = await open({}); await load(page, "libreoffice-memo.pdf"); await install(page);
    for (const s of [" Ωμέγα", " Жизнь", " ₹5", " Monday ř"]) {
      const o = page.getByRole("option", { name: /^The meeting/ }); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
      await page.keyboard.insertText(s); await page.waitForTimeout(3500); log("memo", s, br(await state(page))); await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    }
    await browser.close();
  }
  { // keyboard: Enter retries; Use your own font by keyboard
    const { browser, page, reqs } = await open({}); await load(page, "chrome-justified-mixed.pdf"); await install(page);
    const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.insertText(" ⸘"); await page.waitForTimeout(2500); await page.keyboard.press("Enter"); await page.waitForTimeout(3000); log("refused", br(await state(page)));
    const d = await page.getByTestId("editor-notice").getByRole("button", { name: "Dismiss" }).boundingBox(); await page.mouse.click(d.x + d.width / 2, d.y + d.height / 2); await page.waitForTimeout(800); log("dismissed", br(await state(page)));
    await page.getByTestId("line-input").focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(3000); log("Enter again (retry => notice back)", br(await state(page)));
    await page.getByTestId("line-input").focus(); await page.keyboard.press("Tab"); await page.waitForTimeout(300); log("Tab", br(await state(page)));
    for (const key of ["Enter", "Space"]) { const fc = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.keyboard.press(key); const ch = await fc; log("key", key, "file chooser:", !!ch, br(await state(page))); if (ch) { await ch.setFiles(process.env.FXD + "/own-dejavu.ttf"); await page.waitForTimeout(2500); log("after file", br(await state(page))); break; } }
    await browser.close();
  }
  { // font menu rows for the document
    const { browser, page } = await open({}); await load(page, "chrome-justified-mixed.pdf");
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(900, 700); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(8000);
    const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    log("groups", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + g.querySelectorAll("[role=option]").length))), "doc rows", JSON.stringify(await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => ")))));
    await page.screenshot({ path: SHOTS + "font-menu-1280.png" });
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
