# Evaluation: F3 Merge PDF

- **Verdict: FAIL.** One micro-check is a *lose*: **M2 (upload start)**. The reference offers Dropbox, Google Drive and OneDrive as ways in. We offer click, drop and paste only, and no owner waiver is on record. Everything else clears the bar: **80/80 F3 ACs pass** (P0 32/32), all 40 evaluated inherited F1 ACs pass, Lighthouse mobile performance is 97 (median of 3), and axe finds 0 violations of any impact in 18 states.
- To turn this into PASS, do one of these: (a) the owner waives M2 in writing in this file (cloud pickers are deferred as F1 D-5), or (b) ship the cloud pickers. Nothing else blocks.
- Evaluated: 2026-11-24, 03:40–04:35 UTC, by parity-evaluator (independent: I read only the spec, `docs/process/*` and earlier evals. I did not read any code, PR text or builder notes).
- Spec: `docs/specs/f3-merge.md` (80 ACs: 32 P0, 38 P1, 10 P2), plus the inherited F1 ACs listed in its §0a.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/merge-pdf
- Reference: https://www.sejda.com/merge-pdf
- Harness: Playwright 1.63 (headless Chromium), @axe-core/playwright, Lighthouse 12 CLI (mobile preset, simulated throttling). Outputs were checked with pypdf (BSD), pikepdf/qpdf (MPL/Apache) for `check_pdf_syntax`, and pypdfium2 (Apache/BSD) for text and renders. All fixtures were synthetic and generated in the session with pdf-lib and Pillow (no third-party content, no personal data). The repo has no `tests/fixtures/` folder yet, so the fixtures were built to the spec's §7 definitions.

## Summary against the pass bar

| Gate | Bar | Result | OK |
|---|---|---|---|
| Micro-checks M1–M12 | no *lose* unless waived | 10 win, 1 tie, **1 lose (M2)** | **no** |
| P0 ACs | all pass | 32 / 32 | yes |
| All ACs | ≥ 90% | 80 / 80 (100%). Inherited F1: 40 / 40 evaluated (F1 AC-46 skipped by design: it needs a test-only fault hook) | yes |
| Lighthouse performance (mobile) | ≥ 90 | 98 / 97 / 95 (median **97**) | yes |
| axe critical issues | none | 0 critical, 0 serious, 0 moderate, 0 minor in 18 states | yes |
| Real-world corpus (Q2) | once it exists | does not exist yet; n/a | – |

## Sejda runs (budget: at most 3 real tasks per hour)

**3 real merges were started.** That is the whole budget, so I ran no fourth. Only one output could be captured:

| Task | Time (UTC) | Input | Options | Outcome |
|---|---|---|---|---|
| sejda-t1 | ~03:47 | alpha, bravo, charlie.png | defaults | The merge was started, but my result-page selector missed the download (the result screen is inside an iframe). **Output not captured.** Counted against the budget. |
| sejda-t2 | 03:55 | alpha, bravo, echo | TOC = file names, footer, double-sided | Same harness miss. The result screen was seen in a screenshot (name `alpha_merged.pdf`). A later GET of the task download URL returned 404, so **no output.** Counted against the budget. |
| sejda-t3 | 04:02 | alpha, bravo, echo | TOC = file names, footer, double-sided | **Captured:** `/mnt/project-files/evals-cache/f3-merge/sejda-t3-alpha_merged.pdf` (7,229 B). Result appeared 3.2 s after "Merge PDF files" (1 s polling). |

Other Sejda traffic was observation only (page loads and uploads, no tasks): about 25 small synthetic files, which is under the free tier's 30-files-per-hour limit. Lighthouse also ran once on the reference page. Cached in `/mnt/project-files/evals-cache/f3-merge/`: the t3 output, run logs (`sejda-t2.json`, `sejda-t3.json`, `sejda-observation.json`, `lh-sejda.json`) and the reference screenshots. These are reference only and must never ship. `ours-same-task-alpha-merged.pdf` is our output for the same task as sejda-t3.

What the reference does on the first real Merge run (the spec asked the evaluator to record these items, which it marked *unverified*):

- **Output name:** `alpha_merged.pdf`, with an **underscore**. Ours is `alpha-merged.pdf`. Spec §6 says "we follow it if it differs", so see gap G-3. AC-66 as written still passes.
- **TOC:** a single page with no heading. It lists entries by **base name without the extension** ("alpha", "bravo", "echo"), uses ruled leader lines and right-aligned page numbers 3 / 7 / 9, and has one `/Link` per entry pointing to pages 3 / 7 / 9. With double-sided on, the TOC is padded with one blank page, exactly as we do.
- **Footer:** the base name without the extension at bottom left, **plus the output page number at bottom right** (for example "alpha … 3"). Ours writes the full name with its extension and no page number (our spec decision).
- **Double-sided:** pads alpha (3 pages) and echo (1 page), and also the TOC section. Its page structure is identical to ours (10 pages, starts at 3 / 7 / 9).
- **Bookmarks (Keep all):** same outline as ours, shifted by the TOC.
- **Output health:** qpdf reports 3 warnings on Sejda's file ("kid N Resources is missing or invalid; repairing"). Ours has none.

## AC results

"Ref" = observed on Sejda in this run or recorded in the spec (§9 screenshots). "–" = our decision or improvement, not compared.

| AC | Pri | Sejda result | InstaPDF result | Pass |
|---|---|---|---|---|
| AC-1 | P0 | accept = pdf, png, gif, jpg, jpeg, tif, tiff, bmp, webp; multiple | Tool page renders. `accept` has all 9 extensions plus the MIME types; `multiple` = true; no "coming soon" | PASS |
| AC-2 | P0 | sorted cards, names only | Files view; cards "alpha.pdf, 3 pages", "bravo.pdf, 2 pages"; badges A, B | PASS |
| AC-3 | P1 | natural name sort (spec obs.) | File10, file2, bravo, alpha → alpha, bravo, file2, File10 | PASS |
| AC-4 | P1 | appended (spec obs.) | bravo, echo + Add files alpha → bravo, echo, alpha | PASS |
| AC-5 | P0 | PNG shown on a portrait page | `charlie.png, 1 page` card with a rendered 160 px thumbnail; output 4 pages (PNG page 842×595) | PASS |
| AC-6 | P1 | broken.png shows as a broken-image card, Merge stays enabled | "broken.png couldn't be read as an image."; alpha stays | PASS |
| AC-7 | P2 | – | Error naming huge.png and "50 megapixels" after 200 ms; tab responsive | PASS |
| AC-8 | P2 | – | fox.tiff → card with 2 pages; output 2 pages, 1 image XObject each | PASS |
| AC-9 | P0 | drag works | Pointer drag bravo before alpha → bravo, alpha; text Bravo 1, Bravo 2, Alpha 1–3 | PASS |
| AC-10 | P0 | – (cards not focusable on Sejda: 0 tabindex elements) | Alt+ArrowRight moves alpha after bravo; focus stays on alpha; live region "alpha.pdf moved to position 2 of 2."; no history navigation; output Bravo first | PASS |
| AC-11 | P1 | – | End buttons disabled; Move later swaps | PASS |
| AC-12 | P0 | Reorder menu A–Z / Z–A | Z→A gives echo, bravo, alpha; A→Z gives alpha, bravo, echo; text order correct | PASS |
| AC-13 | P2 | date sort exists (spec obs.) | lastModified 3, 1, 2 → oldest first z1, a2, m3; newest first m3, a2, z1 | PASS |
| AC-14 | P1 | rotate buttons on cards | Thumbnail and name show "rotated 90°"; `/Rotate` [0, 0, 0, 90, 90] | PASS |
| AC-15 | P0 | remove on card | Leaves bravo, 2 pages; removing the last card returns to the drop card | PASS |
| AC-16 | P2 | – | Preview "Page 1 of 3 alpha.pdf" → Next → "Page 2 of 3" | PASS |
| AC-17 | P0 | tiles A1… (screenshot `03-pages-view`) | A1, A2, A3, B1, B2; names "A1, page 1 of alpha.pdf" … | PASS |
| AC-18 | P1 | – | Toggle shown with 1 file; 3 tiles | PASS |
| AC-19 | P0 | drag works | B1 dragged between A1 and A2 → A1, B1, A2, A3, B2; output text matches | PASS |
| AC-20 | P0 | – | Alt+Home on B2 → first; "B2 moved to position 1 of 5."; output starts with Bravo 2 | PASS |
| AC-21 | P0 | same mouse model (spec obs.) | `aria-pressed`: click A2 → [A2]; Ctrl+B1 → [A2, B1]; A3 then Shift+A1 → [A1, A2, A3]; bar "2 selected"; Clear and Escape both empty it | PASS |
| AC-22 | P1 | – | Space toggles true → false | PASS |
| AC-23 | P1 | multi-drag (spec obs.) | A1 + A3 dragged after B2 → A2, B1, B2, A1, A3 | PASS |
| AC-24 | P1 | red field, dialog stays (spec obs.) | 99, 0, x → "Enter a whole number from 1 to 5.", `aria-invalid=true`, dialog open, order unchanged; 1 → B2 first | PASS |
| AC-25 | P0 | remove page | 4 pages, no "Alpha 2" | PASS |
| AC-26 | P1 | yes/no prompt (spec obs.) | "A3 is one of 3 selected pages." Only this page → A1, A2, B1, B2. Remove all → A2, B2 | PASS |
| AC-27 | P0 | duplicate | 6 pages: Alpha 1, Alpha 1, Alpha 2, Alpha 3, Bravo 1, Bravo 2 | PASS |
| AC-28 | P1 | per-page rotate | `/Rotate` [0, 0, 0, 90, 0] | PASS |
| AC-29 | P0 | insert-point blank page | Blank tile after A3; page 4 has no text, 595×842 | PASS |
| AC-30 | P1 | Sejda inserts at the start (spec) | Nothing selected → 6th page, 792×612, blank; with A1 selected → right after A1 | PASS |
| AC-31 | P0 | picker with new letter (spec obs.) | Dialog tiles C1–C3; "Add 2 pages"; switches to Pages; output 7 pages ending Page 1, Page 3 | PASS |
| AC-32 | P1 | insert-point "add pages" | Alpha 1, Page 2, Alpha 2, … | PASS |
| AC-33 | P1 | Sejda's button stays enabled | Disabled at 0; "Add 1 page"; Select all → 3 / "Add 3 pages"; Cancel and Escape add nothing | PASS |
| AC-34 | P1 | insert-point "add files" | Alpha 1, Echo 1, Alpha 2, Alpha 3, Bravo 1, Bravo 2 | PASS |
| AC-35 | P1 | pages-view sort (spec obs.) | B1 first, then A–Z → A1, A2, A3, B1, B2 | PASS |
| AC-36 | P0 | Sejda keeps two lists | 4 cards: alpha (1 page, page 1), bravo (1, page 1), alpha (2, pages 2–3), bravo (1, page 2); Files-view and Pages-view runs give identical text | PASS |
| AC-37 | P1 | Sejda's views disagree (spec obs.) | Z–A then Pages → B1, B2, A1, A2, A3 | PASS |
| AC-38 | P0 | Sejda hides options in Pages view | TOC set from the Pages view → 6 pages, TOC on page 1 | PASS |
| AC-39 | P1 | – | Card "three-pages.pdf, 2 pages, pages 1, 3" | PASS |
| AC-40 | P0 | same defaults (Keep all / None / Merge (rename existing); 4 checkboxes off) | All four switches off; Keep all; None; Merge, rename duplicates | PASS |
| AC-41 | P0 | – | 5 pages, Alpha 1–3, Bravo 1–2; 595×842 ×3, 792×612 ×2; all `/Rotate 0`; qpdf clean | PASS |
| AC-42 | P1 | remembered (spec obs.) | After reload: File names + double-sided still on ("Options, 2 changed") | PASS |
| AC-43 | P0 | Keep all, same outline (t3) | Alpha intro→1 (child Alpha detail→2), Alpha end→3, Bravo start→4 | PASS |
| AC-44 | P0 | – | Outline empty | PASS |
| AC-45 | P0 | – | Exactly alpha→1, bravo→4, no children | PASS |
| AC-46 | P1 | – | alpha [Alpha intro [Alpha detail], Alpha end], bravo [Bravo start] | PASS |
| AC-47 | P1 | – | Bravo start→1, Alpha intro→2 (Alpha detail→3); Alpha end gone | PASS |
| AC-48 | P0 | TOC page, names without extension (t3) | 6 pages; page 1 "Contents alpha.pdf 2 bravo.pdf 5"; pages 2–6 correct | PASS |
| AC-49 | P0 | 1 link per entry (t3) | 2 `/Link` annots → pages 2 and 5 | PASS |
| AC-50 | P1 | – | "Alpha Report 2, Bravo Brief 5, echo.pdf 7" | PASS |
| AC-51 | P1 | – | Alpha 1–3, TOC (bravo.pdf 5, echo.pdf 7, no alpha), Bravo 1–2, Echo 1; 7 pages | PASS |
| AC-52 | P1 | – | 50 files → 2 TOC pages, 52 pages, all 50 names, links 3…52 correct, pages in order | PASS |
| AC-53 | P2 | – | TOC 595×842 = first content page | PASS |
| AC-54 | P0 | footer = base name + page no. (t3) | Pages 1–3 contain "alpha.pdf", 4–5 contain "bravo.pdf", original text kept | PASS |
| AC-55 | P1 | – | TOC, padding page and inserted blank carry no file name (10-page output checked) | PASS |
| AC-56 | P2 | – | Page 2 `/Rotate 90`: rendered footer box (18, 579)–(70, 587) on 842×595; horizontal, in the bottom 3% | PASS |
| AC-57 | P2 | – | Extracted footer "résumé-日本.pdf" (pdfium) | PASS |
| AC-58 | P0 | same padding (t3) | 8 pages: Alpha 1–3, blank (595×842), Bravo 1–2, Echo 1, blank (595×842) | PASS |
| AC-59 | P1 | same: starts 3 / 7 / 9, 10 pages (t3) | Starts 3 / 7 / 9, 10 pages | PASS |
| AC-60 | P0 | Sejda's option is "same size" | All widths 595; Bravo height 459.77; Bravo text extractable | PASS |
| AC-61 | P2 | – | Alpha pages 792 × 1120.78 | PASS |
| AC-62 | P0 | same default mode | name = Ann, agree = /Yes, name_2 = Ben; widgets 2 + 1 | PASS |
| AC-63 | P1 | – | Fields name (Ann, widgets on both pages), agree | PASS |
| AC-64 | P1 | – | No fields, 0 widgets | PASS |
| AC-65 | P0 | – | No fields or widgets; "Ann" on page 1 and "Ben" on page 2 | PASS |
| AC-66 | P0 | `alpha_merged.pdf` (t2, t3) | `alpha-merged.pdf`, a single PDF, not encrypted (see G-3) | PASS |
| AC-67 | P1 | PNG on a portrait page (spec) | PNG page 842×595, JPEG page 595×842; 1 image each, centred ±0, inside 36 pt; JPEG `/DCTDecode` | PASS |
| AC-68 | P0 | – | Bravo 1(0), Alpha 1(0), Alpha 1(0), Alpha 3(0), blank(0), Bravo 2(90) | PASS |
| AC-69 | P1 | – | 25,320 B ≤ 68,088 B limit; 63 pages | PASS |
| AC-70 | P1 | free tier: 30 files/h | 50 + 1 → still 50; "This tool takes up to 50 files at a time…" "Not loaded: echo.pdf" | PASS |
| AC-71 | P1 | password prompt with "use for all files" | Unlock with `test` → 6 pages, not encrypted. Order is Alpha 1–3 then Page 1–3, because §2 sorts the first batch by name (alpha < user-pw). The AC text says "Page 1–3 then Alpha 1–3", which contradicts §2 (G-6) | PASS |
| AC-72 | P1 | – | Primary enabled; "3 pages · 1 file · add more to merge" | PASS |
| AC-73 | P1 | – (no keyboard on Sejda tiles) | Keyboard only: Choose files, Alt+→ card, view radio, Alt+Home tile, Delete tile, insert point → Blank page here, picker (Space, Add 1 page), Options sheet switch, Merge, Download. Picker and sheet trap focus; Escape returns to "Options" | PASS |
| AC-74 | P1 | – | axe: 0 violations in 18 states (see below) | PASS |
| AC-75 | P1 | – | 375 px: no horizontal scroll in Files, Pages or the sheet; primary in view; 0 card or tile actions under 44×44 | PASS |
| AC-76 | P1 | – | Drag + Escape → "Move cancelled.", order kept; tile drag → "B2 moved to position 1 of 5." | PASS |
| AC-77 | P0 | – | Home card and menu entry → `/merge-pdf`, "Beta", no "Coming soon". (That F2's tests use another slug can't be seen from the UI; not verified) | PASS |
| AC-78 | P2 | – | Reverse → echo, bravo, alpha; again → restored. In Pages after AC-19: B2, A2, A3, B1, A1; output matches | PASS |
| AC-79 | P1 | – | Undo still visible at 8.2 s; restores bravo at position 2 with its rotation; 6 pages in order; focus on bravo. Pages view "Remove all" A1 + B1 → Undo restores both. A later edit clears the notice | PASS |
| AC-80 | P2 | – | "alpha.pdf was added twice / Remove the copy", 2 cards; nothing for bravo | PASS |

### Inherited F1 ACs (run on `/merge-pdf`)

All **PASS**: AC-3 (drop event), AC-4 (overlay "Drop to add files"), AC-5 (0 non-GET requests from pick to download, including a 60-page run), AC-6 (loading "Reading…"), AC-8, AC-10 (tile 160 → 168 px), AC-11 (plain Add files, no cloud entries), AC-12 (notes.txt named; message lists PDF and image types), AC-13 (corrupt.pdf), AC-14 (0-byte), AC-15, AC-16 (101 MB file rejected with "100 MB" in 45 ms), AC-17 (1,001 pages → "1,000 pages"), AC-18 adapted (51 files → 50 loaded plus a message), AC-19 (60 pages, no limit message), AC-20/21/22/24/25 (password dialog: name, focus on the masked field, wrong-password message, show/hide, skip), AC-23 (user-pw unlocked and rotated → 3 × `/Rotate 90`, not encrypted), AC-26/27 (apply-to-all checkbox; two prompts without it), AC-28 adapted (owner-restricted + alpha: no prompt, 6 pages, not encrypted), AC-29 ("This copy has no password…"), AC-38, AC-39 (progressbar seen at 4× CPU throttle), AC-41 (= AC-66), AC-43 adapted (Continue → Rotate opens `/rotate-pdf` with `three-pages-merged.pdf` loaded), AC-44, AC-45 (Back to options keeps rotations, Pages view and the footer option), AC-47, AC-48 (= AC-73), AC-51 (beforeunload), AC-52 (20 of 60 tiles rendered), AC-53 (page 60 renders in 117 ms after scrolling; rotate-all applied; output all 90), AC-54 (preview image), AC-55 (paste), AC-56 (no Share when `canShare` is missing), AC-57 (privacy note). AC-46 was skipped by design.

## Micro-comparison M1–M12

Desktop 1280×900 and phone 375×667, at deviceScaleFactor 2. Side-by-side captures: `/mnt/project-files/comparisons/merge/` (01–12). Key copies: `docs/evals/assets/f3-merge/`.

| # | Check | Sejda | InstaPDF | Result |
|---|---|---|---|---|
| M1 | Landing | LH mobile perf 91, FCP 2.6 s, LCP 2.8 s, TTI 2.8 s. 27 words above the Upload button | LH perf 97 (median), FCP 1.3 s, LCP 1.4–2.0 s, TTI 2.6 s. 36 words above "Choose files" at 1280 px, mostly the **disabled** options panel shown in the empty state | **win** (faster). See G-5 on the empty-state text |
| M2 | Upload start | Click, drop, **Dropbox, Google Drive, OneDrive** (dropdown on Upload and Add Files). Every file is uploaded | Click, drop, paste (Ctrl+V). No cloud or URL. Nothing uploaded; a file is parsed locally the moment it is chosen | **LOSE**: three ways in that the reference offers are missing (F1 D-5 deferral, no owner waiver) |
| M3 | Loading progress, first thumbnail | Placeholder canvases appear at once; first **painted** thumbnail at 852 ms (3 KB file) and 1,367 ms (8 MB file) | Cards placed in sorted slots with "Reading…"; first painted thumbnail at 600–626 ms cold and 417–669 ms after hovering "Choose files" (3 KB); 704–799 ms cold and 565–605 ms warm (8 MB) | **win** |
| M4 | Document display | Thumbnails 165 css px, canvas 300 px at DPR 2 (1.82 device px per css px); order and rotation correct | 113 css px canvas at 226 px (exactly 2.0) at DPR 2; order, rotation ("+90°") and image orientation correct; 60-page grid scroll: frame p50 16.7 ms, p95 16.8 ms; lazy (20 of 60 rendered) | **win** (sharper, smooth). Sejda's default thumbnails are larger |
| M5 | Interaction | 3 clicks (Upload, Merge, Download); drag only; thumbnails not focusable (0 tabindex); no undo | 3 clicks (Choose files, Merge PDFs, Download); drag (mouse/touch), Move earlier/later, Alt+arrows, multi-select, move-to-position, single-level undo (Ctrl+Z), Reverse order, full keyboard flow (AC-73) | **win** |
| M6 | Options | Double-sided, same size, cover, footer, 4 bookmark modes, 3 TOC modes, 4 form modes. Free tier: 50 pages / 50 MB per task, 3 tasks/h, 30 files/h | Same 7 options with the same defaults (same *width* instead of same size); 1,000 pages / 500 MB / 50 files per task, no hourly cap; options available in both views and remembered | **win** (paid-tier limits free) |
| M7 | Processing | Upload, then 3.2 s from "Merge PDF files" to Download (1 run; budget) | 855 / 862 / 869 ms (median 862 ms) for 3 files, same options; progressbar shown | **win** |
| M8 | Output fidelity | Same task (t3): 10 pages, TOC + padding, links 3 / 7 / 9, outline shifted correctly. 7,229 B. **qpdf: 3 warnings** (missing page Resources, repaired) | Identical page count, sizes, rotation, text order, links, outline. Render diff against the sources: only the footer strip differs, on both tools. 5,778 B. qpdf clean | **win**. See G-4 on how the TOC page looks |
| M9 | Errors and limits | broken.png → broken-image card, Merge stays enabled, no message. Locked PDF → password prompt | Named, dismissible messages for broken/corrupt/empty/wrong type/>100 MB/>1,000 pages/>50 MP/>50 files; the other files stay; password dialog with wrong-password message, skip and apply-to-all | **win** |
| M10 | Privacy and cost | Uploads every file (`/api/files/upload`), "deleted after 2 hours", hourly task cap | 0 non-GET requests from pick to download; "Never uploaded" note; no account or paywall | **win** |
| M11 | Look and motion | Plain, dense, help text below | BerryPDF look, quiet rise-in motion, polished trays. Nits: the phone toolbar shows **two identical "+" icon buttons**; "Add files" gets a visible focus ring after a mouse pick; the empty state shows the full disabled options panel | **tie** (G-2, G-5, G-7) |
| M12 | First screen fit | Primary visible at all 5 viewports. Pages start at y = 320 (files) / 388 (pages) on desktop and 451 at 390×664. Pages area about 39% (files) / 32% (pages) of height at 1366×657 and about 20% at 390×664 | Primary visible at all 5 viewports on load, after loading, in Pages view and on the result screen (Download at y = 315 desktop, 525 at 390×664). Pages start at y = 213 desktop / 225 at 390×664. Pages area about 58% at 1366×657 and about 56% at 390×664; grid 85% of width | **win** |

## Lighthouse (mobile) and axe

| Run | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | SI | TTI |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 98 | 100 | 100 | 66* | 1.3 s | 2.0 s | 130 ms | 0 | 1.7 s | 2.6 s |
| 2 | 97 | 100 | 100 | 66* | 1.3 s | 1.4 s | 190 ms | 0 | 1.6 s | 2.6 s |
| 3 | 95 | 100 | 100 | 66* | 1.3 s | 2.0 s | 250 ms | 0 | 1.3 s | 2.6 s |

\* The only failing SEO audit is `is-crawlable`: staging sends `x-robots-tag: noindex, nofollow` and blocks indexing in `robots.txt`. That is expected on staging. Re-check SEO = 100 on prod (SEO checklist).

axe-core (@axe-core/playwright; tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice) found **0 violations of any impact** in 9 states at 1280 px and the same 9 at 375 px (touch): empty, files view, options sheet, pages view with 2 selected, remove-selected confirm, move-to-position dialog, More menu, page picker, result.

## Gap list (ranked by impact)

1. **G-1 (blocks PASS: M2 lose).** There are no cloud sources. The reference offers Dropbox, Google Drive and OneDrive under Upload and Add Files. Ours offers click, drop and paste only. Fix: either the owner records a written waiver for M2 in this file (cloud pickers stay deferred as F1 D-5, P2), or ship at least one cloud picker (Google Drive or Dropbox) in the shared `FilePicker` source slot. This is the only blocker.
2. **G-2 (M11, phone).** At < 640 px the toolbar shows two identical outlined "+" icon buttons side by side (Add files and Add pages), next to an icon-only Sort. Spec M-3 calls for **one** "Add" menu button with a + icon *and* the word "Add" ("Files…", "Pages from a file…", "Blank page"). Users can't tell the two "+" apart. See `07-files-loaded-375.png` and `08-pages-view-375.png`.
3. **G-3 (spec §6 follow-up).** The reference names the output `alpha_merged.pdf` (underscore). Ours is `alpha-merged.pdf`. §6 says "we follow it if it differs". Either switch to the underscore form (and update AC-66) or record that the hyphen is a deliberate choice.
4. **G-4 (output polish, M8 detail).** The reference's TOC page is easier to read: bigger entries with ruled leader lines from name to page number. Ours has a small "Contents" heading and about 9–10 pt entries with a wide empty gap before the right-aligned numbers (`12-output-toc-page.png`). Consider leader dots or a rule and a larger entry size. Also consider a page number in the footer option (the reference adds one at the bottom right). Neither is in the spec, so this is a suggestion for the next option review.
5. **G-5 (M1 and M11 minimal text).** At ≥ 1024 px the empty state shows the whole options panel, disabled, beside the drop card (about 29 extra words before the first action). Once a file loads, the options collapse into an "Options" button in the bottom bar. So the layout changes between the empty and ready states. Spec M-3 also says options live in the dock column at ≥ 1024, which the ready state does not do. Pick one layout. Hiding the disabled panel until files exist would also cut the text before the action below the reference's 27 words.
6. **G-6 (spec wording).** AC-71 expects "Page 1–3 then Alpha 1–3", but §2 sorts the first batch by name, so alpha comes first. The build follows §2, which is correct. Fix the AC text so QA's test doesn't encode the wrong order.
7. **G-7 (small UX).** After a mouse pick, focus lands on the toolbar "Add files" button with a visible focus ring (see `02-files-loaded-1280.png`). After the page picker adds pages, focus goes back to "Add pages" rather than to the first inserted tile, as M-6 says ("Focus on the first new tile"). Neither breaks an AC.
8. **G-8 (info, result screen).** The reference result screen offers renaming the output (pencil icon), save to Google Drive, and more "continue" tools. Ours offers Download, Merge, Rotate, Start over and Back to options. Same as F1 G-4: hand it to the option review. The Continue list will grow as tools ship.

## Owner waiver

None recorded. If the owner waives M2 (G-1) in writing here, this evaluation becomes **PASS** with no other changes.

## Harness notes

- On Sejda, the result screen lives in an iframe (`/result`). My first two task scripts looked for "Download" in the top frame only, so those two outputs were lost even though the tasks ran. The third script searched every frame and captured the file. Future runs should reuse the frame-aware script.
- In the Sejda observation, the first "time to thumbnail" numbers (about 400 ms) were placeholder canvases. The M3 numbers above use a painted-pixel check on both sites.
- Fixtures, scripts and raw results are in the session scratchpad and are not committed. Raw AC results are in `results.json` there.
