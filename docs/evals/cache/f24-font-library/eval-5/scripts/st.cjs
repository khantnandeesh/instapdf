// shared state dump
module.exports.install = async (page) => page.evaluate(() => {
  window.__ann = [];
  const mo = new MutationObserver(() => { const n = document.querySelector("[data-testid=editor-notice]"); const t = n ? n.innerText.replace(/\n/g, " | ") : ""; const last = window.__ann[window.__ann.length - 1]; if (!last || last[1] !== t) window.__ann.push([Math.round(performance.now()), t]); });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
});
module.exports.state = async (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(`[data-testid=${s}]`);
  const el = q("line-input"), h = q("line-missing"), n = q("editor-notice");
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05; };
  const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const hl = []; try { for (const [k, v] of CSS.highlights) { const rs = []; for (const rg of v) rs.push(rg.toString()); hl.push(k + ":" + rs.join("")); } } catch {}
  const a = document.activeElement;
  const s = getSelection();
  return {
    box: el ? { text: el.textContent, face: el.dataset.face, missing: el.dataset.missing, r: R(el), focused: a === el, selType: s.type, caretIn: el.contains(s.anchorNode), under: [...el.querySelectorAll("*")].filter((x) => /underline/.test(getComputedStyle(x).textDecorationLine)).map((x) => x.textContent).join(""), attrs: [...el.attributes].filter((x) => /^(data-|aria-)/.test(x.name)).map((x) => x.name + "=" + x.value.slice(0, 40)).join(" ") } : null,
    hint: h ? { vis: vis(h), side: h.dataset.side, text: h.innerText.replace(/\n/g, " | "), r: R(h), btns: [...h.querySelectorAll("button")].map((b) => b.textContent.trim() + (b.getAttribute("aria-pressed") === "true" ? "*" : "")) } : null,
    status: q("line-missing-status")?.textContent,
    notice: n ? { text: n.innerText.replace(/\n/g, " | "), r: R(n), btns: [...n.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || b.textContent).trim()) , role: n.getAttribute("role") || n.querySelector("[role]")?.getAttribute("role") } : null,
    hl, focus: a ? (a.dataset.testid || a.tagName) + ":" + (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30) : null,
    lines: [...document.querySelectorAll("[data-testid=line]")].map((l) => l.dataset.text.slice(-28)),
    undo: !document.querySelector('button[aria-label="Undo"]')?.disabled, ann: window.__ann, live: q("live")?.textContent.slice(0, 200),
  };
});
