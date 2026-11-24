// F23 mockups: injects the cloud-source components into the real-state bases (base/*.html, made by
// capture-base.cjs), saves each mockup as static HTML here and renders PNGs (deviceScaleFactor 2) to
// /mnt/project-files/designs/cloud-pickers/. Run from the repo root: node docs/specs/assets/f23/mockups/build.cjs
// Provider marks here are simplified placeholders drawn for the mockups; the product uses each
// provider's official mark from its brand kit (see the spec, "Provider marks").
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const PNG = process.env.F23_PNG_DIR || "/mnt/project-files/designs/cloud-pickers";
const PNGREL = path.relative(__dirname, PNG) + "/";
fs.mkdirSync(PNG, { recursive: true });

// ---------------------------------------------------------------------------------------------
// In-page library (evaluated in the page; returns an object of helpers).
const LIB = String.raw`(() => {
  const svg = (d, s = 16, vb = "0 0 256 256", cls = "") => '<svg width="' + s + '" height="' + s + '" viewBox="' + vb + '" fill="currentColor" aria-hidden="true" focusable="false" class="' + cls + '">' + d + '</svg>';
  const P = {
    chev: '<path d="M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z"/>',
    chevR: '<path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z"/>',
    out: '<path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/>',
    plus: '<path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"/>',
    shield: '<path d="M216,56v56c0,96-88,120-88,120S40,208,40,112V56a8,8,0,0,1,8-8H208A8,8,0,0,1,216,56Z" opacity="0.2"/><path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z"/>',
    device: '<path d="M224,56V96H32V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.2"/><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V88H40V56Zm0,144H40V104H216v96Z"/>',
    file: '<path d="M208,88H152V32Z" opacity="0.2"/><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>',
    close: '<path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/>',
    check: '<path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/>',
    info: '<path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"/><path d="M144,176a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176Zm88-48A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128ZM124,96a12,12,0,1,0-12-12A12,12,0,0,0,124,96Z"/>',
    error: '<path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"/><path d="M165.66,101.66,139.31,128l26.35,26.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>',
    ok: '<path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"/><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>',
    retry: '<path d="M244,56v48a12,12,0,0,1-12,12H184a12,12,0,1,1,0-24H201.1l-19-17.38c-.13-.12-.26-.24-.38-.37A76,76,0,1,0,127,204h1a75.53,75.53,0,0,0,52.15-20.72,12,12,0,0,1,16.49,17.45A99.45,99.45,0,0,1,128,228h-1.37A100,100,0,1,1,198.51,57.06L220,76.72V56a12,12,0,0,1,24,0Z"/>',
  };
  const icon = (k, s = 16, cls = "") => svg(P[k], s, "0 0 256 256", cls);
  // Placeholder provider marks (simplified; the product ships the official marks, inline SVG).
  const G = {
    google: (s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1FA463" d="M8 3.2 1.2 15l3.4 5.8L11.4 9z"/><path fill="#FFD04B" d="M8 3.2h7.9L22.8 15h-7.8z"/><path fill="#4687F4" d="M4.6 20.8 8 15h14.8l-3.4 5.8z"/></svg>',
    dropbox: (s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0061FF" d="m7 2.6-5.5 3.5L7 9.6l5-3.5zm10 0-5 3.5 5 3.5 5.5-3.5zM1.5 13.1 7 16.6l5-3.5-5-3.5zm15.5-3.5-5 3.5 5 3.5 5.5-3.5zM7 17.8l5 3.5 5-3.5-5-3.4z"/></svg>',
    onedrive: (s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0364B8" d="M9.6 8.4a5.6 5.6 0 0 1 9.9 2.3 4.3 4.3 0 0 1 1.6 8H8.4z"/><path fill="#0078D4" d="M9.5 8.3A6.3 6.3 0 0 0 3.6 12.6 3.8 3.8 0 0 0 5 19h6.7l6.2-6.4z"/><path fill="#1490DF" d="M5 19h15a3.6 3.6 0 0 0 1.9-6.4L13.5 12z"/><path fill="#28A8EA" d="M19.5 10.7a4.3 4.3 0 0 1 2.4 1.9L12 19H5c-1 0-2-.4-2.6-1.1l7-7.2a5.3 5.3 0 0 1 3.8-1.4c2.4 0 4.8 0 6.3.4z" opacity=".9"/></svg>',
  };
  const NAMES = { google: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
  const ORDER = ["google", "dropbox", "onedrive"];
  const caret = (cls, label, open) =>
    '<button type="button" class="mp-btn ' + cls + ' ip-split__caret" aria-label="' + label + '" title="' + label + '" aria-haspopup="menu" aria-expanded="' + (open ? "true" : "false") + '">' + icon("chev", cls.includes("tool") ? 16 : 20) + "</button>";
  const item = (it) => {
    if (it.group) return '<div class="ip-cloud-group" role="presentation">' + it.group + "</div>";
    if (it.sep) return '<div class="ip-cloud-sep" role="separator"></div>';
    const lead = it.p ? G[it.p](20) : icon(it.icon, 20, "ip-cloud-item__muted");
    const tail = it.p ? '<span class="ip-cloud-item__out">' + icon("out", 14) + "</span>" : it.sub ? '<span class="ip-cloud-item__out">' + icon("chevR", 14) + "</span>" : "";
    return '<button type="button" role="menuitem" tabindex="-1" class="ip-cloud-item"' + (it.focus ? " data-focus" : "") + ">" + lead + "<span>" + (it.label || NAMES[it.p]) + "</span>" + tail + "</button>";
  };
  const foot = '<p class="ip-cloud-foot" id="f23-foot">' + icon("shield", 14) + "Files come straight to this device.</p>";
  const menu = (items, label, sheet) =>
    '<div class="mp-menu ' + (sheet ? "ip-cloud-sheet" : "ip-cloud-menu") + '"><div role="menu" aria-label="' + label + '" aria-describedby="f23-foot">' + items.map(item).join("") + "</div>" + foot + "</div>";
  const providers = (focusFirst) => ORDER.map((p, i) => ({ p, focus: focusFirst && i === 0 }));
  const html = (s) => {
    const t = document.createElement("template");
    t.innerHTML = s.trim();
    return t.content.firstElementChild;
  };
  const place = (el, trigger, align = "start", gap = 6) => {
    document.body.append(el);
    const r = trigger.getBoundingClientRect();
    const w = el.offsetWidth;
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    el.style.top = r.bottom + gap + "px";
    el.style.left = left + "px";
  };
  const dockH = () => {
    const d = document.querySelector("[data-ip-dock]");
    const h = d && getComputedStyle(d).position === "fixed" ? d.offsetHeight : 0;
    document.documentElement.style.setProperty("--f23-dock", h + "px");
    return h;
  };
  const sheet = (items, label) => {
    dockH();
    document.body.append(html('<div class="ip-cloud-scrim" aria-hidden="true"></div>'));
    document.body.append(html(menu(items, label, true)));
  };
  const row = (last) => {
    const rest = ORDER.filter((p) => p !== last);
    const chip = last ? '<button type="button" class="ip-cloud-chip" title="Last used" aria-label="Choose from ' + NAMES[last] + ' (last used)">' + G[last](20) + NAMES[last] + "</button>" : "";
    return html('<div class="ip-cloud-row" role="group" aria-label="Cloud storage">' + chip + rest.map((p) => '<button type="button" class="ip-cloud-glyph" aria-label="Choose from ' + NAMES[p] + '" title="' + NAMES[p] + '">' + G[p](22) + "</button>").join("") + "</div>");
  };
  // Empty state: upload button -> split; cloud row under it.
  const emptySplit = (open, last, multi = true) => {
    const btn = document.querySelector("[data-testid=drop-card] .mp-btn");
    const wrap = btn.parentElement;
    wrap.classList.add("ip-split");
    btn.insertAdjacentHTML("afterend", caret("mp-btn--lg", "Choose from Google Drive, Dropbox or OneDrive", open));
    wrap.after(row(last));
    return wrap.querySelector(".ip-split__caret");
  };
  const alertBox = (tone, body, actions = "", dismiss = true, inline = false) => {
    const ic = tone === "danger" ? icon("error", 22, "shrink-0") : tone === "success" ? icon("ok", 22, "shrink-0") : tone === "wait" ? '<span class="ip-cloud-wait" aria-hidden="true"></span>' : icon("info", 22, "shrink-0");
    const cls = tone === "danger" ? "mp-alert mp-alert--danger" : tone === "success" ? "mp-alert" : "mp-alert mp-alert--info";
    return '<div role="' + (tone === "danger" ? "alert" : "status") + '" class="text-sm ' + cls + '">' + ic + '<div class="min-w-0 flex-1 break-words">' + body + (actions && !inline ? '<div class="ip-alert-actions">' + actions + "</div>" : "") + "</div>" + (actions && inline ? '<div class="ip-alert-inline">' + actions + "</div>" : "") + (dismiss ? '<button type="button" aria-label="Dismiss" class="mp-alert__close">' + icon("close", 18) + "</button>" : "") + "</div>";
  };
  const stack = (...alerts) => {
    document.body.append(html('<div class="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4"><div class="pointer-events-auto flex max-h-[60dvh] w-[min(520px,calc(100vw-32px))] flex-col items-stretch gap-2 overflow-y-auto">' + alerts.join("") + "</div></div>"));
  };
  const smallBtn = (label, variant = "mp-btn--outline") => '<button type="button" class="mp-btn ' + variant + ' mp-btn--sm">' + label + "</button>";
  const byText = (root, text) => Array.from(root.querySelectorAll("*")).find((e) => e.children.length === 0 && e.textContent.trim() === text);
  return { svg, icon, G, NAMES, ORDER, caret, menu, item, providers, html, place, sheet, row, emptySplit, alertBox, stack, smallBtn, byText, dockH };
})()`;

// ---------------------------------------------------------------------------------------------
// Transforms: each runs in the page with L = the library above.
const T = {};

T.emptyMenuDesk = `
  const c = L.emptySplit(true, null);
  const m = L.html(L.menu(L.providers(true), "Choose from cloud storage"));
  L.place(m, c, "end");
`;
T.emptySheetPhone = `
  L.emptySplit(true, null);
  L.sheet(L.providers(true), "Choose from cloud storage");
`;
T.emptyRestChip = `L.emptySplit(false, "dropbox");`;

// Working toolbar: "Add files" becomes a split (tool look).
const toolbarSplit = `
  const add = Array.from(document.querySelectorAll(".mp-btn--tool")).find((b) => b.textContent.trim() === "Add files");
  add.classList.remove("shadow-glow");
  const wrap = add.parentElement;
  wrap.classList.add("ip-split", "ip-split--tool");
  add.insertAdjacentHTML("afterend", L.caret("mp-btn--tool", "Add files from Google Drive, Dropbox or OneDrive", OPEN));
`;
T.addFilesMenuDesk = toolbarSplit.replace("OPEN", "true") + `
  const c = document.querySelector(".ip-split--tool .ip-split__caret");
  L.place(L.html(L.menu(L.providers(true), "Add files from cloud storage")), c, "end");
`;
T.addPagesMenuDesk = toolbarSplit.replace("OPEN", "false") + `
  const t = document.querySelector("[data-testid=add-pages-menu]");
  t.setAttribute("aria-expanded", "true");
  const items = [{ group: "From a file" }, { icon: "device", label: "This device" }, { p: "google", focus: true }, { p: "dropbox" }, { p: "onedrive" }, { sep: true }, { icon: "file", label: "Blank page" }];
  L.place(L.html(L.menu(items, "Add pages")), t, "end");
`;
T.phoneAddSheet = `
  document.querySelector("[data-testid=add-menu]").setAttribute("aria-expanded", "true");
  const items = [{ group: "Files" }, { icon: "device", label: "This device", focus: true }, { p: "google" }, { p: "dropbox" }, { p: "onedrive" }, { group: "Pages" }, { icon: "file", label: "Pages from a file", sub: true }, { icon: "file", label: "Blank page" }];
  L.sheet(items, "Add");
`;
T.phoneAddSheetPages = `
  document.querySelector("[data-testid=add-menu]").setAttribute("aria-expanded", "true");
  const items = [{ icon: "chevL", label: "Pages from" }];
  L.sheet([{ group: "Pages from" }, { icon: "device", label: "This device", focus: true }, { p: "google" }, { p: "dropbox" }, { p: "onedrive" }], "Pages from a file");
  const s = document.querySelector(".ip-cloud-sheet [role=menu]");
  s.insertAdjacentHTML("afterbegin", '<button type="button" role="menuitem" tabindex="-1" class="ip-cloud-item">' + L.svg('<path d="M168.49,199.51a12,12,0,0,1-17,17l-80-80a12,12,0,0,1,0-17l80-80a12,12,0,0,1,17,17L97,128Z"/>', 20, "0 0 256 256", "ip-cloud-item__muted") + '<span>Back</span></button>');
`;
T.waitingDesk = `
  L.emptySplit(false, null);
  L.stack(L.alertBox("wait", '<p class="font-semibold">Waiting for Google Drive…</p>', L.smallBtn("Cancel"), false, true));
  const pop = L.html('<div class="mock-popup"><div class="mock-popup__bar"><i></i><i></i><i></i><span class="mock-popup__url">🔒 berrypdf.com/cloud/google</span></div><iframe src="../cloud-google-before.html" width="480" height="640" title="BerryPDF cloud window"></iframe></div>');
  document.body.append(pop);
  pop.style.left = (innerWidth - 480 - 70) + "px";
  pop.style.top = "150px";
`;
T.blocked = `
  L.emptySplit(false, null);
  L.stack(L.alertBox("info", '<p class="font-semibold">Your browser blocked the Google Drive window.</p><p class="font-normal">Allow pop-ups for this site.</p>', L.smallBtn("Try again"), true, true));
`;
// Downloading on the tool page: echo arrives from Google Drive (42%), report.pdf failed, bravo done.
const dlCard = `
  function dlCard(card, name, meta, pct, failed) {
    const box = card.querySelector("[data-card-box]");
    const oldName = card.querySelector("[data-card-box] [data-main]").getAttribute("aria-label").split(",")[0];
    box.querySelectorAll("span.relative.block, [data-no-drag].absolute.bottom-1\\\\.5, [data-main]").forEach((e) => e.remove());
    const badge = box.querySelector("[data-testid=source-badge]");
    const x = box.querySelector("button[aria-label^=Remove]");
    x.setAttribute("aria-label", failed ? "Remove " + name : "Stop downloading " + name);
    const tip = x.querySelector(".ip-tooltip"); if (tip) tip.textContent = x.getAttribute("aria-label");
    const inner = failed
      ? '<div class="ip-dl ip-dl--failed"><span class="ip-dl__page text-danger">' + L.icon("error", 30) + '</span><button type="button" class="mp-btn mp-btn--line mp-btn--sm">' + L.icon("retry", 14) + 'Retry</button></div>'
      : '<div class="ip-dl" aria-busy="true"><span class="ip-dl__page">' + L.G.google(30) + '</span><div class="ip-dl__bar"><div role="progressbar" aria-label="Downloading ' + name + '" aria-valuenow="' + pct + '" class="mp-jam"><i style="width:' + pct + '%"></i></div>' + pct + '%</div></div>';
    box.insertAdjacentHTML("afterbegin", inner);
    const nm = L.byText(card, oldName); if (nm) nm.textContent = name;
    const pg = Array.from(card.querySelectorAll("*")).find((e) => e.children.length === 0 && /^\\d+ pages?$/.test(e.textContent.trim()));
    if (pg) { pg.textContent = meta; if (failed) { pg.classList.add("text-danger"); pg.style.fontWeight = 600; } }
    card.querySelectorAll("button[aria-label^=Move]").forEach((b) => (b.style.visibility = "hidden"));
  }
`;
T.downloadingDesk = dlCard + `
  const cards = document.querySelectorAll("[data-testid=file-card]");
  dlCard(cards[2], "plan.pdf", "1.4 of 3.3 MB", 42, false);
  const clone = cards[2].cloneNode(true);
  cards[2].after(clone);
  clone.querySelector("[data-testid=source-badge]").textContent = "D";
  clone.querySelector(".ip-dl").outerHTML = '<div class="ip-dl ip-dl--failed"><span class="ip-dl__page text-danger">' + L.icon("error", 30) + '</span><button type="button" class="mp-btn mp-btn--line mp-btn--sm">' + L.icon("retry", 14) + 'Retry</button></div>';
  L.byText(clone, "plan.pdf").textContent = "report.pdf";
  const m = L.byText(clone, "1.4 of 3.3 MB"); m.textContent = "Download stopped"; m.classList.add("text-danger"); m.style.fontWeight = 600;
  clone.querySelector("button[aria-label^=Stop]").setAttribute("aria-label", "Remove report.pdf");
  const st = document.querySelector("[data-testid=dock-status]"); if (st) st.textContent = "Getting 1 file from Google Drive…";
  const pr = document.querySelector("[data-testid=primary-action]"); if (pr) pr.disabled = true;
  const add = Array.from(document.querySelectorAll(".mp-btn--tool")).find((b) => b.textContent.trim() === "Add files");
  if (add) { add.classList.remove("shadow-glow"); const w = add.parentElement; w.classList.add("ip-split", "ip-split--tool"); add.insertAdjacentHTML("afterend", L.caret("mp-btn--tool", "Add files from Google Drive, Dropbox or OneDrive", false)); }
  const live = document.querySelector("[aria-live=polite]"); if (live) live.textContent = "Downloading plan.pdf from Google Drive, 42%";
`;
T.downloadingPhone = dlCard + `
  const cards = document.querySelectorAll("[data-testid=file-card]");
  dlCard(cards[1], "plan.pdf", "1.4 of 3.3 MB", 42, false);
  dlCard(cards[2], "report.pdf", "Download stopped", 0, true);
  const st = document.querySelector("[data-testid=primary-action]"); if (st) st.disabled = true;
`;
T.errorsDesk = toolbarSplit.replace("OPEN", "false") + `
  L.stack(
    L.alertBox("danger", '<p class="font-semibold">Couldn\\'t reach Dropbox.</p><p class="font-normal">Files on this device still work.</p>', L.smallBtn("Try again"), true, true),
    L.alertBox("info", '<p class="font-semibold">OneDrive access wasn\\'t given.</p><p class="font-normal">We can only open files you allow.</p>', L.smallBtn("Try again"), true, true),
    L.alertBox("danger", '<p class="font-semibold">2 files were skipped</p><ul class="mt-1 space-y-1 font-normal"><li>scan-2019.pdf is larger than 100 MB, the limit for this tool.</li><li>budget.pdf can\\'t be opened from Google Drive. Check that you can open it there.</li></ul>')
  );
`;
T.offlinePhone = `
  L.emptySplit(false, "google");
  L.stack(L.alertBox("info", '<p class="font-semibold">You\\'re offline.</p><p class="font-normal">Google Drive needs a connection. Files on this device still work.</p>'));
`;
// Result: Save to Drive split beside Download.
const saveSplit = (state) => `
  const dl = document.querySelector("[data-testid=result] a[download]");
  const row = dl.parentElement;
  const done = ${state === "saved"};
  const busy = ${state === "busy"};
  const label = done ? L.icon("check", 16) + "Saved" : busy ? '<span class="ip-cloud-wait" aria-hidden="true" style="width:14px;height:14px;margin:0"></span>Saving… 64%' : L.G.google(18) + "Save to Drive";
  row.insertAdjacentHTML("beforeend", '<span class="ip-save ip-split self-center max-sm:w-full"><button type="button" class="mp-btn mp-btn--line max-sm:flex-1"' + (busy ? ' aria-busy="true"' : "") + ">" + label + "</button>" + L.caret("mp-btn--line", "Save to another cloud", ${state === "menu"}) + "</span>");
`;
T.resultSave = saveSplit("rest");
T.resultSaveMenu = saveSplit("menu") + `
  const c = document.querySelector(".ip-save .ip-split__caret");
  const m = L.html('<div class="mp-menu ip-cloud-menu"><div role="menu" aria-label="Save to">' + [{ p: "google", focus: true, label: "Google Drive" }, { p: "onedrive" }].map(L.item).join("") + '</div><p class="ip-cloud-foot">' + L.icon("shield", 14) + "Goes from this device to your cloud.</p></div>");
  L.place(m, c, "end");
`;
T.resultSaved = saveSplit("saved") + `
  L.stack(L.alertBox("success", '<p class="font-semibold">Saved to Google Drive as alpha.pdf.</p>', '<a class="mp-btn mp-btn--outline mp-btn--sm" href="#">Open in Drive</a>', true, true));
`;
T.resultBusy = saveSplit("busy");

// ---------------------------------------------------------------------------------------------
// Standalone /cloud/<provider> window mockups.
const head = (title) => `<!doctype html><html lang="en" class="__variable_ea1ba5"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="css/app.css"><link rel="stylesheet" href="css/f23.css"></head>`;
const mark = `<svg width="26" height="26" viewBox="-12 -28 120 126" class="mp-mark" aria-hidden="true" focusable="false"><use href="#mp-berry-skin" width="96" height="96"></use></svg>`;
function sprite() {
  const base = fs.readFileSync(path.join(DIR, "base/rotate-empty-desk.html"), "utf8");
  const i = base.indexOf('<svg width="0" height="0" class="mp-sprite"');
  let depth = 0;
  const re = /<svg\b|<\/svg>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(base))) {
    depth += m[0] === "</svg>" ? -1 : 1;
    if (!depth) return base.slice(i, m.index + 6);
  }
}
const SPRITE = sprite();
const shield = `<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M216,56v56c0,96-88,120-88,120S40,208,40,112V56a8,8,0,0,1,8-8H208A8,8,0,0,1,216,56Z" opacity="0.2"/><path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z"/></svg>`;
const GL = {
  google: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1FA463" d="M8 3.2 1.2 15l3.4 5.8L11.4 9z"/><path fill="#FFD04B" d="M8 3.2h7.9L22.8 15h-7.8z"/><path fill="#4687F4" d="M4.6 20.8 8 15h14.8l-3.4 5.8z"/></svg>`,
  dropbox: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0061FF" d="m7 2.6-5.5 3.5L7 9.6l5-3.5zm10 0-5 3.5 5 3.5 5.5-3.5zM1.5 13.1 7 16.6l5-3.5-5-3.5zm15.5-3.5-5 3.5 5 3.5 5.5-3.5zM7 17.8l5 3.5 5-3.5-5-3.4z"/></svg>`,
  onedrive: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0364B8" d="M9.6 8.4a5.6 5.6 0 0 1 9.9 2.3 4.3 4.3 0 0 1 1.6 8H8.4z"/><path fill="#0078D4" d="M9.5 8.3A6.3 6.3 0 0 0 3.6 12.6 3.8 3.8 0 0 0 5 19h6.7l6.2-6.4z"/><path fill="#1490DF" d="M5 19h15a3.6 3.6 0 0 0 1.9-6.4L13.5 12z"/><path fill="#28A8EA" d="M19.5 10.7a4.3 4.3 0 0 1 2.4 1.9L12 19H5c-1 0-2-.4-2.6-1.1l7-7.2a5.3 5.3 0 0 1 3.8-1.4c2.4 0 4.8 0 6.3.4z" opacity=".9"/></svg>`,
};
const NAME = { google: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
const closeX = `<button type="button" class="mp-iconbtn mp-iconbtn--plain ip-cw__close size-11" aria-label="Cancel and close"><svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/></svg></button>`;
const top = (p) => `<header class="ip-cw__top">${mark}<span>BerryPDF</span><span class="text-muted" style="font-weight:400">· ${NAME[p]}</span>${closeX}</header>`;
const privacy = (p) => `<p class="ip-cw__privacy">${shield}<span>Files go from ${NAME[p]} straight to this browser. We never see them or your sign‑in.</span></p>`;
const jam = (pct, label) => `<div role="progressbar" aria-label="${label}" aria-valuenow="${pct}" class="mp-jam"><i style="width:${pct}%"></i></div>`;
const WIN = {
  "cloud-google-before": () => page("google", `
    <div class="ip-cw__card">
      ${GL.google(56)}
      <h1 class="ip-cw__title">Google Drive</h1>
      <button type="button" class="mp-btn mp-btn--lg w-full" autofocus>Open Google Drive</button>
      ${privacy("google")}
    </div>`),
  "cloud-dropbox-before": () => page("dropbox", `
    <div class="ip-cw__card">
      ${GL.dropbox(56)}
      <h1 class="ip-cw__title">Dropbox</h1>
      <button type="button" class="mp-btn mp-btn--lg w-full">Open Dropbox</button>
      ${privacy("dropbox")}
    </div>`),
  "cloud-google-signin": () => page("google", `
    <div class="ip-cw__card">
      ${GL.google(56)}
      <h1 class="ip-cw__title">Google Drive</h1>
      <button type="button" class="mp-btn mp-btn--lg w-full" aria-busy="true" disabled><span class="ip-cloud-wait" aria-hidden="true"></span>Signing in…</button>
      <p class="text-sm text-muted">Finish in the Google window.</p>
      ${privacy("google")}
    </div>`),
  "cloud-google-picker": () => `${head("Google Drive · BerryPDF")}<body>${SPRITE}<div class="ip-cw">${top("google")}<div class="ip-cw__picker"><div style="text-align:center;max-width:260px">${GL.google(40)}<p style="margin-top:12px">Google's own file picker fills this area<br>(provider UI, not designed by us)</p></div></div></div></body></html>`,
  "cloud-onedrive-connecting": () => page("onedrive", `
    <div class="ip-cw__card">
      ${GL.onedrive(56)}
      <h1 class="ip-cw__title">OneDrive</h1>
      <p class="flex items-center gap-2 text-ink"><span class="ip-cloud-wait text-brand-strong" aria-hidden="true"></span>Connecting…</p>
      ${privacy("onedrive")}
    </div>`),
  "cloud-google-downloading": () => page("google", `
    <div class="ip-cw__card" aria-busy="true">
      <h1 class="ip-cw__title">Getting 3 files</h1>
      <div class="ip-cw__rows">
        <div class="ip-cw__row"><span class="ip-cw__name">alpha.pdf</span><span class="ip-cw__meta">Done</span>${jam(100, "alpha.pdf")}</div>
        <div class="ip-cw__row"><span class="ip-cw__name">plan.pdf</span><span class="ip-cw__meta">1.4 of 3.3 MB</span>${jam(42, "plan.pdf")}</div>
        <div class="ip-cw__row"><span class="ip-cw__name">scan-2019.pdf</span><span class="ip-cw__meta ip-cw__meta--bad">Over 100 MB, skipped</span></div>
      </div>
      <p class="text-sm text-muted">Keep this window open until it closes by itself.</p>
      <button type="button" class="mp-btn mp-btn--outline mp-btn--sm">Cancel</button>
    </div>`),
  "cloud-google-done": () => page("google", `
    <div class="ip-cw__card">
      <span class="mp-tick-in ip-cw__tick"><svg width="30" height="30" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg></span>
      <h1 class="ip-cw__title">Added to Merge PDF</h1>
      <p class="text-sm text-muted">This window closes by itself.</p>
    </div>`),
  "cloud-google-denied": () => page("google", `
    <div class="ip-cw__card">
      ${GL.google(56)}
      <h1 class="ip-cw__title">Access wasn't given</h1>
      <p class="text-sm text-muted" style="max-width:320px">BerryPDF can only open the files you pick and allow.</p>
      <button type="button" class="mp-btn mp-btn--lg w-full">Try again</button>
    </div>`),
  "cloud-orphan": () => page("google", `
    <div class="ip-cw__card">
      ${GL.google(56)}
      <h1 class="ip-cw__title">This window lost its tool</h1>
      <p class="text-sm text-muted" style="max-width:320px">The BerryPDF tab that opened it was closed or reloaded. Close this window and start again from the tool.</p>
      <button type="button" class="mp-btn mp-btn--outline">Close window</button>
    </div>`),
  "cloud-save-google": () => page("google", `
    <div class="ip-cw__card" aria-busy="true">
      ${GL.google(56)}
      <h1 class="ip-cw__title">Saving to Google Drive</h1>
      <div class="ip-cw__rows"><div class="ip-cw__row"><span class="ip-cw__name">alpha.pdf</span><span class="ip-cw__meta">64%</span>${jam(64, "Saving alpha.pdf")}</div></div>
      <p class="ip-cw__privacy">${shield}<span>Goes from this browser straight to your Drive. We never see it.</span></p>
    </div>`),
};
function page(p, card) {
  return `${head(NAME[p] + " · BerryPDF")}<body>${SPRITE}<div class="ip-cw">${top(p)}<main class="ip-cw__main">${card}</main></div></body></html>`;
}

// ---------------------------------------------------------------------------------------------
const JOBS = [
  ["01-first-screen-source-menu", "merge-empty", T.emptyMenuDesk, [[1280, 720], [1366, 657]]],
  ["02-first-screen-source-sheet-phone", "merge-empty", T.emptySheetPhone, [[390, 844], [390, 664]]],
  ["03-first-screen-last-used-chip", "rotate-empty", T.emptyRestChip, [[1366, 657], [390, 664]]],
  ["04-add-files-menu", "merge-ready", T.addFilesMenuDesk, [[1280, 720], [1366, 657]]],
  ["05-merge-add-pages-menu", "merge-ready", T.addPagesMenuDesk, [[1280, 720], [1366, 657]]],
  ["06-phone-add-sheet", "merge-ready", T.phoneAddSheet, [[390, 664], [390, 844]]],
  ["07-phone-add-sheet-pages-from", "merge-ready", T.phoneAddSheetPages, [[390, 664]]],
  ["08-waiting-with-google-popup", "merge-empty", T.waitingDesk, [[1440, 900], [1366, 657]]],
  ["13-popup-blocked", "rotate-empty", T.blocked, [[1366, 657], [390, 664]]],
  ["14-downloading-on-tool-page", "merge-ready", T.downloadingDesk, [[1366, 657], [1280, 720]]],
  ["15-downloading-on-tool-page-phone", "merge-ready", T.downloadingPhone, [[390, 664]]],
  ["16-provider-errors", "merge-ready", T.errorsDesk, [[1366, 657]]],
  ["17-offline-phone", "rotate-empty", T.offlinePhone, [[390, 664]]],
  ["18-result-save-to-drive", "rotate-result", T.resultSave, [[1366, 657], [390, 664]]],
  ["19-result-save-menu", "rotate-result", T.resultSaveMenu, [[1366, 657]]],
  ["20-result-saving", "rotate-result", T.resultBusy, [[1366, 657]]],
  ["21-result-saved", "rotate-result", T.resultSaved, [[1366, 657], [390, 664]]],
];
const WINJOBS = [
  ["09-cloud-window-google-before", "cloud-google-before", [[480, 640], [390, 664]]],
  ["10-cloud-window-google-downloading", "cloud-google-downloading", [[480, 640], [390, 664]]],
  ["11-cloud-window-dropbox-before", "cloud-dropbox-before", [[480, 640]]],
];

const f23Wait = (out) => (out.startsWith("08") ? 900 : 0);
(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch();
  for (const [name, html] of Object.entries(WIN)) fs.writeFileSync(path.join(DIR, `${name}.html`), html());
  for (const [out, base, tf, vps] of JOBS) {
    if (only && !out.startsWith(only)) continue;
    let saved = false;
    for (const [w, h] of vps) {
      const phone = w < 640;
      const src = path.join(DIR, "base", `${base}-${phone ? "phone" : "desk"}.html`);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: "reduce", isMobile: phone, hasTouch: phone });
      const pg = await ctx.newPage();
      await pg.goto("file://" + src);
      await pg.addStyleTag({ path: path.join(DIR, "css/f23.css") });
      await pg.evaluate(({ lib, body }) => {
        const L = eval(lib);
        new Function("L", body)(L);
      }, { lib: LIB, body: tf });
      await pg.waitForTimeout(300);
      for (const f of pg.frames()) await f.waitForLoadState("load");
      await pg.waitForTimeout(f23Wait(out));
      if (!saved) {
        let html = await pg.evaluate(() => "<!doctype html>\n" + document.documentElement.outerHTML);
        html = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/\.\.\/css\//g, "css/").replace(/"\.\.\/cloud-/g, "\"cloud-").replace("</head>", '<link rel="stylesheet" href="css/f23.css">\n</head>');
        fs.writeFileSync(path.join(DIR, `${out}.html`), html);
        saved = true;
      }
      await pg.screenshot({ path: path.join(PNG, `${out}-${w}x${h}.png`) });
      console.log("png", out, w, h);
      await ctx.close();
    }
  }
  for (const [out, file, vps] of WINJOBS) {
    if (only && !out.startsWith(only)) continue;
    for (const [w, h] of vps) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      const pg = await ctx.newPage();
      await pg.goto("file://" + path.join(DIR, `${file}.html`));
      await pg.waitForTimeout(200);
      await pg.screenshot({ path: path.join(PNG, `${out}-${w}x${h}.png`) });
      console.log("png", out, w, h);
      await ctx.close();
    }
  }
  // 12: the window's other states side by side (OneDrive connecting, picker, done, denied, lost tool, saving).
  if (!only || "12".startsWith(only.slice(0, 2))) {
    const states = ["cloud-onedrive-connecting", "cloud-google-signin", "cloud-google-picker", "cloud-google-done", "cloud-google-denied", "cloud-orphan", "cloud-save-google"];
    const labels = ["OneDrive: connecting (no tap)", "Google: signing in", "Provider picker", "Done (closes itself)", "Access denied", "Tool tab gone", "Save to Drive"];
    const sheet = `${head("F23 cloud window states")}<body style="padding:24px;background:#f4eef0"><div style="display:grid;grid-template-columns:repeat(4,480px);gap:24px">${states.map((s, i) => `<figure style="margin:0"><figcaption style="font:600 15px/20px var(--font-display);margin-bottom:8px;color:var(--ink)">${labels[i]}</figcaption><iframe src="${s}.html" width="480" height="640" style="border:0;border-radius:10px;box-shadow:0 6px 20px rgb(0 0 0 / .15);background:#fff"></iframe></figure>`).join("")}</div></body></html>`;
    fs.writeFileSync(path.join(DIR, "12-cloud-window-states.html"), sheet);
    const ctx = await browser.newContext({ viewport: { width: 4 * 480 + 3 * 24 + 48, height: 2 * 668 + 24 + 48 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const pg = await ctx.newPage();
    await pg.goto("file://" + path.join(DIR, "12-cloud-window-states.html"));
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: path.join(PNG, "12-cloud-window-states.png") });
    console.log("png 12");
    await ctx.close();
  }
  // 22: side by side, the reference's upload menu vs ours (internal comparison only; the reference
  // capture stays in docs/specs/assets/f23/ and never ships).
  if (!only || only.startsWith("22")) {
    const ours = path.join(PNG, "01-first-screen-source-menu-1366x657.png");
    const crop = (src, x, y, w, h, scale, sw, sh) =>
      `<div style="width:${w * scale}px;height:${h * scale}px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px #e6d3d6;background:url('${src}') -${x * scale}px -${y * scale}px / ${sw * scale}px ${sh * scale}px no-repeat"></div>`;
    const col = (title, img, notes) => `<section style="flex:1"><h2 style="font:600 20px/26px var(--font-display);color:var(--ink-black);margin:0 0 12px">${title}</h2>${img}<ul style="margin:14px 0 0;padding-left:18px;font-size:15px;line-height:22px;color:var(--ink)">${notes.map((n) => `<li>${n}</li>`).join("")}</ul></section>`;
    const sheet = `${head("F23 menu: reference vs BerryPDF")}<body style="padding:28px;background:#fff"><div style="display:flex;gap:36px;align-items:flex-start">
      ${col("Reference (Sejda), 1280 px", crop("../02-upload-menu-1280.png", 420, 300, 440, 260, 1.4, 1280, 900), ["Caret named only “Toggle Dropdown”", "Google Drive and OneDrive icons missing on first open", "A consent dialog follows every first pick", "Rows 37 px tall on phones", "No hint that a window opens or where files go"])}
      ${col("BerryPDF, 1366 × 657", crop("01-first-screen-source-menu-1366x657.png".replace(/^/, PNGREL), 330, 270, 330, 245, 1.867, 1366, 657), ["Caret named “Choose from Google Drive, Dropbox or OneDrive”", "Marks are inline SVG: drawn on first paint", "One click from menu to provider (no dialog)", "↗ shows a window opens; one honest privacy line", "48 px rows in the phone sheet; one-tap marks under the button"])}
    </div></body></html>`;
    fs.writeFileSync(path.join(DIR, "22-menu-reference-vs-berrypdf.html"), sheet);
    const ctx = await browser.newContext({ viewport: { width: 1340, height: 560 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.goto("file://" + path.join(DIR, "22-menu-reference-vs-berrypdf.html"));
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: path.join(PNG, "22-menu-reference-vs-berrypdf.png"), fullPage: true });
    console.log("png 22");
    await ctx.close();
  }
  await browser.close();
})();
