// AC-299/300/301/302/304 line-edit behaviours on staging
const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const { browser, page, reqs } = await open({ phone });
  const short = (from) => reqs.slice(from).filter((r) => r.u).map((r) => r.m + " " + r.u.replace(/^https:\/\/[^/]+/, "").slice(0, 90));
  await load(page, "chrome-justified-mixed.pdf");
  const box = page.getByTestId("line-input"), hint = page.getByTestId("line-missing");
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  // --- AC-299 keyboard open
  if (!phone) {
    const lb = page.getByRole("listbox", { name: "Text on page 1" });
    await lb.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(200);
    log("active descendant", await lb.getAttribute("aria-activedescendant"));
    await page.keyboard.press("Enter"); await page.waitForTimeout(800);
    const k = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); if (!el) return "no box"; const s = getSelection(); const r = document.createRange(); r.selectNodeContents(el); r.setStart(s.anchorNode, s.anchorOffset); return { label: el.getAttribute("aria-label").slice(0, 50), type: s.type, charsAfterCaret: r.toString().length, len: el.textContent.length, anims: el.getAnimations({ subtree: true }).length }; });
    log("AC-299 keyboard open", JSON.stringify(k));
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    log("after Esc box count", await box.count());
  }
  // --- AC-300/304 on the middle line (text above and below)
  const mid = page.getByRole("option", { name: /^and it stays/ });
  const mb = await mid.boundingBox();
  const region = { x: Math.max(0, mb.x - 20), y: mb.y - 70, width: Math.min((phone ? 390 : 1280) - Math.max(0, mb.x - 20), mb.width + 200), height: mb.height + 140 };
  await page.mouse.move(3, 3); await page.waitForTimeout(200);
  await page.screenshot({ path: `${__dirname}/out/b-${tag}-mid-0before.png`, clip: region });
  await tap(mb.x + mb.width * 0.25, mb.y + mb.height / 2); await box.waitFor(); await page.waitForTimeout(700);
  await page.mouse.move(3, 3);
  await page.screenshot({ path: `${__dirname}/out/b-${tag}-mid-1open.png`, clip: region });
  // type a missing char in the middle of the line (caret where clicked)
  await page.keyboard.type("ř", { delay: 50 }); await page.waitForTimeout(phone ? 6000 : 1800);
  await page.screenshot({ path: `${__dirname}/out/b-${tag}-mid-2typed.png`, clip: region });
  await page.screenshot({ path: SHOTS + `ours-missing-midline-${tag}.png` });
  const g = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=line-input]"), h = document.querySelector("[data-testid=line-missing]"); if (!h) return { hint: null, missing: el.dataset.missing };
    const hr = h.getBoundingClientRect(), er = el.getBoundingClientRect(), cs = getComputedStyle(h);
    // where is the ř drawn
    let charRect = null; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const i = w.currentNode.textContent.indexOf("ř"); if (i >= 0) { const r = document.createRange(); r.setStart(w.currentNode, i); r.setEnd(w.currentNode, i + 1); charRect = r.getBoundingClientRect().toJSON(); break; } }
    const lines = [...document.querySelectorAll("[data-testid=line]")].map((l) => ({ t: l.dataset.text.slice(0, 20), r: l.getBoundingClientRect().toJSON() }));
    const hit = lines.filter((l) => !(l.r.right < hr.left || l.r.left > hr.right || l.r.bottom <= hr.top + 1 || l.r.top >= hr.bottom - 1)).map((l) => l.t + " overlapY " + (Math.min(l.r.bottom, hr.bottom) - Math.max(l.r.top, hr.top)).toFixed(1));
    const hl = []; try { for (const [n, v] of CSS.highlights) hl.push(n + ":" + v.size); } catch {}
    return { text: h.innerText.replace(/\n/g, " | "), side: h.dataset.side, hint: hr.toJSON(), box: er.toJSON(), bg: cs.backgroundColor, opacity: cs.opacity, rows: Math.round(hr.height), charRect, hintStartMinusCharX: charRect ? +(hr.left - charRect.left).toFixed(1) : null, overlapsLines: hit, highlights: hl, missing: el.dataset.missing, deco: [...el.querySelectorAll("*")].filter((x) => /underline/.test(getComputedStyle(x).textDecorationLine)).map((x) => x.textContent), picks: [...h.querySelectorAll("button")].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")), status: document.querySelector("[data-testid=line-missing-status]")?.outerHTML.slice(0, 300), describedby: el.getAttribute("aria-describedby"), focus: document.activeElement === el, content: el.textContent };
  });
  log("AC-300/304 mid-line", JSON.stringify(g, null, 1));
  // --- Tab to the picks without ending the edit
  await page.keyboard.press("Tab"); await page.waitForTimeout(200);
  const f1 = await page.evaluate(() => ({ tag: document.activeElement.tagName, t: document.activeElement.textContent.slice(0, 20), tid: document.activeElement.dataset.testid, boxOpen: !!document.querySelector("[data-testid=line-input]") }));
  await page.keyboard.press("Tab"); await page.waitForTimeout(200);
  const f2 = await page.evaluate(() => ({ t: document.activeElement.textContent.slice(0, 20), tid: document.activeElement.dataset.testid, boxOpen: !!document.querySelector("[data-testid=line-input]") }));
  log("Tab 1", JSON.stringify(f1), "Tab 2", JSON.stringify(f2));
  const mark = reqs.length;
  await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  const f3 = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); if (!el) return "box closed"; const sp = [...el.querySelectorAll("span")][0]; return { fam: sp.style.fontFamily, picks: [...document.querySelectorAll("[data-testid=line-missing-font]")].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")), focusTid: document.activeElement.dataset.testid, status: document.querySelector("[data-testid=line-missing-status]")?.textContent }; });
  log("after picking 2nd font with Enter", JSON.stringify(f3), "reqs", short(mark));
  await page.screenshot({ path: SHOTS + `ours-missing-pick-second-${tag}.png` });
  // go back to typing
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab"); await page.waitForTimeout(200);
  log("focus after Shift+Tab x2", await page.evaluate(() => document.activeElement.dataset.testid));
  await box.focus().catch(() => {}); await page.keyboard.press("Enter"); await page.waitForTimeout(2000);
  log("box open after Enter", await box.count());
  await page.screenshot({ path: SHOTS + `ours-missing-committed-${tag}.png` });
  // --- remembered for that document font: open "in full." and type ř at the end
  const fin = page.getByRole("option", { name: /^in full/ }); const fb = await fin.boundingBox();
  await tap(fb.x + fb.width - 3, fb.y + fb.height / 2); await box.waitFor(); await page.keyboard.press("End");
  await page.keyboard.type(" Dvořák", { delay: 50 }); await page.waitForTimeout(1500);
  log("AC-301 remembered: picks on another line", JSON.stringify(await page.locator("[data-testid=line-missing-font]").evaluateAll((bs) => bs.map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")))), "hint side", await hint.getAttribute("data-side"));
  await page.screenshot({ path: SHOTS + `ours-missing-remembered-${tag}.png` });
  await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/b-${tag}-output.pdf`);
  // --- AC-302 other alphabets, on the table cell "Design"
  const samples = { greek: "Ωμέγα", cyrillic: "Жизнь", hebrew: "שלום", arabic: "سلام", devanagari: "नमस्ते", thai: "สวัสดี", cjk: "漢字", emoji: "😀" };
  const out302 = {};
  for (const [name, s] of Object.entries(samples)) {
    const d = page.getByRole("option", { name: /^Design/ }); const db = await d.boundingBox();
    await tap(db.x + db.width - 3, db.y + db.height / 2); await box.waitFor(); await page.keyboard.press("End");
    const m = reqs.length;
    await page.keyboard.insertText(" " + s); await page.waitForTimeout(3500);
    out302[name] = { hint: (await hint.innerText().catch(() => "none")).replace(/\n/g, " | "), status: await page.getByTestId("line-missing-status").textContent().catch(() => ""), content: await box.textContent(), fonts: short(m).filter((u) => /fonts\/(lib\/fonts|editor)/.test(u)).map((u) => u.split("/").slice(-2).join("/")).slice(0, 8), face: await box.getAttribute("data-face") };
    await page.screenshot({ path: `${__dirname}/out/b-${tag}-302-${name}.png`, clip: { x: Math.max(0, db.x - 60), y: db.y - 60, width: Math.min(700, (phone ? 390 : 1280) - Math.max(0, db.x - 60)), height: 140 } });
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  }
  log("AC-302", JSON.stringify(out302, null, 1));
  log("errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
