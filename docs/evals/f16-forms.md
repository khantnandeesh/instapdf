# F16 E3 forms: parity evaluation (step 8)

- **Verdict: FAIL.**
- **Date:** 2026-11-24, 16:01 to 16:40 UTC.
- **Build:** BerryPDF staging `https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf` (main at 341fa82, includes the forms merge 05dd84c, deployed 15:59 UTC).
- **Reference:** Sejda online PDF editor, `https://www.sejda.com/pdf-editor`, Forms menu.
- **Evaluator:** independent. I read only the spec (`docs/specs/f16-pdf-editor.md` §AC-230 to AC-253 and U-F1 to U-F8), `docs/process/mission.md`, `docs/process/editor-micro-checks.md`, the earlier evals and the fixtures. I did not read `apps/`, `services/`, `infra/` or any PR description.

## Why it fails

| Gate | Bar | Result | Met? |
|---|---|---|---|
| Micro-checks M1–M12 | no *lose* unless the owner waived it | 6 win, 3 tie, **3 lose (M2, M8, M12)** | **no** |
| P0 ACs | all pass | AC-231, AC-247 and AC-253 pass. **AC-248 fails.** AC-230 passes for every type in the fixture, but 2 types are untested | **no** |
| All ACs | ≥ 90% pass | **18 / 24 = 75%** (4 fail, 2 partly untested) | **no** |
| Lighthouse mobile performance | ≥ 90 | **84** (median of 72 / 84 / 86) | **no** |
| axe | no critical | 0 critical, 0 serious, 1 moderate | yes |

The three biggest problems:
1. **Non-Latin values are written as "?".** Filling "Zoë Šťastná", "₹ 5,000" and "Ирина 12" gives "Zoë Š?astná", "? 5,000" and "????? 12" in both pdf.js and PDFium. Sejda shows all three correctly. The editor shows no warning (AC-232, M8).
2. **Tab does not follow the tab order** (AC-248, P0). After a custom reorder, Tab still moves in screen order. Between pages, Tab stops 12 times on page buttons before it reaches the next field.
3. **Pages get about half the screen on desktop** (M12). Once the user is working, pages fill 46–56% of the viewport at 1280–1536 px and 38% at 1920 px. Sejda fills 83–92%.

## Method

- **Browser:** headless Playwright Chromium only (`require('playwright')`, `chromium.launch()`). Desktop runs used 1280×800. Phone runs used 375×812 and 390×664/844 with touch on. M12 used the five real viewports.
- **Sejda budget:** 3 real tasks (apply and download), all before 17:00 UTC. File loads and UI inspection were not counted as tasks, and I left at least 1.5 s between page loads.

  | # | Task | Applied (UTC) | Output |
  |---|---|---|---|
  | 1 | Fill `form-basic.pdf` with non-Latin values | 16:03:27 | `cache/f16-forms/sejda-t1-fill.pdf` |
  | 2 | Create one field of each kind on `scan-form.pdf`, set properties, sort tab order by columns | 16:12:02 | `cache/f16-forms/sejda-t2-create.pdf` |
  | 3 | Detect fields on `report-form-3p.pdf` (page 2 in view) | 16:12:40 | `cache/f16-forms/sejda-t3-detect.pdf` |

- **Output checks on every file from both sites:**
  - Structure: `qpdf` is not installed, so I used **pikepdf 10.18.2** `Pdf.check_pdf_syntax()` (qpdf's checker). All 12 outputs report 0 issues.
  - Fields: read with pdf.js 6.5.438 (`getFieldObjects()` and `page.getAnnotations()`).
  - Raw structure (`/Fields` order, `/Annots` order, `/Tabs`, `DA`, `AP`, `MK`, `TU`): read with pikepdf.
  - Rendering: each page rendered at 2× in pdf.js (`AnnotationMode.ENABLE`) and in PDFium (pypdfium2, forms on).
  - Untouched areas: pixel diff against the source render, with widget rectangles masked out.
  - Analysis files: `docs/evals/cache/f16-forms/analysis/`.
- **Field fixtures:** `tests/parity/forms/` (`form-basic.pdf`, `report-form-3p.pdf`, `detect-mix.pdf`, `scan-form.pdf`).

## AC table

| AC | P | Sejda result | BerryPDF result | Pass? |
|---|---|---|---|---|
| AC-230 read every field type | P0 | Reads all 13 terminal fields. It **merges `address.street` and `address.town` into one value** (typing in one fills both) and does not enforce `MaxLen` 6 (`V` = "1234567") | Reads all 13 terminal fields with the right kind, value, default, options, read-only (`code`), required (`email`, `agree`, `size`), comb and max length. `address.street` and `address.town` stay separate. The signature is shown and opens Sign. **Editable combo and push button are not in any fixture, so they are untested** | **partly untested** (every type in the fixture passes) |
| AC-231 `V` and fresh AP, untouched fields byte-identical | P0 | Values written, APs regenerated | `V` written with a fresh AP for every changed field, no `NeedAppearances`. Untouched `code` and `signature` APs are byte-identical to the source (MD5 match). Problems: changed fields' `DA` points to `/Helvetica`, which is not in AcroForm `/DR`; `street`/`town` lose their border and change from auto size to a fixed 14 pt (G-6) | pass (with G-3 and G-6) |
| AC-232 non-WinAnsi values draw correctly | P1 | Correct: embeds LiberationSans and Inter subsets for "Zoë Šťastná", "₹ 5,000", "Ирина 12" | **"Zoë Š?astná", "? 5,000 paid", "????? 12"** in pdf.js and PDFium. The AP uses Helvetica, not embedded. No notice in the editor (live regions checked before and after download) | **FAIL** |
| AC-233 read-only, max length, required nudge | P1 | Read-only blocked. Max length **not** enforced. No required nudge | Read-only blocked (`code` stays A-17). Typing 7 digits into `pin` keeps 6. The chip turns to "⚠ 2 required empty", the toast says "2 required fields are empty", and the download still happens | pass |
| AC-234 structure and properties of new fields | P1 | `Tx`, `Ch` combo, `Ch` multi-select list, `Btn` radio (3 widgets with export values), `Btn` checkbox (export value `Yes_8s6y`), `Sig`. Font size auto (`0 Tf`) | Structure right: `Tx` (multiline, comb 6, max length), `Ch` combo, `Ch` list multi-select, radio `Btn` with `/Opt` export values student/staff/guest, checkbox `Yes`, `Sig`, `TU` written. But **"Auto" size is saved as a fixed size** (comments **51 pt**, pin 26 pt, list 16 pt, dropdown 13 pt, text 14 pt). There is **no border width control**. Checkbox and radio `DA` = `/dummy__noop 0 Tf` | **FAIL** |
| AC-235 name check and Repeat on all pages | P1 | Duplicate radio names join a group. Random suffixes | Typing a duplicate shows "⚠ Another field has this name. Use member_type_2" with the button. A duplicate `pin` was not applied. **No "Repeat on all pages" in any ⋯ menu** (Text, Checkbox, Signature checked) | **FAIL** |
| AC-236 edit existing keeps value, delete removes | P1 | not tested (budget) | Renamed `name` → `full_name`: value "Keep Mef" kept. Moved `notes` 15 pt: value kept. Deleted `email`: gone from `/Fields` and `/Annots` (13 widgets left) | pass |
| AC-237 signature field appearance, no dialog | P1 | **Blocking dialog** "Signature box not always visible…". The output `Sig` has **no AP** (invisible) | Dashed border and "Sign here" drawn in pdf.js and PDFium. No dialog | pass |
| AC-238 fields on rotated / offset-crop pages | P1 | spec: not allowed on rotated pages | 90°: lands where drawn, reads upright, `MK /R 90`. 180°: same, `MK /R 180`. 270°: same, `MK /R 270`. **CropBox not at 0,0: no fixture, untested**. Rotating the page again resets every widget's `/R` to the new turn, so a field drawn at 180° became a narrow vertical strip with tiny text after a further turn | **partly untested** |
| AC-239 tab order rows / columns / original / custom | P1 | Sort by rows / columns / restore / drag. The output keeps `/Tabs /S` and `/Fields` in creation order | "Columns": `/Tabs /C`, and `/Annots` and `/Fields` follow the panel order exactly. Custom drag and keyboard reorder work in the UI | pass |
| AC-240 detect runs in the browser, lazy, progress, cancel, < 0.5 s/page | P1 | Server: POST to `/api/files/…`, "Analyzing your document…" overlay for 5.1 s, page in view only | 0 non-GET requests. Lazy chunk `berry-detect.*.js`. "Page 1 of 3", "Page 2 of 3", then the result in **0.95 s for 3 pages** (0.32 s/page with chunk load). detect-mix: 0.70 s / 3 pages. "Stop detecting" leaves no proposals | pass |
| AC-241 report-form-3p: 7 fields on page 2 | P1 | 7 fields, but `full_name_1j5w`… (random suffix), no tooltips, **signature as `Tx`** | Exactly 7, page 2 only: `full_name`, `email_address`, `phone`, `date_of_birth` (TU "Date of birth (MM/DD/YYYY)"), `i_agree_to_the_terms`, `send_me_updates`, `signature` as **`Sig`**. Each TU is the label. Pages 1 and 3: none | pass |
| AC-242 detect-mix kinds | P1 | spec live run: PIN boxes as plain text, slivers under lines | Lines, underscores, dotted leader (`city`), multi-line box (`comments`), **comb `pin_code` MaxLen 6**, check squares, radio group `member_type` named from its question with Student/Staff/Guest, date tooltips with format | pass |
| AC-243 no false positives on page 2 | P1 | n/a | detect-mix page 2: 0 proposals | pass |
| AC-244 only new fields where fields exist | P1 | spec: refuses pages that have fields | Page 3 keeps `phone` and adds only `mobile`. The pill reads "12 fields on 2 pages" (new ones only) | pass |
| AC-245 scanned page | P2 | not tested | scan-form: 11 fields named `text`…`text_8`, `checkbox`, `checkbox_2`, `choice` | pass |
| AC-246 accept / reject one or all | P1 | No review step | ✓ / ✕ per proposal. Enter accepts and Delete rejects the focused one. Add all and Discard | pass |
| AC-247 every output passes check and draws with APs | P0 | 3 / 3 pass the check | 9 / 9 BerryPDF outputs: 0 issues (pikepdf). Every widget except unchanged `Sig` has an AP and draws in pdf.js and PDFium | pass |
| AC-248 fill with any tool; Tab follows tab order across pages | P0 | n/a | Filling works with Select active (text, comb, checkbox, radio, combo, list), and the download carries the values. But **Tab ignores the tab order**: after moving `date_of_birth` to #1 and `city` to #2, Tab from `date_of_birth` goes to `PIN code`. **Across pages Tab passes 12 non-field stops** (5 page buttons and "Text on page n", twice) before page 3's `phone` | **FAIL** |
| AC-249 drag / click create, popover, Delete, nudge, duplicate, undo | P1 | Click places it, then a separate menu for properties | Drag creates the box. A click creates the default size centred on the click (213×27 px at 100%). The popover opens. Shift+→ moves 10 pt. Ctrl+D duplicates. Ctrl+Z undoes. Delete removes. Snapping was not measured | pass |
| AC-250 review pill | P1 | n/a | "7 fields on 1 page", ‹ › (Previous / Next field), Add all is **one undo step** (7 → 0 → 7 with Ctrl+Z / Ctrl+Shift+Z). Cancel leaves nothing | pass |
| AC-251 tab-order badges renumber live | P1 | List only, no badges | Badges on the canvas. Keyboard (Space, ↑↑, Space) and mouse drag renumber them at once | pass |
| AC-252 no editor chrome in the output | P1 | 0 changed px outside widgets | 0 changed px outside widgets on fill, create and detect (all pages, PDFium 2×) | pass |
| AC-253 11-slot rail at 1366×657; phone Form in More | P0 | n/a | 11 rail buttons, last bottom at 615 px < 657, no rail scroll. At 390×844 the dock keeps Text/Sign/Mark/Whiteout/Draw/More and **Form is in More**. The Form strip fits (no sideways scroll) | pass |

Summary: **18 pass, 4 fail (AC-232, AC-234, AC-235, AC-248), 2 partly untested (AC-230, AC-238)**. P0: AC-248 fails.

## Micro-comparison

Captures are side by side, Sejda left and BerryPDF right. They are in `docs/evals/cache/f16-forms/micro/` and copied to `/mnt/project-files/comparisons/f16-forms/`.

| # | Check | Sejda | BerryPDF | Numbers | Score | Captures |
|---|---|---|---|---|---|---|
| M1 | Landing | 31 words above Upload. LH mobile perf 66 (1 run, same machine) | 12 words above Open PDF (10 on phone). LH perf 84 median | load event 1.8 s vs 1.3 s | **win** | 01, 17, 28 |
| M2 | Upload start | Click, drop, and a dropdown on Upload with **Dropbox, Google Drive, OneDrive, Web Address (URL)** (`cache/f16-forms/sejda-upload-dropdown.png`), blank doc. **Uploads on pick** (`/api/files/upload`) | Click, drop, Ctrl+V, Blank page. No cloud or URL. Nothing uploaded | n/a | **LOSE** (same gap as F3 G-1; no owner waiver) | 01, 02 |
| M3 | Loading | Uploads first, then renders | First page painted 310 ms after pick (form-basic), 0 B uploaded, "11 fields" chip at once | Sejda's paint time was not measured precisely | tie | 02 |
| M4 | Display | Page at fit width. Fields shaded. Read-only `code` shows overlapping text | Page at 100%. Shading, required dots, comb dividers. The `days` list clips "Thu" in the output AP. A reopened `Sig` shows "Sign" over the saved "Sign here". 60+ page scroll: N/A (no long form fixture) | n/a | tie | 02, 03, 12 |
| M5 | Interaction | 2 clicks per new field (Forms menu, kind) plus clicks on the page. Properties sit in a separate menu, and `fill()` does not commit names (you must type). No review for Detect | Tool stays armed: 1 click per field. Inline popover. Shortcuts (F, Delete, nudge, Ctrl+D, undo/redo). Tab-order badges on the canvas. Detect review ✓ / ✕ with keys. Gaps: G-2 Tab order, G-10 radio clicks, G-12 popover covers targets | n/a | **win** (with G-2, G-10, G-12) | 06, 07, 09, 12 |
| M6 | Options | 6 kinds (list = dropdown with multi-select). Name, comb, max length, mandatory, border/fill colour, align, size, text colour. Tab order rows / columns / restore / custom. Free tier: 3 tasks/h | 7 kinds, plus tooltip, default value, read-only, editable dropdown, export value, checked by default, align, fill, required. Tab order rows / columns / original / custom with canvas badges. No task limits. Missing: border width, Repeat on all pages (spec) | n/a | **win** (G-4, G-5 still open) | 06, 07, 09, 19 |
| M7 | Processing | Apply → download: 5.3 s (create), 3.5 s (detect). Detect: 5.1 s for 1 page (server) | Download click → file: 1.0 s (fill, first), 0.34 s (create), 0.29 s (detect). Detect: 0.95 s for 3 pages | 1 Sejda run per flow (budget), not median of 3 | **win** | 11, 14 |
| M8 | Output fidelity | Non-Latin text correct (embedded subsets). Own bugs: merges street/town values, `V` over MaxLen, giant "Musi" list AP, auto-selects first option, no TU, invisible `Sig`, `Tx` for the signature line, random suffixes | **"?" for Š ť ₹ and Cyrillic** (G-1). 51 pt "auto" size (G-3). Border lost on street/town (G-6). Files 1.2–1.5× Sejda's: fill 24,943 vs 20,881 B; create 42,235 vs 28,717 B; detect 43,465 vs 32,994 B. Untouched-area diff 0 px on both. pikepdf check clean on both | n/a | **LOSE** (the core fill task corrupts the user's own name) | 04, 05, 10, 13 |
| M9 | Errors | Corrupt: "Could not open file" plus an "errors" warning. `.txt`: "Please select PDF files" | Corrupt: "corrupt-form.pdf couldn't be opened. It may be damaged or not really a PDF." under the Open button. `.txt`: "notes.txt isn't a PDF, so it was skipped." Note: a missing glyph gives **no** message (G-1) | n/a | **win** | 15, 16 |
| M10 | Privacy and cost | Uploads on pick. Detect calls the server. 3 tasks/h | 0 non-GET requests from pick to download in fill, create and detect. Only GET is the lazy detect chunk. "0 B uploaded" chip | n/a | **win** | 02, 11 |
| M11 | Look and motion | Plain. Blocking signature dialog | BerryPDF look, calm pill and badges. Nits G-12, G-13, G-14, small ✓ / ✕ | n/a | tie | 08, 11, 12 |
| M12 | First screen fit | Primary (Apply) visible at all 5 viewports. Pages area on load 43–55%, **after scroll 90–92% (1280–1536), 83% (1920)**. Phone: page overflows sideways (scrollWidth > viewport), 46–69% | Primary (Download) visible at all 5, sticky at top. Pages area on load 48 / 51 / 43 / 36% (1366 / 1280 / 1536 / 1920), **after scroll 51 / 54 / 46 / 38%**. Page width 41–62% of viewport (100% zoom plus 260 px panel). Phone 390×664: **76%**, no sideways scroll | from `cache/f16-forms/vp/*` | **LOSE** (desktop pages get clearly less screen) | 20–28 |

Totals: 6 win (M1, M5, M6, M7, M9, M10), 3 tie (M3, M4, M11), **3 lose (M2, M8, M12)**.

## Lighthouse and axe

- **Lighthouse 12.8.2, mobile, empty state** (Lighthouse can't load a file into the page). Run with the Playwright Chromium binary, 3 runs:

  | Run | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS |
  |---|---|---|---|---|---|---|---|---|
  | 1 | 72 | 100 | 100 | 66 | 1.3 s | 2.6 s | 1,340 ms | 0 |
  | 2 | 84 | 100 | 100 | 66 | 1.3 s | 1.5 s | 620 ms | 0 |
  | 3 | 86 | 100 | 100 | 66 | 1.3 s | 1.9 s | 520 ms | 0 |

  - Median performance is **84 (< 90)**. TBT is the cost: about 4.6 s of main-thread work (bootup 1.3 s), with chunks `37fe13fc-…js` (471 ms scripting), `6495-…js` (301 ms) and `1c555f34.…js` (189 ms).
  - SEO 66 comes only from `is-crawlable` (staging is noindex, which is expected there).
  - Context: Sejda's editor scored 66 on the same machine (1 run). The machine's benchmarkIndex was 1,260–1,523.
  - Reports: `cache/f16-forms/lighthouse-mobile-{1,2,3}.json`, `lighthouse-mobile-sejda.json`.
- **axe-core 4.14.1** with `form-basic.pdf` loaded (CSP bypassed only so axe could be injected). States: 1280 loaded, 1280 with the Form tool and field popover open, 1280 Tab order panel, 1280 Detect review, 390 loaded. Result: **0 critical, 0 serious**. 1 moderate in every state: `landmark-banner-is-top-level` (`.ed-top`). Details: `cache/f16-forms/axe-results.json`.

## Gap list

1. **G-1 (blocks: AC-232, M8). Non-WinAnsi values become "?".**
   - What happens: changed text, combo and list appearances use non-embedded `/Helvetica`. "Zoë Šťastná" → "Zoë Š?astná", "₹ 5,000" → "? 5,000", "Ирина 12" → "????? 12" in pdf.js and PDFium. Captures 04 and 05.
   - Fix:
     - Embed a subset of an open font that covers the value (Noto Sans Latin/Cyrillic plus the ₹ glyph) in each changed field's AP.
     - Add the font to AcroForm `/DR` and point `DA` at it.
     - Show the inline missing-glyph notice the spec describes when no single font covers a value.
     - Add an e2e that renders the output and checks the glyphs against the expected text.
2. **G-2 (blocks: AC-248, P0). Tab does not follow the tab order.**
   - In the editor, Tab moves in DOM/screen order, not in the model's tab order: after a custom reorder, `date_of_birth` → `PIN code` instead of `city`.
   - Between pages, Tab passes 5 page-action buttons and "Text on page n" for every page.
   - Fix: when focus is in a form field, handle Tab and Shift+Tab yourself. Move to the next or previous field in the tab order across pages, and scroll it into view. Leave the page controls reachable by their own route (for example F6 or the toolbar).
3. **G-3 (blocks: AC-234, M8). "Auto" font size is saved as a fixed size.**
   - New fields get `DA` sizes of 51 pt (comments), 26 pt (pin), 16 (list), 13 (dropdown) and 14 (text). Any viewer that regenerates the appearance will type at those sizes.
   - Fix:
     - Write `0 Tf` for auto, and size only the AP.
     - Make sure the `DA` font name exists in `/DR`. Today `DA` uses `/Helvetica` while `/DR` has only `/Helv`.
     - Remove `/dummy__noop 0 Tf` from the checkbox and radio `DA`.
4. **G-4 (AC-234). No border width control.** Add a width control (0, 1, 2, 3 pt) next to Border, and write it in `/BS /W`.
5. **G-5 (AC-235). "Repeat on all pages" is missing.** It should be in the ⋯ menu for Text, Checkbox and Signature. It should make one field with one widget per page.
6. **G-6 (M8). Regenerated appearances drop the field's border and auto size.** `address.street` and `address.town` have `/Border [0 0 1]` and `MK /BC [0 0 0]`. Sejda draws the border. We draw none, and we change `0 Tf` to `14 Tf`. Keep the border from `/BS`, `/Border` and `/MK`, and keep auto size.
7. **G-7 (blocks: M12). Pages get too little of the screen on desktop.**
   - At 100% zoom with the 260 px side panel open, pages fill 46–56% of the viewport (38% at 1920×969). Sejda fills 83–92%.
   - Fix: open at Fit width (with a sensible maximum), and/or start with the thumbnails panel collapsed for short documents. Then re-measure with `cache/f16-forms/vp` and the captures 20–27.
8. **G-8 (blocks: M2). No cloud or URL source.** This is the same as F3 G-1: ship a cloud picker, or record the owner's written waiver here.
9. **G-9 (blocks: Lighthouse). Performance median 84, TBT 520–1,340 ms on the empty state.** Defer the editor chunks named above until intent (AC-86), and re-run 3 times.
10. **G-10 (M5, U-F2). Radio creation goes wrong.**
    - Clicking the next circle while the new group is selected starts a **new group** (`choice_2`) instead of adding a button to the group.
    - The value typed into "This button's value" is **lost** on that click.
    - Reproduced twice. Fix: commit popover inputs on blur or pointerdown, and add to the selected group as U-F2 says.
11. **G-11 (M5). Escape discards a typed field name** ("typed_then_escape" → "text"). If Escape is meant to cancel, say so in the field. Otherwise commit on Escape the same way as on blur.
12. **G-12 (M5/M11). The properties popover covers the next targets.** The radio popover covered the checkbox row, and the dropdown's ⋯ panel covered the PIN row, so a drag landed on the popover. Place the popover on the side away from the next likely target, or shrink it to a single row until ⋯ is opened.
13. **G-13 (U-F2). Name tags show only on the selected field.** With the Form tool active, every field should show its outline and name tag.
14. **G-14 (M4/M11). Double label on a reopened signature field.** The editor's "Sign" label is drawn over the saved "Sign here" appearance (capture 12, right side). Hide one of them.
15. **G-15 (M5 phone). Fields are too small to fill on a phone.** At 375 px the Name field is 10.8 css px tall. Offer tap-to-zoom on a field, or a fill sheet, so the target is ≥ 44 px.
16. **G-16 (Detect polish).**
    - The first "Next field" press goes to the 2nd proposal (`address`), not the 1st.
    - The `signature` proposal on report-form-3p reaches up to the checkbox row (its top equals the checkbox bottom, 593.9 pt). Cap its height to the gap above the line.
17. **G-17 (AC-230, AC-238). Fixtures are missing, so some cases are untested.**
    - Add an editable combo and a push button to `form-basic.pdf`, or add a new fixture.
    - Add a fixture whose CropBox does not start at 0,0.
    - Then re-evaluate those two ACs.
18. **G-18 (M8). The list appearance clips its last option.** The `days` list (4 options, 56 pt tall) cuts off "Thu". Sejda fits all four. Use a tighter line height or the auto size in list APs.
19. **G-19 (M8). Outputs are 1.2–1.5× Sejda's size.** Use object streams and compressed xref, and share the AP font across widgets.
20. **G-20 (axe, moderate).** `landmark-banner-is-top-level` on `.ed-top`.

## Owner waiver

None recorded.

## Re-run notes

- Sejda outputs and screenshots are cached in `docs/evals/cache/f16-forms/` (`sejda-t1-fill.pdf`, `sejda-t2-create.pdf`, `sejda-t3-detect.pdf`, `sejda-runs.json`). Reuse them. A re-evaluation needs no new Sejda task unless the reference changes.
- To re-check, re-run the same BerryPDF flows with the fixtures above, the pikepdf/pdf.js/PDFium checks and the viewport script. Every gap above has a reproducible check.
