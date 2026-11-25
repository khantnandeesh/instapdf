const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const br = (s) => JSON.stringify({ box: s.box && [s.box.text.slice(-10), s.box.focused], notice: s.notice && s.notice.text.slice(0, 50), hint: s.hint && s.hint.text.slice(-30), focus: s.focus.slice(0, 36) });
  for (let rep = 0; rep < 2; rep++) {
    const { browser, page } = await open({}); await load(page, "chrome-justified-mixed.pdf"); await install(page);
    const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.insertText(" ⸘"); await page.waitForTimeout(2500);
    if (rep === 0) { // A: straight from typing: Tab, Enter
      await page.keyboard.press("Tab"); await page.waitForTimeout(300); log("A Tab", br(await state(page)));
      const fc = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null); await page.keyboard.press("Enter"); log("A Enter → chooser", !!(await fc), br(await state(page)));
    } else { // B: after a refusal, dismiss, leave, come back
      await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
      const d = await page.getByTestId("editor-notice").getByRole("button", { name: "Dismiss" }).boundingBox(); await page.mouse.click(d.x + d.width / 2, d.y + d.height / 2); await page.waitForTimeout(500);
      await page.mouse.click(900, 700); await page.waitForTimeout(1500);
      await page.getByTestId("line-input").click(); await page.keyboard.press("End"); await page.keyboard.press("Tab"); await page.waitForTimeout(300); log("B Tab", br(await state(page)));
      const fc = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null); await page.keyboard.press("Enter"); const got = !!(await fc); log("B Enter → chooser", got, br(await state(page)));
      if (!got) { const fc2 = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null); await page.keyboard.press("Space"); log("B Space → chooser", !!(await fc2), br(await state(page))); }
    }
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
