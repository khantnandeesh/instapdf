# F16 E3 forms: parity evaluation (step 8)

- **Verdict (re-evaluation 2026-11-24 18:14–18:40 UTC, staging 3fc9e65): FAIL, but only on cross-cutting checks.** No forms blocker remains: every AC passes (24 / 24, all P0) and every forms gap that blocked the first run is fixed. The gate still fails on two micro-check loses that this feature does not own: **M2** (no cloud or URL source, owned by the cloud pickers work) and **M12 at 1536 and 1920 px** (editor-wide layout, owned by the lead). The owner has not waived either one in writing. Once both are fixed or waived, the verdict becomes PASS without a forms re-run. Details are in the re-evaluation section below.
- First run verdict (16:01–16:40 UTC, staging 341fa82): FAIL.
- **First run date:** 2026-11-24, 16:01 to 16:40 UTC.
- **First run build:** BerryPDF staging `https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf` (main at 341fa82, includes the forms merge 05dd84c, deployed 15:59 UTC).
- **Reference:** Sejda online PDF editor, `https://www.sejda.com/pdf-editor`, Forms menu.
- **Evaluator:** independent. I read only the spec (`docs/specs/f16-pdf-editor.md` §AC-230 to AC-253 and U-F1 to U-F8), `docs/process/mission.md`, `docs/process/editor-micro-checks.md`, the earlier evals and the fixtures. I did not read `apps/`, `services/`, `infra/` or any PR description.

## Re-evaluation (2026-11-24, staging 3fc9e65)

- **Build:** `https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf`, main at 3fc9e65, deployed 18:14 UTC. Runs took place from 18:14 to 18:40 UTC.
- **Evaluator:** independent. I read only this file, the spec ACs (AC-230 to AC-253, U-F1 to U-F8) and the fixtures in `tests/parity/forms/`. I did not read `apps/`, `services/`, `infra/` or any PR description or builder note.
- **Reference tasks run: 0.** Every reference comparison reuses the cached outputs and screenshots from the first run (`sejda-t1-fill.pdf`, `sejda-t2-create.pdf`, `sejda-t3-detect.pdf`, `sejda-runs.json`, `vp/sejda-*`). This run made no requests to the reference site.
- **Method:**
  - Browser: headless Playwright Chromium (`chromium.launch()`) only. Desktop runs used 1280×800 and 1280×1100. Phone runs used 390×844 and 375×812 with touch on. M12 used the five real viewports plus 375×812 and 1280×800.
  - Outputs: each one was checked with pikepdf 10.18.2 `check_pdf_syntax()`, its raw structure read with pikepdf, its annotations read with pdf.js 6.5.438, and it was rendered at 2× in pdf.js (`AnnotationMode.ENABLE`) and in PDFium (pypdfium2 5.14, forms on).
  - Glyph check: annotations flattened with qpdf (via pikepdf), then text extracted with PDFium. This proves that the drawn glyphs map back to the typed text.
  - Untouched areas: pixel diff against the source render, with widget boxes masked.
- **Evidence:** `docs/evals/cache/f16-forms/rerun/`. It holds `outputs/` (11 BerryPDF PDFs), `analysis/` (renders, screenshots, pdf.js JSON), `micro/` (side-by-side captures, reference on the left), `vp/` (viewport captures and `vp.json`), `lighthouse-mobile-{1..4}.json`, `axe-results.json` and `net-first-load.txt`. The key UI captures are also in `/mnt/project-files/designs/editor-forms/rerun-2026-11-24/`, and the side-by-sides are in `/mnt/project-files/comparisons/f16-forms/rerun-2026-11-24/`.

### Gate

| Gate | Bar | Result | Met? |
|---|---|---|---|
| Micro-checks M1–M12 | no *lose* unless the owner waived it | 8 win, 2 tie, **2 lose (M2, M12)**. Neither is a forms loss: M2 belongs to the cloud pickers work and M12 to the lead's editor-wide layout work (ownership section). Neither is waived by the owner | **no** (cross-cutting only) |
| P0 ACs | all pass | AC-230, AC-231, AC-247, AC-248 and AC-253 pass | yes |
| All ACs | ≥ 90% | **24 / 24 = 100%** | yes |
| Lighthouse mobile performance | ≥ 90 | **91** (median of the first 3 valid runs: 87 / 91 / 93; a 4th run gave 96) | yes |
| axe | no critical | 0 violations of any impact in 7 states | yes |

### AC results (re-run)

| AC | P | Result on 3fc9e65 | Pass? |
|---|---|---|---|
| AC-230 | P0 | All 13 terminal fields of `form-basic.pdf` are read as before. **form-extra.pdf (new, G-17):** the editable dropdown `city` (Ff 393216 = combo + edit) is read and its flags are kept in the output. The push button `reset` is shown and does nothing when clicked. **Note:** the editable dropdown is shown as a plain select, so the user can pick an option but can't type a new one ("Mumbai" was refused). See G-23 | pass (G-23) |
| AC-231 | P0 | `V` is written with a fresh AP for each changed field, with no `NeedAppearances`. The `code` and `signature` APs are byte-identical to the source (MD5). Each `DA` font is now in `/DR` (`/Helv`, `/BerryF1`). `street` keeps `/Border [0 0 2]` and `town` keeps `[0 0 1]`, both with `0 Tf` | pass |
| AC-232 | P1 | "Zoë Šťastná", "₹ 5,000 paid" and "Ирина 12" are drawn exactly in pdf.js and PDFium (capture `micro/04`, `05`). Flattened text extraction returns the exact strings. The font is an embedded Type0 subset `NotoSans-Regular-7098` (2,203 B). The mixed-script value "Ирина Smith" is also correct. 😀 and 東京 bring up a dialog before download: "Some characters won't print … They come out as "?"", with **Keep editing** and **Download anyway** (`micro/29`). Downloading anyway gives "?" only for those characters | pass |
| AC-233 | P1 | Typing 7 digits into `pin` keeps 6. The read-only field and the required-field nudge were not re-run; both passed in the first run, and the build changes don't touch them | pass |
| AC-234 | P1 | Structure is right for all 7 kinds. Radio `/Opt` is [student, staff, guest] with 3 widgets. **Auto size is now `0 Tf` in `DA`** for every new text, dropdown and list field. APs draw at 12 pt (multi-line comments 12 pt, list 12 pt). Checkbox and radio `DA` are empty (no `/dummy__noop`). **Border width 1 / 2 / 3 pt** appears after a border colour is picked, and 2 pt is written as `/BS /W 2` | pass |
| AC-235 | P1 | **"Repeat on all pages"** is in the Text ⋯ menu on `detect-mix.pdf`. The output has one field `ref_no` with 3 widgets on pages 1, 2 and 3 (`outputs/berry-repeat.pdf`). Name checks were not re-run (they passed in the first run) | pass |
| AC-236 | P1 | Renaming `notes` → `comments` keeps the value "Keep me". Delete was not re-run (it passed in the first run) | pass |
| AC-237 | P1 | New `Sig` draws a dashed box and "Sign here" in pdf.js and PDFium. No dialog appears | pass |
| AC-238 | P1 | 90°: the field lands where drawn and reads upright, with `MK /R 90`. **Crop box at 50, 60 (new fixture):** a box dragged at a predicted [129.5, 692.0, 258.7, 707.5] was written at exactly [129.5, 692.0, 258.7, 707.5]. 180° and 270° were not re-run (they passed in the first run). Turning the page again after placing a field still sets `/R` to the new turn, which makes the text tiny (G-24) | pass (G-24) |
| AC-239 | P1 | After a custom keyboard reorder, `/Annots` on p1 and p3 and `/Fields` follow the panel order exactly | pass |
| AC-240 | P1 | 0 non-GET requests. Detect lazy-loads `5165.*.js` and `berry-detect.*.js`. Timings including chunk load: report-form-3p 1.19 s for 3 pages (0.40 s/page), detect-mix 0.88 s | pass |
| AC-241 | P1 | Exactly 7 fields, all on page 2, with the right names and kinds. `signature` is a `Sig`. Each TU is its label | pass |
| AC-242 / 243 / 244 | P1 | detect-mix: "12 fields on 2 pages", page 2 has none, and page 3 adds only `mobile` next to the existing `phone`. The kinds are the same as in the first run (comb `pin_code`, radio `member_type`, date tooltips) | pass |
| AC-245 | P2 | Not re-run (passed in the first run) | pass |
| AC-246 / 250 | P1 | The pill reads "7 fields on 1 page". **The first "Next field" now goes to `full_name`** (G-16). Add all → Ctrl+Z → Ctrl+Shift+Z gives 7 → 0 → 7 | pass |
| AC-247 | P0 | All 11 BerryPDF outputs pass pikepdf `check_pdf_syntax()` with 0 issues: fill, glyph, tab order, create, created+filled, repeat, form-extra, detect, rot90, rot180 and edit. Every changed widget has an AP | pass |
| AC-248 | P0 | **Tab follows the custom order across pages.** With the Text tool active, the order was date_of_birth → city → full_name → address → PIN → comments → member_type (**one stop for the radio group**; arrow keys move inside it) → … → date (p1) → mobile → phone (p3), with no page buttons in between. Shift+Tab gives the exact reverse. On form-basic the radio `size` is also one stop. The download carries the values. Note: the field Tab lands on can sit under the floating view pill or top bar (G-21) | pass (G-21) |
| AC-249 | P1 | A click creates a 310×39 px field (default size) with the popover open. Shift+→ moves 20 px (10 pt at 145%). Ctrl+D → 13 fields, Delete → 12, Ctrl+Z → 13 | pass |
| AC-251 | P1 | Badges are on the canvas, and Space ↑↑ Space renumbers them at once | pass |
| AC-252 | P1 | **0 changed px outside widgets** on fill, create, detect (3 pages) and form-extra (PDFium 2×) | pass |
| AC-253 | P0 | At 1366×657: 11 rail buttons, the last one's bottom at 615 px, Form 5th. At 390×844 the dock is Text / Sign / Mark / Whiteout / Draw / More, and Form is in More. The Form strip fits (scrollWidth 390) | pass |

**Summary: 24 / 24 pass, all P0 pass.** Untested items from the first run (editable combo, push button, crop box) are now tested.

### Micro-comparison (re-run)

Reference figures are from the cached first-run evidence. The side-by-side captures are in `cache/f16-forms/rerun/micro/`, with the reference on the left.

| # | Check | BerryPDF on 3fc9e65 | Numbers | Score | Captures |
|---|---|---|---|---|---|
| M1 | Landing | Unchanged: 12 words above Open PDF | LH perf 91 median vs the reference's 66 | **win** | 01 |
| M2 | Upload start | Open PDF, drop, Ctrl+V, Blank page. **No cloud or URL source** on `/edit-pdf`. `/merge-pdf` and `/rotate-pdf` on this build have none either, so #32 is not visible on staging 3fc9e65 | n/a | **LOSE**, owned by the cloud pickers work, not forms. No owner waiver | 02 |
| M3 | Loading | First page and "11 fields" chip at once, 0 B uploaded | n/a | tie | 03 |
| M4 | Display | The page now opens at fit width (145%). The `days` list shows all 4 options (G-18). A reopened `Sig` shows one label only (G-14). The reference still draws overlapping text in read-only `code` | n/a | **win** | 03 |
| M5 | Interaction | Tab order works across pages (G-2). Radio clicks add to the group and keep values (G-10). Escape commits the name (G-11). The phone fill bar has a 48×44 Next. Open: G-21 (Tab target under the chrome), G-25 (phone bar covers the field being typed into), G-13 partly | n/a | **win** | 09, 12, 18 |
| M6 | Options | Border width and Repeat on all pages are added (G-4, G-5). Gap: an editable dropdown can't take typed values (G-23) | n/a | **win** | 06, 07, 09 |
| M7 | Processing | Download click → file: fill 1.11 s, create 1.48 s, detect 1.16 s. Detect run: 1.19 s for 3 pages | Reference: Apply → download 5.3 s (create) and 3.5 s (detect); detect 5.1 s for 1 page | **win** | 12 |
| M8 | Output fidelity | All text correct in pdf.js and PDFium, borders kept, auto size kept, 0 px changed outside widgets, check clean. The reference merges street/town, writes `V` past MaxLen and leaves `Sig` invisible. **Still worse:** file size (G-19) and small auto size for embedded-font values (G-22) | fill **28,606 vs 20,881 B (1.37×)**; create 41,861 vs 28,717 (1.46×); detect 43,446 vs 32,994 (1.32×) | **win** (on correctness; size is a sub-loss) | 04, 05, 10, 13 |
| M9 | Errors | Same as the first run, plus a pre-download missing-glyph dialog | n/a | **win** | 29 |
| M10 | Privacy and cost | 0 non-GET requests on every flow. The only extra GETs are lazy chunks and `/fonts/forms/noto-sans-forms.woff` from the same origin | n/a | **win** | — |
| M11 | Look and motion | Calm. The popover is a single row until More is opened (G-12 mostly fixed) | n/a | tie | 07 |
| M12 | First screen fit | Download visible at every viewport. **Pages area after scroll: 1280×632 90%, 1366×657 87%, 1536×730 78%, 1920×969 62%**; 390×664 93%, 375×812 91%; no sideways scroll. At 1920 the thumbnails panel is open and zoom is capped at 150%, so the page is 62% of the width | Reference after scroll: 90–92% (1280–1536), 83% (1920). Phone 46–69% with sideways overflow | **LOSE at 1536 and 1920** (win on phone, tie at 1280/1366). Still under ~80% → **editor-wide, owned by the lead, not a forms loss** (ownership section). No owner waiver | M12-* |

Totals: 8 win (M1, M4, M5, M6, M7, M8, M9, M10), 2 tie (M3, M11), 2 lose (M2, M12). Neither lose is a forms loss.

### Lighthouse and axe (re-run)

- **Lighthouse 12.8.2, mobile, empty `/edit-pdf`,** Playwright Chromium 1243. A 3rd run failed with NO_NAVSTART and was repeated.

  | Run | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | benchmarkIndex |
  |---|---|---|---|---|---|---|---|---|---|
  | 1 | 87 | 100 | 100 | 66 | 1.3 s | 2.4 s | 440 ms | 0 | 1,618 |
  | 2 | 91 | 100 | 100 | 66 | 1.3 s | 1.6 s | 370 ms | 0 | 1,592 |
  | 3 | 93 | 100 | 100 | 66 | 1.3 s | 2.2 s | 260 ms | 0 | 1,374 |
  | 4 | 96 | 100 | 100 | 66 | 1.3 s | 1.4 s | 230 ms | 0 | 1,501 |

  - **Median 91** (first 3 valid runs) and 92 across all 4. The first run's median was 84.
  - TBT is 230–440 ms, down from 520–1,340. The biggest scripting cost is `6495-*.js` at 390–519 ms. TBT belongs to the lead's editor-wide work.
  - SEO 66 comes only from `is-crawlable`, because staging is noindex.
- **Forms code on first load:** an empty editor makes 33 GET requests and 0 others (`rerun/net-first-load.txt`).
  - The forms UI chunk `3823.*.js` (37 KB) is **not** requested on first load. It holds the popover, Detect review, Repeat on all pages, Tab order chips and radio controls.
  - `3823.*.js` loads only when the Form tool is picked or a file with fields is opened. A PDF without fields loaded only the pdf.js worker and renderer.
  - Detect (`5165.*.js` and `berry-detect.*.js`) loads only on Detect.
  - Small leftovers do ship on first load in `2622.*.js` (232 KB): a ~3 KB Tab order panel module, and the missing-glyph dialog strings inside the 120 KB editor shell module. Small, but they could move into `3823`.
- **axe-core 4.14.1** (CSP bypassed only so axe could be injected). States: 1280 empty, 1280 form-basic loaded, 1280 Form tool with the popover More open, 1280 Tab order panel, 1280 Detect review, 1280 missing-glyph dialog, 390 loaded. **0 violations of any impact.** The `landmark-banner-is-top-level` issue is gone (G-20).

### Gap status (G-1 to G-20, plus new ones)

| Gap | Status | Evidence |
|---|---|---|
| G-1 non-Latin "?" | **fixed** | Exact text in both renderers and in extraction. Embedded Noto subset. The dialog lists 😀 東 京 before download (`analysis/glyph-2-download-click.png`, `micro/04`, `05`) |
| G-2 Tab order | **fixed** | Custom order across pages, radio group one stop, Shift+Tab reverse (AC-248 row). New follow-up G-21 |
| G-3 auto size | **fixed** | `DA` `0 Tf` on every new field. APs 12 pt, with no 51 pt. No `/dummy__noop` (`outputs/berry-t2-create.pdf`, `berry-t2-filled.pdf`) |
| G-4 border width | **fixed** | 1 / 2 / 3 pt buttons after a border colour is picked → `/BS /W 2` (`analysis/c-1b-border.png`) |
| G-5 Repeat on all pages | **fixed** | One field, 3 widgets on 3 pages (`outputs/berry-repeat.pdf`) |
| G-6 street/town border | **fixed** | `/Border [0 0 2]` and `[0 0 1]`, `/BS /W` matching, `MK /BC` black, `0 Tf` kept. Drawn in both renderers |
| G-7 pages' share of screen | **partly fixed, open (lead)** | 1280: 90%, 1366: 87% (was 54 / 51%). 1536: 78%, 1920: 62% (reference 90–92 / 83%) |
| G-8 cloud / URL | **open (cloud pickers)** | Not on `/edit-pdf`, `/merge-pdf` or `/rotate-pdf` on 3fc9e65 (`analysis/m2-*.png`) |
| G-9 Lighthouse / TBT | **fixed for the gate (lead)** | Median 91, TBT 230–440 ms. The forms UI chunk is lazy |
| G-10 radio creation | **fixed** | 3 clicks → one group `member_type`, `/Opt` [student, staff, guest] (`analysis/c-5-radio-3.png`) |
| G-11 Escape drops name | **fixed** | "typed_then_escape" kept after Escape |
| G-12 popover covers targets | **mostly fixed** | Single row, placed above the field. Opening More expands it over neighbouring rows (`analysis/create-text-more.png`) |
| G-13 name tags | **partly fixed** | With Form active, every field has an outline. Names show only as placeholders in empty text fields; checkbox, radio, dropdown, list and filled fields show none (`analysis/form-tool-nametags.png`) |
| G-14 double sig label | **fixed** | A reopened `Sig` shows only "Sign here" (`analysis/g14-reopened-sig.png`) |
| G-15 phone fill targets | **partly fixed** | A fill bar with a field label and a 48×44 Next appears. Targets are still 11 css px tall with no zoom, and the bar covers the field being typed into (G-25) |
| G-16 Detect polish | **fixed** | The first Next goes to `full_name`. The `signature` top is 589.9 < 593.9 checkbox bottom |
| G-17 fixtures | **fixed** | form-extra tested (AC-230, AC-238) |
| G-18 list clips "Thu" | **fixed** | The list AP is 11.7 pt and all 4 options show |
| G-19 output size | **open** | 1.32–1.46× the reference. No object streams or xref stream (0 `/ObjStm`) |
| G-20 axe banner | **fixed** | 0 violations |
| **G-21 (new, P1)** | open | When Tab moves to a field off-screen, the field is scrolled only to the viewport edge and stays under the floating chrome. From `date` (p1) to `phone` (p3) at 1280×800 it lands at top 769 / bottom 800, under the view pill. Shift+Tab back lands at top 0, under the top bar (`analysis/tab-crosspage-landed.png`). Fix: `scroll-margin` / `scroll-padding` equal to the top-bar and pill heights, or `scrollIntoView({block:'center'})` |
| **G-22 (new, P2)** | open | Auto size with the embedded Noto font gives **8.5 pt** in an 18 pt box (`street`, and a new `full_name` with "Zoë Šťastná"). In the same box with Helvetica it gives 12 pt, and the reference draws it larger (`micro/04`). Use the same auto-size rule (cap height / line gap) for both fonts |
| **G-23 (new, P1)** | open | The editable dropdown (`form-extra.pdf` `city`, Ff combo + edit) is a plain select, so typing a new value isn't possible. Use a combobox input with the options list when the Edit flag is set |
| **G-24 (P2, carried from the first-run AC-238 note)** | open | Turning a page again after placing a field resets `/R` to the new turn, so the text turns sideways into a narrow strip (`analysis/rot-side.png`, `berry-rot180.pdf`) |
| **G-25 (new, P2)** | open | On a 390 px phone, the fill bar at the top covers the field being typed into (Name row hidden, `analysis/phone-390-tap-name.png`). Either put the input itself in the bar at ≥ 16 px, or scroll the field below the bar |

### What has to happen for PASS

1. **M2:** cloud and URL sources reach the editor's upload on staging (G-8), or the owner records a written waiver here.
2. **M12:** the pages' share at 1536×730 and 1920×969 reaches the reference (≥ ~90% / 83%) (G-7, lead), or the owner records a written waiver here.
3. No forms re-run is needed for either one. Re-measure M12 with `rerun/vp/` and the viewport script method above, and check M2 on `/edit-pdf`.
4. The forms gaps G-19, G-21, G-22, G-23, G-24, G-25 and the partial G-12, G-13 and G-15 don't block, but they should be scheduled. G-21 and G-23 should come first.


---

# First run (2026-11-24 16:01–16:40 UTC, staging 341fa82)

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

## Ownership of cross-cutting gaps (lead thread, 2026-11-24 16:39 UTC)

- **M2 / G-8 (cloud and URL sources):** owned elsewhere, by the cloud pickers work (PR #32). Not a forms gap.
- **M12 / G-7 (pages' share of the screen):** this run was before PR #37 (fit width, pages panel closed below 1600 px) reached staging. Re-measure on a build that has it. If it is still under about 80%, it is editor-wide layout work for the lead, not forms.
- **Lighthouse TBT / G-9:** editor-wide chunk work, owned by the lead. For forms, the check is that the forms UI and Detect are not part of the editor's first load.
- **Re-run fixtures:** `tests/parity/forms/form-extra.pdf` adds an editable dropdown, a push button and a crop box that starts at 50, 60 (G-17). "Repeat on all pages" is offered only on files with more than one page, so check G-5 on `detect-mix.pdf` or `report-form-3p.pdf`.

## Decisions from the build (PR #40 review)

- **Non-Latin values use an embedded font subset (G-1, G-19).** Values outside WinAnsi are drawn in the merged open-licence forms font (Noto Sans, Latin, Greek, Cyrillic and Vietnamese), embedded as a subset holding only the characters the file uses. This matches the reference's output (embedded subsets) and keeps files small. The trade-off: another viewer that rebuilds a field's appearance when someone types a new non-Latin character can lack that glyph. We accept it, because full fonts would add up to about 150 kB per file, and a viewer that rebuilds appearances normally falls back to its own font. Revisit if users report it.
- **The pre-download "won't print" check uses the same font choice as the writer** (`lib/forms/coverage.ts`, with a parity unit test), so the warning lists exactly the characters that come out as "?". Characters outside every font, such as emoji, are kept in the field's value as typed. Only the drawn appearance shows "?".

## Re-run notes

- Sejda outputs and screenshots are cached in `docs/evals/cache/f16-forms/` (`sejda-t1-fill.pdf`, `sejda-t2-create.pdf`, `sejda-t3-detect.pdf`, `sejda-runs.json`). Reuse them. A re-evaluation needs no new Sejda task unless the reference changes.
- To re-check, re-run the same BerryPDF flows with the fixtures above, the pikepdf/pdf.js/PDFium checks and the viewport script. Every gap above has a reproducible check.
