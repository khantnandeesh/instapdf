const { open, load, log, SHOTS } = require("./lib.cjs");
(async () => {
  const samples = { greek: "Ωμέγα", hebrew: "שלום", thai: "สวัสดี", deva: "नमस्ते", cjk: "漢字", emoji: "😀", arabic: "سلام" };
  for (const [name, s] of Object.entries(samples)) {
    const { browser, page, reqs } = await open();
    await load(page, "chrome-justified-mixed.pdf");
    const d = page.getByRole("option", { name: /^Design/ }); const db = await d.boundingBox();
    await page.mouse.click(db.x + db.width - 3, db.y + db.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
    await page.keyboard.insertText(" " + s); await page.waitForTimeout(2500);
    const fam = await page.getByTestId("line-input").evaluate((el) => [...el.querySelectorAll("span")].map((x) => x.style.fontFamily.slice(0, 80)));
    await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
    const snap = await page.locator("body").ariaSnapshot();
    const notes = snap.split("\n").filter((l) => /isn’t|Using|couldn|can't|can’t|not |Not |Change|own font|Replace|alert:|status:/i.test(l) && !/option|uploaded|Saved|Skip/.test(l)).map((l) => l.trim()).join(" || ");
    await page.screenshot({ path: SHOTS + `ours-other-script-${name}-1280.png` });
    const lineNow = await page.locator("[data-testid=line]").evaluateAll((ls) => ls.map((l) => l.dataset.text).filter((t) => /Design/.test(t)));
    let out = "no download";
    const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await page.getByRole("button", { name: "Download PDF" }).click(); const dd = await dl;
    if (dd) { out = `${__dirname}/out/b2-${name}.pdf`; await dd.saveAs(out); }
    log(name, JSON.stringify({ boxFam: fam, notes, lineNow, out: out.split("/").pop(), fontReqs: reqs.filter((r) => r.u && /fonts\/(lib\/fonts|editor)\/.*woff/.test(r.u)).map((r) => r.u.split("/").pop()), errs: reqs.filter((r) => r.console || r.pageerror) }));
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
