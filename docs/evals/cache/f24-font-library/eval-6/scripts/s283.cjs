const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs"); const fs = require("fs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280"; const file = process.env.F || "ac283-named-only";
  const { browser, page, reqs } = await open({ phone, ctx: phone ? {} : { viewport: { width: 1280, height: 1500 } } }); const n0 = reqs.length;
  await load(page, process.env.FXD + "/" + file + ".pdf"); await install(page);
  const fontReqs = () => reqs.filter((r) => r.u && /\/fonts\//.test(r.u)).map((r) => r.u.split("/fonts/")[1]);
  log(tag, "font requests after load", JSON.stringify(fontReqs()));
  await page.screenshot({ path: SHOTS + `ac283-${file}-loaded-${tag}.png` });
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => l.dataset.text)); log(tag, "lines", lines.length, JSON.stringify(lines.slice(0, 4)));
  const res = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^END/.test(lines[i])) continue;
    const o = page.getByTestId("line").nth(i); await o.scrollIntoViewIfNeeded().catch(() => {}); if (!phone) await page.mouse.move(5, 5); await page.waitForTimeout(250);
    const b = await o.boundingBox(); const VW = phone ? 390 : 1280;
    const clip = { x: Math.max(0, b.x - 30), y: Math.max(0, b.y - 30), width: Math.min(VW - Math.max(0, b.x - 30), b.width + 60), height: b.height + 60 };
    const base = `out/s283-${file}-${tag}-${i}`;
    await page.screenshot({ path: base + "-before.png", clip });
    const m = reqs.length; const t0 = Date.now();
    await tap(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor();
    const first = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); const sp = el.querySelector("span") || el; return [el.dataset.face, getComputedStyle(sp).fontFamily.slice(0, 80)]; }); const tFirst = Date.now() - t0;
    await page.waitForTimeout(1500); if (!phone) await page.mouse.move(5, 5); await page.waitForTimeout(200);
    await page.screenshot({ path: base + "-open.png", clip });
    const info = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); const sp = el.querySelector("span") || el; const r = el.getBoundingClientRect(); const fam = getComputedStyle(sp).fontFamily; const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "") + ":" + f.weight + ":" + f.style); const firstFam = fam.split(",")[0].trim().replace(/"/g, ""); return { face: el.dataset.face, faces: el.dataset.faces, fam: fam.slice(0, 120), firstFamLoaded: loaded.filter((x) => x.startsWith(firstFam + ":")), check: document.fonts.check(`14px "${firstFam}"`), w: +r.width.toFixed(1), x: +r.x.toFixed(1), attrs: [...el.attributes].filter((x) => /^data-/.test(x.name)).map((x) => x.name + "=" + x.value.slice(0, 40)).join(" ") }; });
    const newReq = reqs.slice(m).filter((r) => r.u && /\/fonts\//.test(r.u)).map((r) => r.u.split("/fonts/")[1]);
    if (i < 2 || /Segoe/.test(lines[i])) await page.screenshot({ path: SHOTS + `ac283-${file}-line${i}-open-${tag}.png` });
    // same-length edit: "time" -> "emit"
    await page.keyboard.press("End"); for (let k = 0; k < 4; k++) await page.keyboard.press("Backspace"); await page.keyboard.type("emit", { delay: 30 }); await page.waitForTimeout(900);
    const s1 = await state(page);
    await page.keyboard.press("Enter"); await page.waitForTimeout(2200);
    const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
    const standin = snap.split("\n").filter((x) => /isn’t|Using|Same widths/.test(x)).map((x) => x.trim()).join(" || ");
    if (!phone) await page.mouse.move(5, 5); await page.waitForTimeout(200); await page.screenshot({ path: base + "-saved.png", clip });
    const b2 = await page.getByTestId("line").nth(i).boundingBox().catch(() => null);
    res.push({ i, text: lines[i], lineW: +b.width.toFixed(1), first, tFirst, info, newReq, typedHint: s1.hint && s1.hint.text, boxAfter: s2.box && s2.box.text, notice: s2.notice && s2.notice.text, standin, lineAfter: s2.lines[i], lineWAfter: b2 && +b2.width.toFixed(1), clip, line: b });
    log(tag, i, JSON.stringify(res[res.length - 1]).slice(0, 1100));
    if (s2.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    if (i < 2 || /Segoe/.test(lines[i])) await page.screenshot({ path: SHOTS + `ac283-${file}-line${i}-saved-${tag}.png` });
  }
  fs.writeFileSync(`out/s283-${file}-${tag}-res.json`, JSON.stringify(res, null, 1));
  const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s283-${file}-${tag}.pdf`);
  if (!phone) { // menu rows
    await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(300); await page.mouse.click(1100, 720); await page.waitForTimeout(600); await page.keyboard.type("x"); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    const picker = page.getByTestId("font-picker"); await picker.click(); await page.waitForTimeout(9000); const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
    const rows = await dlg.locator("[role=group]").first().locator("[role=option]").evaluateAll((os) => os.map((o) => [...o.children].map((c) => c.textContent.trim()).join(" => ")));
    log("menu rows:"); console.log(rows.join("\n")); await page.screenshot({ path: SHOTS + `ac283-${file}-menu-${tag}.png` });
  }
  log(tag, "all font requests", JSON.stringify([...new Set(fontReqs())]));
  log(tag, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 400), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
