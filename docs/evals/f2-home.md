# Evaluation: F2 Home page, tool catalogue and header menu

- **Verdict: PASS** (with one P1 failure: AC-56, see gap G-1. It must be fixed, but it does not block the gate)
- Evaluated: 2026-11-23, 17:00–17:20 UTC, by parity-evaluator
- Spec: `docs/specs/f2-home.md` (63 ACs: 19 P0, 29 P1, 15 P2. AC-34 is dropped by design)
- Reference: https://www.sejda.com/ (home page and its "All tools" menu)
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/
- Harness: Playwright (headless Chrome for Testing 153), @axe-core/playwright (axe-core 4.14.1), Lighthouse CLI (mobile preset, simulated throttling). No PDF fixtures were needed: this feature processes no files.

## Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | 19 / 19 | yes |
| All ACs | at least 90% | 61 / 62 evaluated (98.4%). AC-34 was dropped by design (ux), as the spec instructs | yes |
| Lighthouse performance (mobile) | at least 90 | 97 (median of 3 runs: 97 / 98 / 97) | yes |
| axe critical issues | none | 0 critical. **1 serious rule** (`label-content-name-mismatch`) in 9 of 12 states | yes (critical); see AC-56 |

By priority: **P0 19/19**, **P1 28/29** (AC-56 fails), **P2 14/14** (+ AC-34 dropped by design).

## Sejda runs (budget: 3 real tasks per hour)

**0 processing tasks were run.** The home page takes no files. I loaded the reference home page once at 1366×900 and once at 375×812, opened its "All Tools" menu and pressed Escape. These were plain page loads, with a few seconds between them. Cached in `docs/evals/cache/f2-home/`: `sejda-observation.json` and `sejda-home-*.png` / `sejda-menu-*.png`. They are for reference only and must never ship.

What I observed on the reference (2026-11-23), alongside the spec's own observations:
- `GET /` returns 200. The page has **2** `h1`s ("We help with your PDF tasks" and "How-to PDF Guides"), a title and a meta description.
- The menu's `type=search` input exists but is not visible (`display:none`), as the spec says.
- No element has `aria-expanded`. The menu does not move focus into itself.
- There is no horizontal scroll at 375 px.
- The page sets first-party cookies (`document.cookie` is 107 chars on first load). All requests went to `www.sejda.com`.

## AC results

"Ref" = Sejda. "Spec obs." = reference behavior recorded in the spec. "n/a (ours)" = an InstaPDF decision or improvement that has no reference counterpart.

| AC | Pri | Sejda result | InstaPDF result | Pass |
|---|---|---|---|---|
| AC-1 | P0 | 200, 2 `h1`s, title, description | 200; 1 `h1`; title "InstaPDF · Fast, private PDF tools"; description present | PASS |
| AC-2 | P0 | Hero button above the fold (spec obs.) | "Find a tool" bottom edge at 300 px of 900 (1366) and 308 px of 812 (375) | PASS |
| AC-3 | P0 | Goes to the editor | Featured tool is planned. Click and Enter both give hash `#tools`, the catalogue heading in view (top 72 px) and focus on `#catalogue-search` | PASS |
| AC-4 | P1 | Fixed 700 px scroll (spec obs.) | "See all 45 tools"; the heading scrolls into view | PASS |
| AC-5 | P0 | n/a (tools are duplicated across groups) | 45 category links, 45 unique, set equal to the 45 spec slugs | PASS |
| AC-6 | P0 | 8 different groups | Organize pages, Edit & sign, Optimize, Security, Convert from PDF, Convert to PDF, Scans, Automate. Grouping is identical to the menu (both built from the registry). Counts 12/16/3/2/6/3/2/1 match the design wireframe | PASS |
| AC-7 | P0 | icon + name + description card | 45 cards. Each `li` holds exactly one `<a>` (the card), which contains a visible name and summary | PASS |
| AC-8 | P0 | n/a | Card goes to `/rotate-pdf` and has no "Coming soon"; the page has `input[type=file]` with `accept=".pdf,application/pdf"` | PASS |
| AC-9 | P0 | n/a | 44 visible "Coming soon" badges; 44 links have "Coming soon" in their accessible name; Rotate has none | PASS |
| AC-10 | P0 | – | Crawled 53 internal URLs found on `/` (menu open), `/merge-pdf`, `/about`, `/rotate-pdf` and 404: all 200. All `#` anchors exist. 0 external links | PASS |
| AC-11 | P1 | Popular block of 9 (spec obs.) | Above the categories: Rotate [Beta], then Edit PDF, Compress, Delete pages, Merge, Split, Crop, Fill & sign, PDF to Word, Extract pages [Coming soon] | PASS |
| AC-12 | P1 | static links work | JS off: 45 category links; the `All tools` noscript link to `/#tools` is visible and the button is hidden | PASS |
| AC-13 | P1 | n/a | "Beta" on the Rotate card and on its menu entry (and in its accessible name) | PASS |
| AC-14 | P2 | n/a | Jump link `#cat-security`: hash set, heading in view (8 chips) | PASS |
| AC-15 | P0 | search hidden (`display:none`) | `type=search`, label "Search tools", no form. `split` gives exactly the 5 Split cards; Merge, Rotate and Compress are hidden | PASS |
| AC-16 | P1 | case-insensitive (spec obs.) | `  ROTATE ` gives Rotate | PASS |
| AC-17 | P1 | name/description only | encrypt→Protect; jpg→Image to PDF + PDF to image; combine→Merge + Combine & reorder; ppt→PDF to PowerPoint. Extra keywords also work: shrink, reduce, sign, png | PASS |
| AC-18 | P1 | n/a | During search: Popular hidden, only "Organize pages" heading visible. With history: Recent hidden as well | PASS |
| AC-19 | P1 | n/a | `zzqx`: "No tools match “zzqx”", 0 cards. Clear search empties the field, brings back 45 and focuses the field | PASS |
| AC-20 | P1 | n/a | `merge` (2 cards), then Escape: field empty, 45 cards | PASS |
| AC-21 | P2 | n/a | Polite live region: "5 tools"; for `zzqx`: "No tools found" | PASS |
| AC-22 | P2 | n/a | Switch on: only `/rotate-pdf` visible on the whole page; off: 45 | PASS |
| AC-23 | P0 | logo + All Tools | `/`, `/rotate-pdf`, `/merge-pdf`, `/privacy`, `/does-not-exist` (404): 1 header each, logo "InstaPDF home" goes to `/`, visible "All tools" button | PASS |
| AC-24 | P0 | no `aria-expanded` (observed) | false → true (panel visible) → false (panel gone) | PASS |
| AC-25 | P0 | 11 columns | 45 entries (all slugs) under the same 8 headings; 44 visible "Coming soon" badges, also in the accessible names | PASS |
| AC-26 | P0 | closes, no focus handling | Escape (with and without a query) closes it; focus is on the All tools button (`:focus-visible`) | PASS |
| AC-27 | P1 | backdrop and × close it (spec obs.) | Backdrop click closes it; "Close all tools" × closes it and focus returns to the button | PASS |
| AC-28 | P1 | n/a | Search is focused on open; `split` gives the 5 Split entries; `zzqx` gives "No tools match “zzqx”" | PASS |
| AC-29 | P1 | plain link | `/rotate-pdf` loads; `aria-expanded=false`; no panel | PASS |
| AC-30 | P1 | no focus handling | From the search, Tab reaches all 45 entries in order, then Close, then leaves. Every stop is `:focus-visible` with an outline | PASS |
| AC-31 | P1 | 6 popular shortcuts | 768/1024/1366: exactly 1 (`/rotate-pdf`) | PASS |
| AC-32 | P1 | jumps to top (spec obs.) | `scrollY` 600 before and after opening | PASS |
| AC-33 | P2 | n/a | 1280×720: the panel scrolls (1117/631 px); 45/45 entries can be hit after scrolling | PASS |
| AC-34 | P2 | hover-intent opens | **Dropped by design (ux)** (spec H-11 item 2, orchestrator decision). Not counted | – |
| AC-35 | P2 | n/a | `rota` + Enter goes to `/rotate-pdf` | PASS |
| AC-36 | P0 | logo, All Tools, Pricing, Log in | Logo + menu button; 0 shortcuts visible; scrollWidth 375 | PASS |
| AC-37 | P0 | 2-column menu, no dialog | Native `<dialog>`, exactly one role=dialog, `aria-modal="true"`, `aria-haspopup="dialog"` on the trigger, search field, 45 links, 8 groups. Close button closes it and focus returns to the trigger | PASS |
| AC-38 | P1 | page still scrolls | 60 Tabs + 10 Shift+Tabs all stay inside; `scrollY` stays at 300 after a wheel and a touch-scroll gesture (`html` overflow hidden) | PASS |
| AC-39 | P1 | n/a | Smallest card/tile is 106 px tall; 0 overflow at 375; `split` gives 5 cards | PASS |
| AC-40 | P1 | shows 5 defaults (spec obs.) | Fresh profile: no Recent on the home page or in the menu | PASS |
| AC-41 | P1 | added on first visit (spec obs.) | After `/rotate-pdf`: Recent (above Popular) and the menu Recent both start with Rotate; stored `["rotate-pdf"]` | PASS |
| AC-42 | P1 | n/a | `/merge-pdf`, `/about`, `/privacy`, `/does-not-exist`, `/` leave `["rotate-pdf"]` unchanged; a fresh profile visiting `/merge-pdf` stores nothing | PASS |
| AC-43 | P1 | n/a | Seed `["no-such-tool","merge-pdf","rotate-pdf"]`: only Rotate (home and menu) | PASS |
| AC-44 | P1 | try/catch (spec obs.) | `{oops`: no Recent, 45 cards, 0 page errors; after `/rotate-pdf` the value is `["rotate-pdf"]` | PASS |
| AC-45 | P1 | try/catch (spec obs.) | A throwing `localStorage` getter: no Recent; catalogue search (5) and menu search work; 0 uncaught errors; Rotate still loads | PASS |
| AC-46 | P2 | not moved to front (spec obs.) | 12-item seed ending in rotate gives 12 items starting with rotate (no duplicate); 12 others + a new visit gives 12 (oldest dropped) | PASS |
| AC-47 | P2 | n/a | The home "Clear recently used tools" removes the row on the home page and in the menu and removes the key; the menu Clear does the same | PASS |
| AC-48 | P0 | n/a | `/merge-pdf` 200, `h1` "Merge", visible "Coming soon", 0 file inputs, two links to `/#tools`; title "Merge (coming soon) · InstaPDF" | PASS |
| AC-49 | P1 | n/a | `noindex` on `/merge-pdf`, `/workflows`, `/compress-pdf` and the 6 placeholders; none on `/` or `/rotate-pdf` | PASS |
| AC-50 | P1 | reference 404 | 404; header and footer; "We couldn't find that page"; link to `/#tools` | PASS |
| AC-51 | P2 | n/a | "Ready to use now" lists `/rotate-pdf` | PASS |
| AC-52 | P0 | 3 columns (spec obs.) | All 5 pages: All tools, About, Help, Privacy, Terms, Cookies, Security; "© 2026 InstaPDF". All 7 targets return 200 | PASS |
| AC-53 | P2 | A–Z list | 45 links, all slugs, sorted A–Z; 44 have "coming soon" in their accessible name | PASS |
| AC-54 | P0 | first-party cookies set (observed) | Desktop and mobile, load + menu + search: only the staging origin; 0 cookies; no `Set-Cookie` | PASS |
| AC-55 | P1 | n/a | Lighthouse mobile performance 97 / 98 / 97 | PASS |
| AC-56 | P1 | n/a | **axe 4.14.1 reports `label-content-name-mismatch` (serious)** on `/` with the menu closed (55 nodes), the desktop menu open (97), the menu showing no results (55) and the mobile menu open (13). The catalogue showing no results is clean. See G-1 | **FAIL** |
| AC-57 | P1 | no scroll at 375 | 320/375/768/1024/1440: scrollWidth = viewport | PASS |
| AC-58 | P2 | n/a | On `/`, `/rotate-pdf`, `/merge-pdf`, `/about` and 404, the first Tab is "Skip to main content"; Enter moves focus to `MAIN#main` | PASS |
| AC-59 | P1 | n/a (ours) | 33 client tools carry a visible "Runs in your browser" on both cards and menu entries, also in the accessible name. The 12 without it are compress, grayscale, repair, protect, unlock, PDF to Word/Excel/PowerPoint, Word to PDF, Web page to PDF, OCR and deskew (the server-side set) | PASS |
| AC-60 | P2 | n/a (ours) | 45/45 cards and 45/45 menu entries have an inline `svg aria-hidden="true"`; 0 `img`; 0 icon requests. The license (Lucide ISC) is taken from spec H-3; checking the package is outside the evaluator's read scope | PASS |
| AC-61 | P2 | n/a (ours) | `/` on `/` focuses the catalogue search (nothing typed); typing `a/b` in the field gives `a/b`; on `/merge-pdf`, `/` opens the menu with its search focused | PASS |
| AC-62 | P2 | n/a (ours) | Typing gives `?q=split` with no new history entries; clearing removes `q`; `/?q=split` gives the field "split" and 5 cards; the server HTML still has every category | PASS |
| AC-63 | P2 | n/a (ours) | `split`: 5 `<mark>`s; `rot` gives `<mark>Rot</mark>ate` and `<mark>rot</mark>ation`; `encrypt` (keyword only) shows Protect with 0 marks; clearing leaves 0 marks | PASS |

## UX parity notes

| Area | Sejda | InstaPDF |
|---|---|---|
| Catalogue | Popular (9) + 8 groups, with duplicates; no visible search | Popular (10) + 8 groups, no duplicates; visible search with keywords, highlights, `?q=`, ready-only switch, jump chips |
| Header | 6 shortcuts, Pricing, Desktop, Log in, language | 1 shortcut (Rotate, the only usable tool); right side empty (F19/F22 deferred) |
| Menu (desktop) | Hover or click; jumps to the top; no ARIA; Recent padded with defaults | Click or `/`; keeps the scroll position; disclosure with `aria-expanded`; search; Recent only with real history |
| Menu (mobile) | Same mega menu in 2 columns; page scrolls; no focus handling | Full-screen modal dialog, focus trap, scroll lock |
| Error/limit states | Reference 404 | 404 with catalogue link, coming-soon pages (200, noindex), storage failures handled silently |
| 375 px | No horizontal scroll | No horizontal scroll at 320–1440; cards ≥ 106 px tall |
| Privacy | Sets cookies | No cookies, no third-party requests |

## Lighthouse (mobile, simulated throttling) and axe

| Run | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 97 | 100 | 100 | 100 | 1.0 s | 1.3 s | 180 ms | 0 | 1.2 s |
| 2 | 98 | 100 | 100 | 100 | 1.0 s | 1.0 s | 180 ms | 0 | 1.1 s |
| 3 | 97 | 100 | 100 | 100 | 1.0 s | 1.0 s | 190 ms | 0 | 1.3 s |

axe-core 4.14.1 via @axe-core/playwright. Tags: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa and best-practice. The default ruleset gives the same result. **0 critical violations in any state.**

| State | Violations |
|---|---|
| Home 1366, menu closed | `label-content-name-mismatch` serious ×55 (10 Popular tiles + 45 cards) |
| Home 1366, desktop menu open | same rule ×97 (55 + 42 menu entries) |
| Home 1366, menu search "zzqx" (no results) | same rule ×55 (catalogue cards behind) |
| Home 1366, catalogue search "zzqx" (no results) | none |
| Home 1366, Recent populated + only-ready on | same rule ×2 (Rotate tile and card) |
| Home 375 | same rule ×55 |
| Home 375, mobile menu open | same rule ×13 (entries checked inside the modal) |
| Coming-soon `/merge-pdf`, 1366 and 375 | same rule ×1 (the Rotate card under "Ready to use now") |
| 404, 1366 and 375 | same rule ×1 (same card) |
| Placeholder `/privacy` | none |
| (control) `/rotate-pdf` | none |

Lighthouse's accessibility score is 100 because its bundled axe ruleset does not run this rule.

## Gap list

1. **G-1 (P1, AC-56: must fix).** axe-core 4.14 (current; the rule is no longer experimental and runs by default) flags every tool card, Popular tile and menu entry with `label-content-name-mismatch` (serious, WCAG 2.5.3). There are two causes:
   - **Cards and tiles:** `aria-labelledby` takes name + badge + runtime marker but leaves out the summary. The summary is visible text inside the link and only goes into `aria-describedby`, so the visible text is not contained in the accessible name.
   - **Menu entries (and the cards):** the name, badge and marker `<span>`s sit next to each other with no whitespace text between them. axe joins the visible text as "MergeComing soonRuns in your browser", which does not match the name "Merge Coming soon Runs in your browser". The one entry that passes is "Remove annotations".

   I patched the DOM live to confirm the fix:
   - For a menu entry, adding a space text node between the spans makes it pass.
   - For a card, it passes once the summary id is also in `aria-labelledby` (name, summary, badge, marker) and the spans are separated by spaces.

   Two possible fixes: drop `aria-labelledby` and let the name come from the content (with `sr-only` ", " separators), or include every visible piece in `aria-labelledby` in visual order and add whitespace between the inline pieces. Add a test that runs axe with the default ruleset of the pinned axe version on the four AC-56 states.
2. **G-2 (info, AC-27).** At 1366×900 the open desktop panel is 868 px tall (`--ip-menu-max-h`), which leaves only a 32 px backdrop strip to click. A backdrop click closes the menu but leaves focus on `<body>`; only Escape and × return focus to the trigger. Both follow the spec. Consider sending focus back to the trigger on a backdrop close too.
3. **G-3 (info, e2e robustness).** Playwright's `locator('[data-testid=tool-menu-scrim]').click()` never completes: the element's centre is covered by the panel, so the actionability check keeps waiting. A page-coordinate click below the panel works. Builder e2e tests for AC-27 should click a point on the scrim outside the panel.
4. **G-4 (info, AC-60).** The evaluator cannot check the icon package license, because that would mean reading `apps/`. The rendered side is fully compliant. CI or the reviewer should confirm `lucide-static` is an exact-pinned devDependency (ISC) as spec H-3 requires.

## Harness notes

- Ground truth for the registry (slugs, groups, popular order, runtime) came from the spec (H-3 slug table, §3b popular order, H-4 group counts) and from consistency checks between the catalogue, the menu and the footer. The evaluator does not read `apps/`.
- In the AC-10 crawl, `/does-not-exist` shows up as 404 only because the evaluator opened that page itself; it is not linked from anywhere.
- Evaluator scripts and raw JSON results are in the session scratchpad and are not committed. Reference observations are in `docs/evals/cache/f2-home/`.
