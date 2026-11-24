const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  const { browser, page, reqs } = await open(); await load(page, "latex-type1c.pdf");
  const n = await page.getByTestId("line").count();
  await page.screenshot({ path: SHOTS + "ours-cff-before-1280.png" });
  for (let i = 0; i < n; i++) {
    const l = page.getByTestId("line").nth(i); const b = await l.boundingBox(); const t = await l.getAttribute("data-text");
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(5000);
    const box = page.getByTestId("line-input");
    log(i, JSON.stringify(t), "face", await box.getAttribute("data-face"), "faces", await box.getAttribute("data-faces"), "fam", JSON.stringify(await box.evaluate((el) => [...el.querySelectorAll("span")].map((x) => x.style.fontFamily.slice(0, 50)))));
    if (i === 1) await page.screenshot({ path: SHOTS + "ours-cff-line-open-1280.png" });
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  }
  log("errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 500));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
