// Ours, same task as Sejda T1, at desktop and phone
const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page, reqs } = await open({ phone });
    await load(page, "chrome-justified-mixed.pdf");
    await page.screenshot({ path: SHOTS + `ours-t1-1-opened-${tag}.png` });
    const opt = page.getByRole("option", { name: /This agreement is made/ });
    const b = await opt.boundingBox();
    const click = async (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    const t0 = Date.now();
    await click(b.x + b.width * 0.3, b.y + b.height / 2);
    const box = page.getByTestId("line-input");
    await box.waitFor({ timeout: 10000 });
    log(tag, "box open ms", Date.now() - t0);
    await page.waitForTimeout(600);
    const sel = await page.evaluate(() => { const s = getSelection(); return { type: s.type, text: s.toString(), off: s.anchorOffset, node: s.anchorNode && s.anchorNode.textContent.slice(0, 60) }; });
    log(tag, "caret", JSON.stringify(sel), "faces", await box.getAttribute("data-faces"), await box.getAttribute("data-face"));
    await page.screenshot({ path: SHOTS + `ours-t1-2-line-open-${tag}.png` });
    await page.keyboard.press("End");
    await page.keyboard.type(" for Dvořák", { delay: 60 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOTS + `ours-t1-3-typed-${tag}.png` });
    const hint = page.getByTestId("line-missing");
    log(tag, "hint", await hint.innerText().catch(() => "none"), "| side", await hint.getAttribute("data-side").catch(() => ""), "| box", JSON.stringify(await hint.boundingBox().catch(() => null)), "| input box", JSON.stringify(await box.boundingBox()));
    log(tag, "status", await page.getByTestId("line-missing-status").innerText().catch(() => "none"));
    log(tag, "focus in box", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid")));
    const mark = reqs.length;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOTS + `ours-t1-4-after-enter-${tag}.png` });
    const snap = await page.locator("body").ariaSnapshot();
    fs.writeFileSync(__dirname + `/out/o1-after-enter-${tag}.txt`, snap);
    console.log(snap.split("\n").filter((l) => /status|alert|notice|Tinos|stand|Change|own font|dialog/i.test(l)).join("\n"));
    const dl = page.waitForEvent("download", { timeout: 30000 });
    const t1 = Date.now();
    await page.getByRole("button", { name: "Download PDF" }).click();
    const d = await dl; await d.saveAs(__dirname + `/out/ours-t1-output-${tag}.pdf`);
    log(tag, "download ms", Date.now() - t1, d.suggestedFilename());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: SHOTS + `ours-t1-5-after-download-${tag}.png` });
    log(tag, "non-GET", JSON.stringify(reqs.filter((r) => r.u && r.m !== "GET")), "hosts", [...new Set(reqs.filter((r) => r.u && !r.u.startsWith("data:") && !r.u.startsWith("blob:")).map((r) => new URL(r.u).host))]);
    log(tag, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
