const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  for (const [file, re, txt] of [["libreoffice-memo.pdf", /^The meeting/, " Ωμέγα Жизнь"], ["chrome-justified-mixed.pdf", /^in full/, " Ωμέγα שלום ₹"]]) {
    const { browser, page, reqs } = await open({}); await load(page, file); await install(page);
    const o = page.getByRole("option", { name: re }); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.insertText(txt); await page.waitForTimeout(4000);
    const s = await state(page); log(file, "typed", JSON.stringify({ hint: s.hint, status: s.status }));
    await page.screenshot({ path: SHOTS + `ac281-301-other-alphabet-${file.slice(0, 6)}-1280.png` });
    await page.keyboard.press("Enter"); await page.waitForTimeout(4000);
    const snap = await page.locator("body").ariaSnapshot(); log(file, "notice", snap.split("\n").filter((x) => /isn’t|Using|Change|own font/.test(x)).map((x) => x.trim()).join(" || "), JSON.stringify((await state(page)).notice));
    await page.screenshot({ path: SHOTS + `ac281-301-other-alphabet-${file.slice(0, 6)}-saved-1280.png` });
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s6-${file.slice(0, 6)}.pdf`);
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
