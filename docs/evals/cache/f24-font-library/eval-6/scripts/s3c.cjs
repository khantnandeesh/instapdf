const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const only = process.env.ONLY;
  const blank = phone ? [200, 500] : [900, 700];
  const run = async (name, fn) => {
    if (only && !only.split(",").includes(name)) return;
    const { browser, page, reqs } = await open({ phone });
    await load(page, "chrome-justified-mixed.pdf"); await install(page);
    const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    const S = async (step, shot) => { const s = await state(page); delete s.live; log(tag, name, "##", step, JSON.stringify(s)); if (shot) await page.screenshot({ path: SHOTS + `${shot}-${tag}.png` }); return s; };
    const dls = []; page.on("download", async (d) => { const p = `out/s3c-${name}-${tag}-dl${dls.length + 1}.pdf`; dls.push(p); await d.saveAs(p); });
    const openLine = async (re, frac = 0.3) => { const o = page.getByRole("option", { name: re }); const b = await o.boundingBox(); await tap(b.x + b.width * frac, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(500); await page.keyboard.press("End"); };
    const dismiss = async () => { const n = page.getByTestId("editor-notice").getByRole("button", { name: "Dismiss" }); if (await n.count()) { await n.click(); await page.waitForTimeout(500); } };
    try { await fn({ page, tap, S, dls, openLine, dismiss, reqs }); } catch (e) { log(tag, name, "ERROR", String(e).slice(0, 400)); }
    log(tag, name, "downloads", JSON.stringify(dls), "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 300), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
    await browser.close();
  };
  const box = (page) => page.getByTestId("line-input");
  await run("B1-retry", async ({ page, tap, S, openLine, dismiss }) => {
    await openLine(/^This agreement/); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
    await dismiss(); await S("notice dismissed");
    await tap(...blank); await page.waitForTimeout(2000); await S("left with same text (expect no notice, box kept)");
    await tap(...blank); await page.waitForTimeout(1500); await S("left again");
    await box(page).click(); await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await S("Enter (expect notice again)");
  });
  await run("B2-escape", async ({ page, tap, S, openLine, dls }) => {
    await openLine(/^This agreement/); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
    await page.keyboard.press("Escape"); await page.waitForTimeout(1200); await S("Escape in box", "ac310-escape-restored");
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download after escape n=" + dls.length);
    await openLine(/^This agreement/); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "Undo" }).focus().catch(() => {}); await S("focus moved to Undo button");
    await page.keyboard.press("Escape"); await page.waitForTimeout(1200); await S("Escape from elsewhere");
  });
  await run("B3-replace", async ({ page, tap, S, openLine, dls }) => {
    await openLine(/^This agreement/); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "Replace with new text" }).click(); await page.waitForTimeout(2500); await S("after Replace with new text", "ac311-replaced");
    await tap(...blank); await page.waitForTimeout(1500); await S("after click away");
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download n=" + dls.length);
  });
  await run("B4-nofont", async ({ page, tap, S, openLine, dls, dismiss, reqs }) => {
    await openLine(/^in full/, 0.9); await page.keyboard.insertText(" ⸘"); await page.waitForTimeout(2500); await S("typed ⸘", "ac312-hint-own-font");
    await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await S("Enter with no font", "ac310-nofont-refused");
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download while open n=" + dls.length);
    await dismiss(); await tap(...blank); await page.waitForTimeout(1800); await S("left, same text");
    // Tab from the box to the hint's button
    await box(page).click(); await page.keyboard.press("End"); await page.keyboard.press("Tab"); await page.waitForTimeout(300); await S("Tab from box");
    const m = reqs.length;
    const fc = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
    await page.keyboard.press("Enter"); const ch = await fc;
    if (!ch) { log("NO file chooser from keyboard; clicking"); const fc2 = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null); await page.getByTestId("line-missing").getByRole("button", { name: /own font/ }).click(); const c2 = await fc2; if (c2) await c2.setFiles(process.env.FXD + "/own-dejavu.ttf"); else log("STILL no chooser"); }
    else { log("accept", await ch.element().getAttribute("accept")); await ch.setFiles(process.env.FXD + "/own-dejavu.ttf"); }
    await page.waitForTimeout(3000); await S("own font added", "ac312-own-font-added");
    log("requests after adding font", JSON.stringify(reqs.slice(m).filter((r) => r.u).map((r) => r.m + " " + r.u.slice(-60))));
    await tap(...blank); await page.waitForTimeout(2500); await S("left after adding font (expect saved)", "ac312-saved");
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download n=" + dls.length);
  });
  await run("B5-fits", async ({ page, tap, S, openLine, dls }) => {
    // inside the clip: "in full." + " for Dvořák"; line 2 + " 12" (ends before the clip edge?)
    await openLine(/^in full/, 0.9); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1500); await S("typed", "ac304-hint-in-full"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500); await S("in full + Dvořák saved?", "ac286-notice");
    await openLine(/^and it stays/, 0.9); await page.keyboard.type(" a", { delay: 30 }); await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await S("line2 + ' a'");
    await openLine(/^and it stays/, 0.9); await page.keyboard.type("b", { delay: 30 }); await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await S("line2 + 'b'");
    await openLine(/^and it stays/, 0.9); await page.keyboard.type("c", { delay: 30 }); await page.keyboard.press("Enter"); await page.waitForTimeout(2000); const s = await S("line2 + 'c'");
    if (s.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download n=" + dls.length);
  });
  await run("B6-design", async ({ page, tap, S, openLine, dls }) => {
    // table cell: long text inside the clip but over the cell border -> allowed? and Greek pick
    await openLine(/^Design/, 0.9); await page.keyboard.insertText(" Ωμέγα Жизнь"); await page.waitForTimeout(3500); await S("typed greek+cyrillic", "ac301-greek-order"); await page.keyboard.press("Enter"); await page.waitForTimeout(3000); await S("saved?");
    await page.getByTestId("download").click(); await page.waitForTimeout(3500); await S("download n=" + dls.length);
  });
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
