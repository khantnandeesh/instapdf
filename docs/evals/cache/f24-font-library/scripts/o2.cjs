const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page } = await open({ phone });
    await load(page, "chrome-justified-mixed.pdf");
    const opt = page.getByRole("option", { name: /This agreement is made/ });
    const b = await opt.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width * 0.3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2);
    await page.getByTestId("line-input").waitFor();
    await page.keyboard.press("End");
    await page.keyboard.type(" for Dvořák", { delay: 60 });
    await page.waitForTimeout(2000);
    await page.keyboard.press("Enter");
    if (!phone) await page.mouse.move(640, 700);
    for (const ms of [300, 1500, 6000]) {
      await page.waitForTimeout(ms);
      await page.screenshot({ path: SHOTS + `ours-after-enter-${tag}-t${ms}.png`, clip: phone ? { x: 0, y: 100, width: 390, height: 120 } : { x: 200, y: 330, width: 1080, height: 90 } });
    }
    log(tag, "lines", JSON.stringify(await page.locator('[data-testid=line]').evaluateAll((els) => els.slice(0, 3).map((e) => [e.dataset.text, e.style.width]))));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
