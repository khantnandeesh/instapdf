# Evaluation: F4+F5 page tools (Split, Extract pages, Delete pages, Organize, Combine & reorder, Alternate & mix)

- **Current verdict (run 2, 2026-11-27, staging 763fe53): PASS.** See "Run 2" at the end. The run 1 record below is kept as it was.
- **Verdict: FAIL.** Two micro-checks are a *lose*: **M4 (document display)**, because our page thumbnails are drawn from a canvas smaller than the space they fill, so they look soft next to the reference at both 1x and 2x; and **M8 (output fidelity)**, because on the same tasks our files are 6–96% larger than the reference's (every other fidelity measure is equal or better). No owner waiver is on record. Everything else clears the bar: **109/109 ACs pass (P0 52/52)**, all 15 inherited F1 ACs run pass, Lighthouse mobile performance is 95–100 on all six pages (median 97–99 per page), and axe finds **0 violations of any impact** in 58 scans.
- To turn this into PASS: fix G-1 (thumbnail backing resolution) and G-2 (object streams), then re-run BerryPDF's side against the cached reference evidence. No new Sejda task is needed for that. Fix G-3 in the same round as well: it does not fail an AC as written, but pasting ranges into Split and pressing Enter at once gives the wrong file.
- Evaluated: 2026-11-26, 19:20–21:35 UTC, by parity-evaluator. Independent: I read only `docs/specs/f4-f5-page-tools.md`, `docs/process/mission.md` and earlier evals. I did not read any code, PR text or builder notes.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app, deployed from `main` at **4a79c2dca87f9030c468c19ff2bcf25fd82603d0**. Routes: `/split-pdf`, `/extract-pdf-pages`, `/delete-pdf-pages`, `/organize-pdf`, `/combine-reorder-pdf`, `/alternate-mix-pdf`.
- Reference: the matching reference pages (`split-pdf`, `extract-pdf-pages`, `delete-pdf-pages`, `organize-pdf`, `visually-combine-reorder-pdf` (which serves the reference's Merge page), `alternate-mix-pdf`), reached with headless Playwright only.
- Spec: 109 ACs (52 P0, 54 P1, 3 P2), plus the inherited F1/F3 ACs listed in its §0a.
- Harness: Playwright 1.63 (headless Chromium), @axe-core/playwright (axe-core 4.14.1), Lighthouse 12 CLI (mobile preset, simulated throttling). Outputs were checked with pikepdf/qpdf (`check_pdf_syntax`, outline, links, AcroForm, docinfo, object structure), pypdfium2 (text and renders) and Pillow (render diffs and composites). All fixtures were synthetic and generated in the session to the spec's §7 definitions (pdf-lib, pikepdf for the encrypted ones, Pillow for the image); no third-party content.
- Raw evidence (never in git): `/mnt/project-files/evals-cache/f4-f5-page-tools/` (`eval/` for the reference runs, Lighthouse and axe; `micro/` for the micro-comparison captures). Side-by-side captures for the owner: `/mnt/project-files/comparisons/f4-f5-page-tools/` (reference left, BerryPDF right). Hashes and observations: `docs/evals/cache/f4-f5-page-tools/manifest.json`.

## Summary against the pass bar

| Gate | Bar | Result | OK |
|---|---|---|---|
| Micro-checks M1–M12 | no *lose* unless waived | 5 win, 5 tie, **2 lose (M4, M8)** | **no** |
| P0 ACs | all pass | 52 / 52 | yes |
| All ACs | ≥ 90% | 109 / 109 (100%). Inherited subset (15 F1 ACs, plus F3 drag and options on Combine): all pass | yes |
| Lighthouse performance (mobile) | ≥ 90 | 95–100 on every run, every page (21 runs) | yes |
| axe critical issues | none | 0 critical, 0 serious, 0 moderate, 0 minor in 58 scans | yes |

## Reference runs (budget: 3 real tasks per hour, booked window 20:00–21:59 UTC)

**5 real tasks were run** (t1–t5; t6 was never started, see below), inside the booked window, never more than 3 in a clock hour or in any rolling 60 minutes. Submit times are taken from the runner's log, which writes the time just before it presses the reference's action.

| Task | §8b item | Submitted (UTC) | Input and options | Outcome |
|---|---|---|---|---|
| t1 | 1 | 2026-11-26 20:00:54 | `twelve.pdf`, Split, select-pages mode, typed `1-3,8-9,12` | ZIP with a random name (7,181 B), **4 parts covering all 12 pages**: the typed numbers are cut points. Entries named after each part's first page: `twelve-1` (1–3), `twelve-4` (4–7), `twelve-8` (8–9), `twelve-10` (10–12), stored in the order 1, 8, 10, 4. Each part keeps the bookmarks that point into it (part 4–7 has Middle → 2 with Detail → 3; part 10–12 has End → 1). Task done ~1.1 s after the action. |
| t2 | 2 | 2026-11-26 20:15:19 | `twelve.pdf` + `short.pdf` + `separator.pdf` (1 page), Alternate, defaults | `twelve_mixed.pdf`, 26 pages, 4,400 B. The one-page file repeats after every round **and once more after the last page**; leftover pages of the longer file follow in order. No outline. Done 2.54 s, download shown 3.06 s after the action. |
| t3 | 3 | 2026-11-26 20:30:15 | `twelve.pdf`, Extract, typed `9,2-3` | `twelve.pdf`, pages **9, 2, 3 in the typed order**, 1,592 B, no outline. First thumbnail 817 ms; done 2.54 s, download 3.07 s. |
| t4 | 4 | 2026-11-26 21:01:18 | `twelve.pdf`, Delete, typed `5` | `updated_twelve.pdf` (prefix added), 11 pages, 3,626 B. Outline: Intro → 1, **Middle kept with no destination**, its child Detail → 5, End → 9. First thumbnail 832 ms; done 2.53 s, download 3.06 s. |
| t5 | 5 | 2026-11-26 21:16:22 | `twelve.pdf` + `three-pages.pdf`, Organize; rotate A2 right; one blank page added with nothing selected | `three-pages_merged.pdf` (named after the *second* file, though the page form showed `twelve_merged.pdf` before the run), 16 pages, 4,478 B. The blank page went to the **front**, A4. A2 has `/Rotate 90`. Outline kept and shifted by the blank page (Intro → 2, Middle → 6 with Detail → 7, End → 11). qpdf repairs one warning: the blank page has no `/Resources` (as on Merge in F3). Done 2.55 s, download 3.08 s after the action. |
| t6 | 6 | **not started** | `big-250.pdf`, Split, every page | 21:29:28–21:30:13 UTC: the file was picked (the reference uploads on pick), every-page mode was ready with the action enabled and **no page-cap warning before the run**. My runner then refused to press the action because the rolling 60-minute window (since t3 at 20:30:15) still had 3 seconds to go. A retry after 21:30:16 was blocked by the session's permission system, so I stopped all reference work there. Whether the 200-page cap is enforced at run time is still unknown. |
| – | 4 (second half), 7 | – | Delete all pages; Split every even page card | **Not run**: §8b order put them after item 6, and reference work stopped at 21:30. Still open for a later booked slot if the lead wants it. |

Other reference traffic was observation only, with no task started: page loads, the landing timings (two sets of 3 loads per page, the second at 21:27:30–21:29:09 UTC, which I started by mistake while reading a script; 3 s between page loads, no files), one Lighthouse run per page, a no-submit dry run of the Organize task at 21:04 UTC to check selectors (both files uploaded on pick), and the refused t6 attempt (the 250-page file uploaded on pick). Actions inside a page were at least 1.3 s apart. Every run's raw log, captures and network log are in `/mnt/project-files/evals-cache/f4-f5-page-tools/eval/<task>/`.

### What the reference does (spec §8b)

1. **Split, typed `1-3, 8-9, 12` (t1).** Cut points, not one file per range: the reference splits *after* the typed pages and keeps every page, so it gives 4 files (1–3, 4–7, 8–9, 10–12). Download is one ZIP with a random name; entries are `<base>-<first page>.pdf`; each part keeps its own bookmarks, shifted to the new page numbers. Ours gives 3 files (one per range) in `twelve-split.zip` with entries `twelve-1-3.pdf`, `twelve-8-9.pdf`, `twelve-12.pdf`; bookmarks per part as in AC-433. Spec AC-426 chose this on purpose (see G-5a).
2. **Alternate, `twelve.pdf` + `short.pdf` + a one-page file (t2).** One page from each file per round; when a file runs out, the others carry on and the leftovers follow in order. A one-page file repeats every round with no setting, and also appears once more after the very last page. Output `<first file>_mixed.pdf`, no bookmarks. Ours: same rounds and leftovers, Repeat on by default for the one-page file, no trailing copy (25 pages vs 26), same name, no bookmarks (AC-525, G-5c).
3. **Extract `9, 2-3` (t3).** Typed order is kept (9, 2, 3). Output keeps the source name (`twelve.pdf`). The output has no outline, but none of the fixture's bookmark targets (pages 1, 5, 6, 10) was extracted, so this run cannot tell whether the reference keeps bookmarks on Extract. Ours sorts to 2, 3, 9 (spec decision, G-5b), same name.
4. **Delete page 5 (t4).** Output name gets an "updated" prefix (`updated_twelve.pdf`). Outline: bookmarks after the deleted page shift down by one; the bookmark whose page was deleted ("Middle") stays as a heading with no destination and keeps its child. Ours keeps the name `twelve.pdf` and removes "Middle", moving "Detail" up (AC-471, G-5d and G-5e). "Delete all pages" was not run (reference work stopped at 21:30).
5. **Organize, two files, one rotation (t5).** Output name `<file>_merged.pdf`, but it took the second file's name (`three-pages_merged.pdf`) even though the form showed the first file's name before the run, so the reference's naming is not stable. Bookmarks are kept and follow the edits. A blank page added with nothing selected goes to the front, A4 (with only A4 pages loaded this run cannot tell "size of the neighbouring page" from "always A4"); it is written without `/Resources` (qpdf warning). Ours, same task without the blank page: `twelve_organized.pdf`, 15 pages, `/Rotate 90` on page 2, outline kept (Intro → 1, Middle → 5 / Detail → 6, End → 10), qpdf clean, 6,651 B against the reference's 4,478 B for 16 pages (G-2). The `_organized` suffix is the spec's choice.
6. **Split every page on `big-250.pdf`.** Partly answered: with 250 pages loaded, the reference shows no cap warning and its action is enabled (`eval/t6-split-big/02-before-submit.png`). What happens on the run is **not known**: the task was not started (see the runs table). Ours: 250 files in `big-250-split.zip`, median 1.09 s, no cap below 1,000 pages (AC-410).
7. **Every even page card.** Not run (reference work stopped at 21:30).

## AC results

"Reference" is what the reference does for the same step (from the spec's research captures, observation and the runs above); "–" means the AC is ours only. Every output was opened and checked as the spec's §7 says.

| AC | P | Reference (Sejda) | BerryPDF staging | Pass |
|---|---|---|---|---|
| AC-400 | P0 | Tool pages; `.pdf`, multiple | All three show the tool; input `accept=".pdf,application/pdf"`, `multiple` | PASS |
| AC-401 | P0 | Split shows a separate mode screen first | Ready with 12 tiles labelled 1–12 on all three; primary bottom at 708 of 720 px; no mode screen; Split shows Every page checked and "12 pages · 12 files" | PASS |
| AC-402 | P0 | Typing does not mark tiles | `1-3, 5, 10-` presses tiles 1, 2, 3, 5, 10, 11, 12 (`aria-pressed`, per UX decision P-11.1); `-2` gives 1, 2; blur gives `1-3, 5, 10-12`; with two files `10-`, `last`, `odd` stay as typed | PASS |
| AC-403 | P0 | No feedback until the run | On all three fields: `abc` / `0` / `13` / `5-3` / `2-x` each give `aria-invalid="true"`, a message naming the item ("“5-3”: start is after end", "“13”: this file has 12 pages" …) and a disabled primary; `2` clears it | PASS |
| AC-404 | P1 | Shift/Ctrl select | Extract and Delete: 2+4 → {2,4}; 4 again → {2}; 6 then Shift+9 → 6–9; Space toggles; Ctrl+click toggles | PASS |
| AC-405 | P0 | Field reads `2-5,9` (research) | Field reads `2-5, 9` | PASS |
| AC-406 | P1 | – | Clear selection and Escape both empty tiles and field | PASS |
| AC-407 | P0 | One file per task, upgrade banner | Both files load (15 tiles), view toggle shown, no limit message, on all three | PASS |
| AC-408 | P1 | – | `1-2` picks 1–2 in both files; clicking page 3 of three-pages.pdf changes only it and the field empties with "Differs per file"; `1` then picks page 1 of each only | PASS |
| AC-409 | P1 | Checkbox, remembered pattern | Remove bookmarks off on first visit; Every N = 3, pattern `{name}~x{n}` and Remove bookmarks survive a reload | PASS |
| AC-410 | P1 | 200-page cap | big-250.pdf loads with no notice; removing page 1 gives 249 pages starting "Big 2" | PASS |
| AC-411 | P0 | Loads without prompt | No prompt on all three; Extract p1 → 1 page, Delete p1 → 2 pages, Split → 3 one-page PDFs; all unencrypted | PASS |
| AC-412 | P1 | – | Rotate result lists Merge, Split, Extract pages, Delete pages, Rotate, Organize, Combine & reorder, Alternate & mix; Delete pages opens ready with 3 tiles | PASS |
| AC-420 | P0 | 12 one-page files named `twelve-n` (research list) | More options lists 12 parts; `twelve-split.zip` with `twelve-1.pdf` … `twelve-12.pdf` in order, each 1 page "Twelve n" | PASS |
| AC-421 | P0 | Field gets 4 when chosen | N shows 2 and 6 files; N = 5 → 3 files; entries `twelve-1-5` (5), `twelve-6-10` (5), `twelve-11-12` (2), texts in order | PASS |
| AC-422 | P1 | 0 ignored silently | `0`, `-1`, `2.5`, `x`, empty: `aria-invalid`, "Use a whole number from 1", primary disabled; 12 and 20 → 1 file | PASS |
| AC-423 | P0 | Card "1, 2-3, 4-5…" (not run, see §8b.7) | 7 parts, page counts [1,2,2,2,2,2,1], first texts 1, 2, 4, 6, 8, 10, 12 | PASS |
| AC-424 | P0 | Scissors marks | Marks after 4 and 10 → field `1-4, 5-10, 11-12`, 3 parts, tiles "part 1/2/3 of 3"; entries `twelve-1-4` (4), `twelve-5-10` (6), `twelve-11-12` (2) | PASS |
| AC-425 | P1 | – | Tab from tile 4 → Enlarge → "Split after page 4" (`aria-pressed`); Space toggles it off; field `1-10, 11-12` | PASS |
| AC-426 | P0 | **Run t1: typed ranges are cut points; 4 files, every page kept** | 3 parts; tiles 4–7, 10, 11 "not in any part" and their marks hidden; entries 3 / 2 / 1 pages (Twelve 1–3, 8–9, 12) | PASS (differs from ref by design, see §8b.1) |
| AC-427 | P1 | – | `1-4, 3-6` → 2 entries: Twelve 1–4 and Twelve 3–6 | PASS |
| AC-428 | P1 | – | N = 4, toggling mark after 6 switches to Custom with `1-4, 5-6, 7-8, 9-12` | PASS |
| AC-429 | P0 | A panel listing the output file names with a count | Parts list (More options) shows "Files 3", `twelve-1-4` 1-4, `twelve-5-10` 5-10, `twelve-11-12` 11-12 = ZIP entries | PASS |
| AC-430 | P1 | Rename dialog | Rename → `intro.pdf`; `a/b` → `a-b.pdf` | PASS |
| AC-431 | P1 | Pattern field | Default `{name}-{pages}`; `{name}_part{n}` → `twelve_part1..3.pdf` | PASS |
| AC-432 | P1 | – | `{name}` → `twelve.pdf`, `twelve (2).pdf`, `twelve (3).pdf` | PASS |
| AC-433 | P0 | t1 keeps bookmarks per part | Part 1: Intro→1; part 2: Middle→1 (Detail→2), End→6; part 3: none | PASS |
| AC-434 | P1 | Discard bookmarks | No outline in any entry | PASS |
| AC-435 | P0 | – | 4 entries 595×842, 792×612, 420×595, 595×842; `/Rotate` 0,0,0,90; text "Mixed n" extractable | PASS |
| AC-436 | P0 | – | Custom `2-5` → single `twelve-2-5.pdf`, 4 pages, Twelve 2–5 | PASS |
| AC-437 | P0 | – | `berrypdf-split.zip`, 8 entries in the stated order | PASS |
| AC-438 | P1 | – | 60 entries of 20.5 KB each (1.7% of 1,196,778 B); total 1.03× | PASS |
| AC-439 | P1 | – | Every page 12 → Every N 6 → Spreads 7 → Custom 1 → Every page 12; 12 tiles throughout | PASS |
| AC-450 | P0 | – | Nothing picked, Custom checked, "Extract pages" disabled; enabled ("Extract 1 page") after one click | PASS |
| AC-451 | P0 | – | `twelve.pdf`, 5 pages: Twelve 2, 3, 4, 5, 9 | PASS |
| AC-452 | P0 | Odd clears the field (research) | Odd picks 1,3,…,11 and fills `1, 3, 5, 7, 9, 11`; output 6 pages | PASS |
| AC-453 | P0 | – | Even picks 2,…,12; output 6 pages | PASS |
| AC-454 | P1 | – | After Odd, clicking 2 adds it; Custom checked | PASS |
| AC-455 | P1 | **Run t3: output order 9, 2, 3 (typed order)** | Output Twelve 2, 3, 9; field `2-3, 9` after blur | PASS (differs from ref by design, see §8b.3) |
| AC-456 | P1 | – | All 12 clicked → 12 pages | PASS |
| AC-457 | P0 | – | `5-6, 10`: Middle→1 (Detail→2), End→3, no Intro | PASS |
| AC-458 | P1 | Discard bookmarks | No outline | PASS |
| AC-459 | P0 | – | 792×612 and 595×842, `/Rotate` 0 and 90, Mixed 2 and Mixed 4 | PASS |
| AC-460 | P1 | Single file only | `1-2` → `berrypdf-extract.zip` (2 + 2 pages); `3-5` → Twelve 3–5 and Page 3; `10-12` → notice "three-pages.pdf has none of these pages, so it's skipped." and single `twelve.pdf` (3 pages) | PASS |
| AC-461 | P1 | – | 20,532 B from 1,196,778 B (1.7%) | PASS |
| AC-462 | P1 | A name pattern built from tokens for the base name and page | `{name}-extract` → `twelve-extract.pdf` | PASS |
| AC-465 | P0 | Removed tile disappears | "Remove page 2" `aria-pressed="true"`, tile stays (struck number, trash badge); "11 of 12 pages kept"; output `twelve.pdf` 11 pages without Twelve 2 | PASS |
| AC-466 | P0 | No way back except reload | Second click unmarks; primary disabled with nothing marked | PASS |
| AC-467 | P0 | Typed interval field | `1-3, 10-` marks 1,2,3,10,11,12; output Twelve 4–9 | PASS |
| AC-468 | P0 | Field accumulates `2,4,6` | Field `2, 4, 6` | PASS |
| AC-469 | P0 | Not run on the reference (§8b.4b still open) | `1-` marks all 12, primary disabled, "Keep at least one page", status "0 of 12 pages kept" | PASS |
| AC-470 | P1 | – | 6 then Shift+9 → 6–9; Delete marks, Backspace unmarks; live region "Page 2 marked. 7 of 12 pages kept" then "Page 2 kept" | PASS |
| AC-471 | P0 | **Run t4** (see §8b.4) | Delete 5: Intro→1, Detail→5 (moved up a level), End→9 | PASS |
| AC-472 | P1 | Discard bookmarks | No outline | PASS |
| AC-473 | P0 | – | 3 pages 792×612, 420×595, 595×842; `/Rotate` 0,0,90; Mixed 2–4 | PASS |
| AC-474 | P1 | – | `1` → `berrypdf-delete.zip` (11 + 2 pages); `1-3` → primary disabled, "Keep at least one page of three-pages.pdf" | PASS |
| AC-475 | P1 | – | 20,532 B (1.7%) | PASS |
| AC-480 | P0 | Organize PDF only; Combine = Merge | All three show the tool; accept `.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff` (+ MIME types), `multiple` | PASS |
| AC-481 | P0 | Loads without prompt | No prompt; Organize 3 pages; Alternate with short.pdf 5 pages; Combine 3 pages; all unencrypted | PASS |
| AC-482 | P1 | 50-page paywall banner | 60 pages load with no notice; output 60 pages | PASS |
| AC-483 | P1 | – | 51 copies → 50 loaded (150 pages · 50 files) and "This tool takes up to 50 files at a time. We loaded the first 50. Not loaded: three-51.pdf", on all three | PASS |
| AC-490 | P0 | Pick order kept | A1–A12, B1–B3 in Pages view; no Merge options control | PASS |
| AC-491 | P0 | Selection menu | Select all → 15 selected ("15 selected" announced); Ctrl+A → 15; Select none and Escape → 0 | PASS |
| AC-492 | P0 | Invert | A1, A2 selected → invert leaves A3–B3 (13) | PASS |
| AC-493 | P0 | Reverse | B3 … A1; output Page 3, 2, 1, Twelve 12 … 1 | PASS |
| AC-494 | P0 | Consecutive reverse | A1, A4, A3, A2, A5 … | PASS |
| AC-495 | P1 | Refuses scattered | A5, A2, A3, A4, A1, A6 … | PASS |
| AC-496 | P1 | Delete ▾ keep one file | Keep only twelve.pdf → A1–A12; Undo brings B1–B3 back at the end | PASS |
| AC-497 | P1 | Delete all | Remove all → empty state with Undo; Undo restores 15 in order | PASS |
| AC-498 | P0 | A panel for picking pages from the loaded files | Picker lists 12, all "in use" except A5; picking A5 puts it last; output 15 pages ending "Twelve 5" | PASS |
| AC-499 | P0 | **Run t5**: form shows `<first>_merged.pdf`, but the output was `three-pages_merged.pdf` (second file) | `twelve_organized.pdf`, 15 pages in order, all `/Rotate 0`, not encrypted | PASS |
| AC-500 | P1 | Run t5: outline kept and shifted with the edits | After moving A12 first: Intro→2, Middle→6 (Detail→7), End→11 | PASS |
| AC-501 | P1 | No files view | Toggle shown; Files view one card "twelve.pdf, 12 pages"; after the move 2 cards (page 12; pages 1–11) | PASS |
| AC-502 | P1 | PDF only | charlie.png + twelve.pdf → 13 tiles, 13 pages, page 1 is the image | PASS |
| AC-510 | P0 | Merge page | bravo + alpha → Pages view A1 A2 A3 B1 B2 (alpha first); Options in the dock | PASS |
| AC-511 | P0 | – | Mouse drag of B1 between A1 and A2 → `alpha_merged.pdf`: Alpha 1, Bravo 1, Alpha 2, Alpha 3, Bravo 2 | PASS |
| AC-512 | P1 | – | Double-sided set on /merge-pdf is on at /combine-reorder-pdf ("Options, 1 changed"); Contents = File names gives a contents page "Contents alpha.pdf 2 bravo.pdf 5" | PASS |
| AC-513 | P1 | – | h1 "Combine & reorder PDF pages", own title and description; canonical `…/combine-reorder-pdf` (Merge: "Merge PDF", `…/merge-pdf`) | PASS |
| AC-520 | P0 | Cards without thumbnails | Two cards odd, even with thumbnails, name, "5 pages", Normal, 1 per turn; no Repeat | PASS |
| AC-521 | P0 | – | `odd_mixed.pdf`, Page 1 … Page 10 | PASS |
| AC-522 | P0 | Reverse option | Page 1 … Page 10 | PASS |
| AC-523 | P0 | Switch after N | 15 pages in the stated order | PASS |
| AC-524 | P0 | **Run t2 (3 files)**: leftovers follow | 14 pages: Twelve 1, Short 1, Twelve 2, Short 2, Twelve 3 … 12 | PASS |
| AC-525 | P0 | **Run t2: one-page file repeats every round and also trails the end** | Repeat on separator only; 14 pages, no trailing separator | PASS (differs from ref by design, see §8b.2) |
| AC-526 | P1 | No toggle | Repeat off → 13 pages | PASS |
| AC-527 | P1 | – | Separator first → 15 pages as stated | PASS |
| AC-528 | P0 | Drag cards | Drag even before odd → Page 2, 1, 4, 3 … 10, 9; Alt+ArrowUp with focus on the even card's control moves it and announces "even.pdf moved to position 1 of 2." | PASS |
| AC-529 | P1 | Sort A–Z / Z–A | A to Z → even, odd; Z to A → odd, even | PASS |
| AC-530 | P0 | No preview | "Result order" list A1 B1 … A5 B5, no drag/remove/insert controls; per turn 2 → A1 A2 B1 A3 A4 B2 A5 B3 B4 B5 | PASS |
| AC-531 | P0 | Action stays enabled | One file: "Mix PDFs" disabled, "Add one more file to mix"; enabled after even.pdf | PASS |
| AC-532 | P1 | – | `0`, `x`, empty, `1.5` → inline error, primary disabled; 99 accepted | PASS |
| AC-533 | P1 | – | 12 pages in the stated order | PASS |
| AC-534 | P1 | – | Pages 1, 3, 5, 6 keep 595×842, 792×612, 420×595, 595×842 and 0,0,0,90; no outline | PASS |
| AC-535 | P1 | – | charlie.png card shows Repeat on; 15 pages image, 1–4, image, 5–8, image, 9–12 | PASS |
| AC-536 | P0 | – | 12 entries, largest 8.4% of input, total 1.01×; 0 differing pixels vs the source pages (PDFium 72 dpi); text "Shared n"; qpdf syntax check clean | PASS |
| AC-537 | P1 | – | inherited-res split: 8.4% / 1.01×; Extract p1, Delete 2–12, Organize after removing 2–12: each 8.4% | PASS |
| AC-538 | P0 | – | Page 1 has 4 links: →3 (XYZ 0 400 0), →5 (named target rewritten to explicit), →4 (/Fit), URI unchanged; no L2 | PASS |
| AC-539 | P1 | – | Every entry has exactly one page object; entry 1 only the URI link; Delete 10 keeps L1, L3, L4, URI, no L2 | PASS |
| AC-540 | P1 | – | Extract 5–10: Middle→1 /XYZ 0 421, C [1 0 0], F 2, Count −1; Detail→2 /XYZ 0 300; End→6 /FitH 300. Organize A12 first: End→11 /FitH 300 | PASS |
| AC-541 | P1 | – | All four Split modes, Extract, Delete, Organize (one source): Title, Author, Subject, Keywords, CreationDate equal the source, `/TwoColumnRight`, Producer BerryPDF, ModDate at run time; Organize with two sources and Alternate: Producer only | PASS |
| AC-542 | P1 | – | Extract p3: field "name" = "Ada" on page 1, set to "Bo" and read back; Split `1-2, 3-12`: entry 1 no AcroForm, entry 2 has "name" | PASS |
| AC-543 | P1 | – | `last` marks page 12 and page 3; field stays `last`; outputs 11 and 2 pages without the last pages | PASS |
| AC-544 | P2 | – | `even`, `odd, 12`, `10-last`, `EVEN` pick as stated; `lst` → "“lst”: not a page number" | PASS |
| AC-545 | P2 | – | Label = accessible name: "Split into 12 files" → N 5 "Split into 3 files" → Custom `2-5` "Split into 1 file" → N 0 "Split PDF" disabled | PASS |
| AC-546 | P1 | – | Even positions selects 2, 4, …, 14; Odd 1, 3, …, 15; rotate selection right → `/Rotate 90` on output pages 2, 4, …, 14 only | PASS |
| AC-547 | P1 | – | Two-sided scan order → Front 1, Back 1, Front 2, Back 2, Front 3, Back 3 (grid and output); Undo restores | PASS |
| AC-548 | P2 | – | duplex-scan-odd → F1 B1 F2 B2 F3; with twelve + duplex and B1–B6 selected only B positions change | PASS |
| AC-549 | P1 | – | Six edits; six Ctrl+Z step back through each state to A1–A12; six redos (Ctrl+Shift+Z / Ctrl+Y) restore it; output identical before and after; a new edit clears redo; Ctrl+Z inside the move field edits the text only | PASS |
| AC-550 | P1 | – | Undo/Redo in the bar's History group (UX P-11.2), 44×44 at 390×844 and work by tap; "Undone: rotate" / "Redone: rotate" announced; 52 edits then 50 undos leave Undo enabled; history survives Files/Pages switch and Back to options; Start over clears it. Undo is enabled right after the first load because adding files is a step | PASS |

Reference differences that pass by design: AC-426 (Split typed ranges), AC-455 (Extract order) and AC-525 (Alternate trailing one-page file). The spec chose a different behaviour for each, the runs confirmed what the reference does, and G-5 lists them for a lead decision. AC-471's reference cell now holds run t4: the reference keeps the parent bookmark "Middle" as an item with no destination, with "Detail" under it; ours drops "Middle" and moves "Detail" up, as AC-471 says.

### Inherited F1/F3 ACs

Run across Split, Extract, Delete, Organize and Alternate (the shared flow), each with the fixtures named in F1's ACs; every AC below ran on at least one of them and most on all five. This is a subset of §0a's inherited list, chosen to cover each flow state; the rest were covered by F1 and F3 on the same components. Combine & reorder is the Merge component on another route; on it I ran AC-510 to AC-513 and the drag and options checks (F3 passed 80/80 on the same component).

| Inherited AC | What was checked | Result |
|---|---|---|
| F1 AC-3 | Drop a PDF on the page: it loads | PASS on all five |
| F1 AC-12, AC-13, AC-15 | `notes.txt` and `corrupt.pdf`: a message names each file and the reason, the primary stays disabled while nothing usable is loaded, a good file picked with them still loads | PASS |
| F1 AC-18 | 21 files picked: 20 load and a notice gives the cap | PASS |
| F1 AC-20 to AC-22 | `user-pw.pdf`: password dialog, wrong password message, unlock with `secret`; output not encrypted | PASS |
| F1 AC-41 | After a run, focus moves to Download | PASS |
| F1 AC-43, spec AC-412 | Continue with lists all six tools; Rotate → Delete opens ready with 3 tiles; Extract → Delete opens ready; no keep-going offer for a Split ZIP | PASS |
| F1 AC-44 | Start over empties the tool | PASS |
| F1 AC-45 | Back to options keeps every setting | PASS |
| F1 AC-49 | 375 px: no sideways scroll, primary at y 601–653, Download in view on the result | PASS |
| F1 AC-51 | Leaving with files loaded is guarded (`beforeunload` prevented) | PASS |
| F1 AC-57 | Result shows "Done on this device. Never uploaded." | PASS |
| Spec AC-510 to AC-513 plus F3 drag and options on `/combine-reorder-pdf` | Merge component on the new route: options, drag, title and remembered options are its own | PASS |

## Micro-comparison M1–M12

Desktop 1280×720 and phone 390×664 (deviceScaleFactor 1 unless stated), plus the five real viewports for M12. Timings are medians of 3 where the reference allowed it. Captures: `/mnt/project-files/evals-cache/f4-f5-page-tools/micro/` (raw) and `/mnt/project-files/comparisons/f4-f5-page-tools/` (side by side, reference left). Links below are file names in the comparisons folder.

| # | Check | Reference | BerryPDF | Numbers | Result | Captures |
|---|---|---|---|---|---|---|
| M1 | Landing | Lighthouse mobile perf 89–91; FCP 2.6–2.8 s; TTI 2.8–3.0 s. Desktop, unthrottled: upload button visible at 513–615 ms (Combine 954), its file chooser opens at 703–839 ms (Combine 1,145). 24–35 words above the action on desktop, 13–24 on phone | Lighthouse mobile perf 95–100; FCP 1.3–1.4 s; LCP 1.4–1.9 s; TTI 2.4–2.7 s; TBT 60–240 ms; CLS 0. Desktop, unthrottled: button visible at 530–578 ms, but the file chooser only opens at **965–1,004 ms** (median per page). 16–38 words above the action on desktop, 9–12 on phone | file chooser opens (median of 3): Split 779 vs 977; Extract 839 vs 1,004; Delete 703 vs 983; Organize 711 vs 965; Combine 1,145 vs 1,002; Alternate 734 vs 978 ms. A second set at 21:29 UTC: Split 625 vs 953; Extract 657 vs 959; Delete 579 vs 905; Organize 426 vs 948; Combine 974 vs 973; Alternate 827 vs 974 ms | **tie**: clearly faster to paint and to TTI under mobile throttling, but on desktop the visible button does nothing for about 0.4 s and the chooser opens ~0.2 s later than the reference on 5 of 6 pages (G-4) | `01-M1-landing-1280.png`, `02-M1-landing-375.png` |
| M2 | Upload start | Click, drop, plus cloud and URL sources under the upload button. Every file is uploaded on pick | Click, drop, paste, and Google Drive under "More ways to add files". Nothing uploaded | – | **tie**, by the F3 ruling (a working cloud picker makes M2 a tie). The Drive real pick was not re-verified here (it needs the owner's signed-in browser); it is the same shared intake F3 verified. Dropbox, OneDrive and URL are still not offered | `03-M2-M3-loaded-extract.png` |
| M3 | Loading, first thumbnail | First painted thumbnail 817 ms (Extract), 832 ms (Delete) | 827–950 ms on desktop for all six. On phone (390×664, touch) a first pass gave 1.33–1.39 s on Organize, Combine and Alternate, but a painted-pixel re-check (3 runs each) gave Extract 912/946/1,001, Organize 964/999/1,147 and Alternate 838/920/970 ms, and a second pass Extract 769/812/833, Organize 996/1,005/1,052, Alternate 910/956/959 ms: Organize and Alternate are 0.1–0.2 s slower than Extract on phones, not 0.5 s (G-11) | desktop median ~840 vs ~825 ms | **tie** (desktop equal within noise) | `03-M2-M3-loaded-extract.png` |
| M4 | Document display | Thumbnail canvas 300×424 shown at 165×226 CSS px: **1.82 device px per CSS px**, so sharp at 1x and nearly sharp at 2x (0.91 of what 2x needs) | Canvas **113×160 shown at 160×226 CSS px at 1x (0.71 px per CSS px)** and 226×320 at 2x (1.41, i.e. 0.71 of what 2x needs), on all six pages and on Rotate and Merge too (shared). Text in thumbnails is visibly blurred. Order, rotation and image orientation correct. 60-page scroll smooth: frame p50 16.7 ms, p95 16.8 ms; lazy (18 of 60 rendered) | backing px per CSS px: 1x 1.82 vs 0.71; 2x 1.82 vs 1.41 | **LOSE**: softer thumbnails at both 1x and 2x. A regression: in F3 our tiles were 113 CSS px with a 2.0 ratio; the tiles grew to 160 CSS px but the canvas did not (G-1) | `15-M4-thumbnail-sharpness.png`, `04-M4-display-organize.png` |
| M5 | Interaction | Click to select or mark, Shift/Ctrl ranges, typed ranges; drag on Organize; no undo; tiles not keyboard reachable | Same plus: typed ranges mark the tiles live, invalid items named inline, full keyboard flow, Alt+arrows and Move to position, multi-select, undo/redo history (50 steps), Reverse, Select menu | Clicks from landing to download, reference / ours: Extract 3 / 3, Delete 3 / 3, Split 3 / 3 (default mode) | **win** | `05-M5-interaction-delete.png` |
| M6 | Options | Split modes (every page, select pages, every N, even/odd cards), names, bookmarks; Extract/Delete fields and odd/even; Alternate order and pages per turn; free tier 200 pages per document (Organize and Combine 50), 3 tasks/h | Every reference option is present with the same defaults, plus a live parts list, Spreads mode, per-card Repeat, Result order preview; 1,000 pages per task, no hourly cap | – | **win** (reference limits lifted, options at parity or above) | `06-M6-options-split.png` |
| M7 | Processing | Upload, then 2.53–2.55 s from the action to task done and 3.06–3.08 s to the download button (t2–t5), ~1.1 s on the t1 split | median 0.86–0.89 s from the action to Download on every page (3 runs each; single runs 0.85–1.40 s, the first run after a load is often the slowest), with progress shown; 250-part split median 1.09 s | Extract 3.07 vs 0.88 s; Delete 3.06 vs 0.86 s; Alternate 3.06 vs 0.88 s | **win** | `07-M7-result-extract.png`, `20-M7-result-organize.png` |
| M8 | Output fidelity | Same tasks t1–t5: page count, sizes, rotation and text correct for the reference's own interpretation. Outputs: Extract 1,592 B, Delete 3,626 B, Alternate 4,400 B (26 pages), Organize 4,478 B (16 pages), Split part 1–3 1,678 B and part 8–9 1,360 B. qpdf: one repaired warning on Organize (blank page without `/Resources`), otherwise clean. Document info: creation date and creator carried over on Extract and Delete, dropped on Alternate | Same page counts, sizes, rotation and text for the same intent; rendered pages pixel-identical to the source pages (72 dpi, max difference 0 on Extract and Delete; the reference is identical too); outline mapped; qpdf clean; document info handled the same way as the reference. **Files larger**: Extract 1,835 B (+15%), Delete 5,151 B (+42%), Alternate 8,627 B with one page fewer (+96%), Organize 6,651 B with one page fewer (+49%), Split part 1–3 1,938 B (+15%) and part 8–9 1,445 B (+6%) | object structure: both use an object stream, but ours holds only a few objects in it (385 B vs 1,045 B compressed); page and font dictionaries are written as plain objects (~170 B per page) | **LOSE** on file size, the one M8 measure where we are behind (G-2). On content-heavy files the gap shrinks under 1%, but on every comparable output we were larger | `08-M8-output-split.png`, `08b-M8-output-alternate.png`, `21-M8-output-organize.png` |
| M9 | Errors and limits | Corrupt file: generic failure; restricted files handled on run; page caps 200/50 with a paywall banner on Organize over 50 pages | Named messages per file for wrong type, corrupt, password (with unlock), size, page and file caps; other files stay; actions disabled with a reason; never an upgrade prompt | – | **win** | `09-M9-errors-corrupt.png` |
| M10 | Privacy and cost | Uploads every file on pick (`/api/files/upload`), deletes later, hourly task cap | 0 non-GET requests from pick to download on all six; CSP `connect-src 'self'`; "Never uploaded" line on the result | – | **win** | `10-M10-privacy-network.png` |
| M11 | Look and motion | Plain, dense, many repeated hints | BerryPDF look, clear cards, live counts in the bar ("25 pages · 3 files"). Nit: after a mouse pick, "Add files" keeps a visible focus ring in every loaded state (same as F3 G-7) | – | **tie** (G-7) | `11-M11-look-alternate.png` |
| M12 | First screen fit | Primary in view at all five viewports once a file is in (fixed bottom bar). The page auto-scrolls past its header after a load. Delete, loaded: pages area 59/57/63/65/56% of height, 95–99% of width (1366/1280/1536/1920/390). Organize (t5, from the captures): 62/60/66/72% of height on desktop but only ~43% at 390×664, where its toolbar wraps to four rows. Split with its options panel open: 2–37% | Primary in view at all five viewports on load, loaded, enlarged and result, and while scrolling 60 pages. Loaded, pages area 56–58% (1366), 55–56% (1280), 61–62% (1536), 70–71% (1920) of height and 83–91% of width (100% at 1920). At 390×664: Split 52%, Extract **44%**, Delete 52%, Organize 60%, Combine 52%, Alternate 59%, width 85%, two tiles per row (reference: one) | height % × width %, reference vs ours. Delete 1366: 59×99 vs 58×85; Delete 390: 56×95 vs 52×85; Organize 1366: 62×93 vs 58×85; Organize 390: ~43×100 vs 60×85; Split 1366: 7×99 vs 58×85 | **tie**: same tiles per row on desktop and the height share within 1–4 points (ahead at 1920 on Delete, far ahead on Split, ahead on phone Organize), but our grid frame is ~10 points narrower; on phones we show two tiles per row where the reference shows one, but our page header, title and the in-frame add button take ~190 px before the first tile, so the height share is 4 points lower on Delete (52 vs 56) and an estimated 4–5 points lower on Extract (44 vs ~48–49, read off the spec's phone capture because the t3 fit was lost) (G-9). Close to the line: fix G-9 to make this a clear win | `12-M12-fit-1366x657-split.png`, `13-M12-fit-390x664-organize.png`, `14-M12-result-390x664-extract.png`, `16-M12-fit-390x664-delete.png`, `17-M12-fit-1366x657-delete.png`, `18-M12-fit-1366x657-organize.png`, `19-M12-fit-390x664-organize-ref-run.png` |

## Lighthouse (mobile) and axe

Lighthouse 12, mobile preset, simulated throttling, three runs per page on staging.

| Page | Perf (3 runs) | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | TTI |
|---|---|---|---|---|---|---|---|---|---|
| /split-pdf | 99 / 99 / 96 (a 4th run at 21:25 UTC: 100) | 100 | 100 | 66* | 1.3–1.4 s | 1.5–1.7 s | 100–230 ms | 0 | 2.4–2.7 s |
| /extract-pdf-pages | 100 / 99 / 98 | 100 | 100 | 66* | 1.3 s | 1.5–1.9 s | 60–110 ms | 0 | 2.4–2.6 s |
| /delete-pdf-pages | 99 / 97 / 100 | 100 | 100 | 66* | 1.3–1.4 s | 1.4–1.5 s | 90–180 ms | 0 | 2.4–2.6 s |
| /organize-pdf | 98 / 99 / 99 | 100 | 100 | 66* | 1.3–1.4 s | 1.5–1.7 s | 120–170 ms | 0 | 2.5–2.7 s |
| /combine-reorder-pdf | 97 / 95 / 97 (a 4th run at 21:24 UTC: 99) | 100 | 100 | 66* | 1.3–1.4 s | 1.4–1.8 s | 170–240 ms | 0 | 2.6–2.7 s |
| /alternate-mix-pdf | 99 / 97 / 97 (a 4th run at 21:25 UTC: 96) | 100 | 100 | 66* | 1.3 s | 1.4–1.7 s | 100–220 ms | 0 | 2.6 s |
| Reference (one run each) | 89–91 | – | – | – | 2.6–2.8 s | 2.8–3.0 s | 50–120 ms | 0 | 2.8–3.0 s |

\* The only failing SEO audit is `is-crawlable`: staging sends `x-robots-tag: noindex, nofollow` and `robots.txt` says `Disallow: /`. Expected on staging; re-check SEO = 100 on the public URL.

axe-core (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice): **0 violations of any impact** in 58 scans: on all six pages at 1280 px and 390 px (touch), the empty, loaded and result states, plus Split custom, invalid range and More options dialog, Extract odd, Delete marked and all-marked, Organize Select menu and selection, Alternate result-order preview.

### SEO audit (evidence-led, rendered pages and HTTP only)

| Item | Finding |
|---|---|
| Title | One per page, 43–52 characters, keyword first |
| Meta description | 135–155 characters, one per page |
| Canonical | `https://www.berrypdf.com/<slug>` on each page (absolute, self-referencing for production) |
| Headings | One `h1` per page with the search keyword |
| Language | `lang="en"` |
| Structured data | JSON-LD `WebApplication`, `BreadcrumbList`, `HowTo`, `FAQPage` on each page; parses |
| Social | `og:title`, `og:url`, `og:image` present |
| Sitemap | All six routes listed |
| Indexing | Staging: `noindex, nofollow` header and `Disallow: /` (correct for staging; must be absent on production) |
| Caching | HTML is served with `cache-control: s-maxage=31536000` (`x-nextjs-cache: HIT`). Fine for a static page, but a deploy must purge or revalidate the CDN copy; see G-8 |
| Security headers | CSP `default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` |

### Core Web Vitals

Field data (CrUX) does not exist for staging (noindex, no traffic), so this is lab only. Lab LCP 1.4–1.9 s (good, < 2.5 s), CLS 0 (good), TBT 60–240 ms as the INP proxy (good, < 200 ms on most runs; Combine and Split each had one run at 230–240 ms). The interaction that matters most here, the first click on "Choose PDF files", is ~0.4 s late on desktop because the button is painted before it works (G-4). Re-measure with field data once the public URL has traffic.

## Gap list (ranked by impact)

1. **G-1 (blocks PASS: M4 lose). Thumbnail resolution.** Page thumbnails are rendered to a 113×160 canvas and stretched to a 160×226 CSS tile (226×320 at 2x, still stretched), so text in thumbnails is blurred (`15-M4-thumbnail-sharpness.png`). Render each thumbnail at its displayed CSS width × devicePixelRatio (at least 160 px at 1x and 320 px at 2x for the default tile, more when the zoom slider grows tiles), and re-render on zoom or DPR change. Zooming in does re-render (one step in: 169×240 canvas for a 168 CSS px tile at 1x, so about 1.0), so the problem is the default size tier, which renders 113 px for a 160 px tile. This is shared by Rotate and Merge, where it is a regression from F3 (113 CSS px at ratio 2.0). Re-measure: canvas px / CSS px ≥ 1.0 × DPR on all eight pages.
2. **G-2 (blocks PASS: M8 lose). Output size.** Our outputs carry page and font dictionaries as plain objects; only a few objects go into the object stream. On the same tasks the reference's files are smaller: Extract 1,592 vs 1,835 B, Delete 3,626 vs 5,151 B, Alternate 4,400 vs 8,627 B, Organize 4,478 (16 pages) vs 6,651 B (15 pages). Pack every non-stream object (pages, fonts, outline items, annotations, info) into compressed object streams when saving, keep the cross-reference stream, and check no unused objects are written. Target: at or below the reference on t2, t3, t4 and t5 (fixtures `twelve.pdf`, `short.pdf`, `separator.pdf`), with qpdf still clean. Merge uses the same writer, so re-run its F3 sizes too. Keep what is already better: every output of ours checked here is qpdf clean, where the reference's Organize output needs a repair.
3. **G-3 (correctness, Split; fix before release). Custom ranges race.** On `links.pdf` (12 pages), choosing Custom, putting `1-2, 3-12` into the Parts field in one go (as a paste does) and then at once pressing Tab, Enter or the primary produced a single `links-1-12.pdf` built from the previous parts; the primary still read "Split into 1 file" at that moment. Reproduced 3 of 3 ways, in two separate sessions (6 of 6 runs). Typing the same text key by key (60 ms per key) gave the right 2 files. A user who pastes ranges and presses Enter gets the wrong output without warning. The run must use the field's current text: parse synchronously on Enter, blur and primary press (or disable the primary until the parts list matches the text). Extract and Delete do not have this race: the same fill-then-Enter and fill-then-click test gave the right pages on both. Add an e2e on Split that fills and presses Enter with no delay.
4. **G-4 (M1). Picker opens late on desktop.** The "Choose PDF files" button is visible at ~560 ms but the file chooser only opens at 965–1,004 ms (reference 703–839 ms). Make the first action work before hydration (a native file input, or a label bound to one, that the app picks up once it hydrates), so a click in the first second is never lost or late.
5. **G-5 (lead decision). Reference behaviour that we chose to differ from.** Recorded here so it is a conscious choice: (a) Split: the reference treats typed ranges as cut points and keeps every page (4 files from `1-3,8-9,12`); ours makes one file per range (3 files) and leaves the rest out, with tiles marked "not in any part". (b) Extract: the reference keeps the typed order (9, 2, 3); ours sorts to document order (2, 3, 9). (c) Alternate: the reference repeats a one-page file every round and once more after the last page; ours does not trail it. (d) Delete: the reference names the output with an "updated" prefix; ours keeps the original name (spec decision 7). (e) Delete outline: the reference keeps a parent bookmark whose page was deleted as an item with no destination; ours removes it and moves its children up (AC-471). (f) ZIP order: the reference's ZIP lists parts out of order; ours is in page order. I think (a), (c) and (f) are better as built. (b) is a real choice (some users type order on purpose): consider keeping the typed order when the user typed it, or say in the dock that output is in page order. (e): consider keeping the parent as a heading, since it keeps the document's structure.
6. **G-6 (small, Organize). Output name after reorder.** After Reverse, the output is named after the file of the new first page (`three-pages_organized.pdf`). Name it after the first file loaded, so the name doesn't change with edits.
7. **G-7 (M11 nit).** After a mouse pick, "Add files" keeps a visible focus ring in every loaded state (`11-M11-look-alternate.png`), the same nit as F3 G-7. Show the ring for keyboard focus only (`:focus-visible`), or move focus to the grid. Also, Alternate's file cards are not a focus stop themselves (moves work from the card's buttons with Alt+arrows); consider making the card focusable as on Merge.
8. **G-8 (deploy hygiene).** HTML is cached for a year at the CDN (`s-maxage=31536000`). Make sure each deploy purges or revalidates it, or lower it for HTML, so a fix round reaches users at once.
9. **G-9 (M12, close to the line).** At 390×664 the page header, title and the in-frame "Add files" row take ~190 px before the first tile, so pages get 44% of the height on Extract and 52% on Split, Delete and Combine, against the reference's ~56% on Delete. On desktop our grid sits in a padded frame 83–91% of the width (reference 93–99%) and starts ~30 px lower, so Delete and Organize get 1–4 points less height than the reference at 1280–1536. Ideas: move the add button into the toolbar row or the bottom bar on phones, trim the frame's padding and side margins, or scroll the grid to the top of the viewport after the first load (as the reference does). Target: at least the reference's share at every viewport (≥ 56% height at 390×664 on all six; ≥ 60% at 1366×657).
10. **G-10 (M2, info).** The reference also offers Dropbox, OneDrive and a link source on these pages; we offer Google Drive only. Not blocking (M2 tie by the F3 ruling); finish the Dropbox and OneDrive real-pick checks under F23.
11. **G-11 (M3, minor).** On phones (390×664, touch, painted-pixel check) the first thumbnail on Organize (median ~1.0 s) and Alternate (~0.95 s) comes 0.1–0.2 s after Extract (~0.8–0.95 s). Worth a look while fixing G-1, since thumbnail rendering changes anyway.

## Lead decisions on reference differences (G-5, 2026-11-26)

Spec §8a left decisions 6 and 12 provisional until this run. The lead keeps ours on every item, for these reasons:

- **(a) Split typed ranges stay one file per range.** A typed list such as `1-3, 8-9, 12` reads as the parts the user wants, and the tiles show each part and every page left out before the run. Cut points are still one click away: the scissors between tiles, or Every N.
- **(b) Extract keeps document order.** Extract picks a set of pages, and the tile marks show that set. Reordering is Organize's job. Typed order would make the output differ from what the tiles show.
- **(c) Alternate does not add a copy of a one-page file after the last page.** A separator after the final page is almost never wanted, and Repeat stays on by default for one-page files.
- **(d) Delete keeps the original file name** (spec decision 7, the same as Rotate and Extract).
- **(e) Delete removes a bookmark whose page is gone and moves its children up** (AC-471), so no bookmark goes nowhere.
- **(f) Split's ZIP lists parts in page order.** This is better than the reference's order.

These are recorded choices, not gaps. §8b.6 (run-time page cap), §8b.4b (Delete all pages) and §8b.7 (every even page card) stay open for a later booked slot. They don't block the verdict.

## Owner waiver

None recorded.

## Harness notes

- The reference's result screen lives in an iframe, and its auto-download link is hidden. The runner reads the page's own task-status polling and fetches the result from the URL that status reports (same browser context). The runner (`sejda.cjs`, with guards for the booked window, 3 per clock hour, 3 per rolling hour and 6 in total) and the other harness scripts are kept with the raw evidence in `/mnt/project-files/evals-cache/f4-f5-page-tools/eval/scripts/` for any refresh.
- The reference's loaded-state fit for t2 (Alternate) and t3 (Extract) was not captured (a selector bug in my fit helper, fixed from t4 on). M12 uses the t4 Delete numbers, the t5 Organize captures and the spec's research captures for the others.
- Lighthouse twice returned a run with no performance score (a runtime error in the headless browser, once on Extract and once on Combine); both runs were repeated and only complete runs are reported.
- §8b.6 (run-time page cap), the "Delete all pages" error (§8b.4, second half) and §8b.7 (every even page card) are still open; see the runs table. One booked slot covers §8b.6; §8b.4b and §8b.7 need one each.
- Fixtures and raw AC results were in the session scratchpad and are not committed; the fixtures are copied to `/mnt/project-files/evals-cache/f4-f5-page-tools/eval/fixtures/` and `mkfx.mjs` in the scripts folder regenerates them.

## Run 2 (re-evaluation after the fix round), 2026-11-27

- **Verdict: PASS.** No micro-check is a *lose* (7 win, 5 tie). **109/109 ACs pass (P0 52/52)**, plus the inherited F1 subset. Lighthouse mobile performance is 96–100 on all 18 runs. axe finds 0 violations of any impact in 54 scans. Both run 1 losses are fixed: M4 is now a tie (G-1) and M8 is now a win (G-2). G-3, G-6, G-7 and G-11 are fixed.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app. `/api/health` reports `763fe532f4f7913cd6d6d365800ce2cdf629604d`. Evaluated 2026-11-27, 01:40–02:50 UTC, by parity-evaluator. I read only the spec, the mission, this eval and the run 1 cache. I read no code, PR text or builder notes.
- **No reference tasks and no reference requests this run.** Everything is compared against the 2026-11-26 cache (`eval/`, `micro/`, manifest). Two sub-measures can't be judged from the cache and are marked "needs reference run" below. Neither one decides a check.
- Raw evidence: `/mnt/project-files/evals-cache/f4-f5-page-tools/run2/`. Side-by-side captures (reference left, from the cache): `/mnt/project-files/comparisons/f4-f5-page-tools/run2/`. Numbers and hashes: the `run2` block in `docs/evals/cache/f4-f5-page-tools/manifest.json`.
- Harness: the run 1 scripts, plus a strict pdf.js pass (pdfjs-dist legacy build, `stopAtErrors`, warnings captured, outline destinations resolved). I also added adversarial fixtures for the new compact writer (below). Note on run 1: its 60-page scroll timing scrolled the window, but the grid scrolls inside its own container on desktop. Run 2 scrolls the grid itself with wheel events.

### Summary against the pass bar (run 2)

| Gate | Bar | Run 2 result | OK |
|---|---|---|---|
| Micro-checks M1–M12 | no *lose* unless waived | 7 win, 5 tie, 0 lose | yes |
| P0 ACs | all pass | 52 / 52 | yes |
| All ACs | ≥ 90% | 109 / 109. Inherited F1 subset (drop, wrong type and corrupt, 20-file cap, password, focus to Download, Continue with, Back to options, Start over, 375 px, leave guard, "Never uploaded") all pass | yes |
| Lighthouse performance (mobile) | ≥ 90 | 96–100 on all 18 complete runs | yes |
| axe critical issues | none | 0 of any impact, 54 scans | yes |

### AC delta against run 1

Every AC was run again end to end on 763fe53, and every output was checked again (pikepdf/qpdf, PDFium text, outline, MediaBox, `/Rotate`, encryption). **No AC changed result**: 109/109 pass in both runs. The rows below are the ACs whose behaviour the fix round touched, and what run 2 measured.

| AC | P | Run 1 | Run 2 (763fe53) | Pass |
|---|---|---|---|---|
| AC-499 (text changed for G-6) | P0 | `twelve_organized.pdf`, 15 pages | No edits → `twelve_organized.pdf`, 15 pages, all `/Rotate 0`, not encrypted. After Sort → Reverse order (B3 first): still `twelve_organized.pdf`. After Keep only `three-pages.pdf`: `three-pages_organized.pdf`. Extra G-6 check: B3 moved to position 1 and rotated → still `twelve_organized.pdf` | PASS |
| AC-426, AC-436, AC-421, AC-422 (G-3 field flow) | P0/P1 | pass (typed slowly) | Same results. Also 63/63 paste-then-act runs correct (see G-3 below) | PASS |
| AC-528 (G-7 card focus) | P0 | pass | Drag and Alt+ArrowUp both give Page 2, 1, 4, 3 … 10, 9. Focus stays on "even.pdf, 5 pages" and the move is announced as "even.pdf moved to position 1 of 2." | PASS |
| AC-536 / AC-537 (writer, G-2) | P0/P1 | 8.4%, 1.01× | Unchanged: largest entry 8.4% of input, total 1.01×, max pixel diff 0, qpdf clean (shared-res and inherited-res). Extract p1 / Delete 2–12 / Organize keep A1: 44,168–44,169 B (8.4%) | PASS |
| AC-538–AC-542 (writer, G-2) | P0/P1 | pass | Unchanged: 4 links on page 1 (→3, →5, →4 /Fit, URI), no L2. One page object per Split entry. Outline colour, flags, closed state and `/FitH 300` kept. Document info and `/TwoColumnRight` copied. Form field "name" = "Ada" can be set to "Bo" | PASS |
| AC-420–AC-475, AC-480–AC-535, AC-543–AC-550 (all others) | – | pass | Pass with the same observations as the run 1 table. Selected numbers: AC-438 60 entries, largest 1.7%, total 1.02×. AC-461 20,290 B. AC-549 six undos and six redos each match the recorded states, and the output is identical. AC-550 Undo/Redo 44×44 at 390×844, "Undone: rotate" / "Redone: rotate" announced, 52 edits then 50 undos with Undo still enabled, Start over clears history | PASS |

### Micro-comparison, run 2

Same viewports and method as run 1. The reference column is the cached run 1 evidence. Captures are in `comparisons/f4-f5-page-tools/run2/`.

| # | Check | Reference (cache) | BerryPDF run 2 | Numbers | Result | Captures |
|---|---|---|---|---|---|---|
| M1 | Landing | Chooser opens 703–839 ms (Combine 1,145). Lighthouse perf 89–91 | Lighthouse perf 96–100, FCP 1.26–1.35 s, LCP 1.41–1.88 s. Chooser opens 905–1,057 ms (median of 3). 16–38 words above the action on desktop, 9–12 on phone | chooser ref vs ours: Split 779 vs 967, Extract 839 vs 993, Delete 703 vs 954, Organize 711 vs 905, Combine 1,145 vs 1,057, Alternate 734 vs 1,017 ms | **tie** (unchanged; G-4 still open, not in this fix round) | `01-M1-landing-1280.png`, `02-M1-landing-375.png` |
| M2 | Upload start | Click, drop, 3 cloud sources, link. Uploads on pick | Click, drop, paste, Google Drive. Nothing uploaded | – | **tie** (unchanged, G-10) | `03-M2-M3-loaded-extract.png` |
| M3 | First thumbnail | 817 ms (Extract), 832 ms (Delete) at 1280 | Desktop 833–944 ms (first visible canvas). Phone 390×664, painted-pixel check, median of 3: Split 780, Extract 766, Delete 777, Organize 882, Combine 843, Alternate 792 ms (run 1: Extract ~0.8–0.95 s, Organize ~1.0 s, Alternate ~0.95 s). With 4× CPU and slow 4G (150 ms RTT, 1.6 Mbps): 4.28–4.60 s on all six; CPU-only 4×: 1.1 s | desktop ~840 vs ~825 ms | **tie**. G-11 fixed: Organize is +0.12 s over Extract, and Alternate is level with it. Throttled phone: **needs reference run**, because the reference also downloads `pdf.min.js` and `pdf.worker.min.js` only after the pick (t3 network log, 20:30:05.62). See G-14 | `03-M2-M3-loaded-extract.png` |
| M4 | Document display | Canvas 300×424 at 165 CSS px: **1.82** backing px per CSS px at every DPR, so 0.91 of what 2x needs and ≤ 0.61 of what 3x needs | Backing px per CSS px on Split, Extract, Delete, Organize (pages and files), Combine (pages and files), Alternate (files and pages), Merge (files and pages) and Rotate: **1.13 at 1280@1x** (Alternate file cards 1.05; landscape and rotated tiles 1.0), **2.12 at 1280@2x**, **2.51–2.58 at 390@3x**, **2.07–2.19 at 320@2x**. Re-renders on zoom (1.02–1.10 at 1x and 2.00–2.09 at 2x across six steps). Rotated A2 is drawn landscape at the right aspect. 60 pages, wheel scroll of the grid: frame p50 16.7 ms, p95 16.8 ms, no frame over 50 ms, every tile in view drawn | Text edge energy per unit of ink (top-left of page 1): reference 1x 3.01; ours 1x 2.07 (run 1: 1.12; an ideal PDFium render at 160 px: 2.32); ours 2x 1.99 (ideal at 320 px: 2.06) | **tie** (run 1: lose). At 2x and 3x ours has more device pixels than the reference (2.12 vs 1.82, 2.5 vs 1.82), so ours is sharper on every high-DPR screen. At 1x it is no longer blurred (≥ 1 device px per CSS px; run 1 was 0.71), but its glyph edges are still a little softer than the reference's, whose rasterizer draws harder edges than even an ideal render (G-1b). Reference at 2x/3x: judged from its fixed canvas, not captured (**needs reference run** to show it, though it can't change the ratio) | `04-M4-thumbnail-sharpness.png`, `05-M4-display-organize.png` |
| M5 | Interaction | Click, modifier and typed ranges, drag on Organize. No undo. Tiles not keyboard reachable | As run 1, plus the paste-then-Enter race fixed (G-3). Alternate cards are named Tab stops with 2-D arrow keys (Left/Right step, Home/End, Down steps on phones), and Alt+arrows move | Clicks from landing to download: 3 / 3 on Extract, Delete, Split | **win** | `06-M5-interaction-delete.png` |
| M6 | Options | Free tier 200 pages per document (Organize/Combine 50), 3 tasks/h | Unchanged: all options at parity or above, 1,000 pages, no hourly cap | – | **win** | `07-M6-options-split.png` |
| M7 | Processing | 3.06–3.08 s from the action to Download (t2–t5) | Medians of 3 runs: Split 872, Extract 873, Delete 866, Organize 887, Combine 876, Alternate 868 ms. Phone medians 856–886 ms | Extract 3.07 vs 0.87 s; Delete 3.06 vs 0.87 s; Alternate 3.06 vs 0.87 s | **win** | `08-M7-result-extract.png` |
| M8 | Output fidelity | Extract 1,592 B; Delete 3,626 B; Alternate 4,400 B (26 p); Organize 4,478 B (16 p, one qpdf repair); Split parts 1,678 B (1–3) and 1,360 B (8–9) | **Every comparable output is now 24–26% smaller**: Extract 1,179 B (−26%); Delete 2,742 B (−24%); Alternate 3,249 B (25 p, −26%); Organize, same task as t5 with A2 rotated and one blank page, 16 p, 3,367 B (−25%); Split 1–3 1,265 B (−25%), 8–9 1,005 B (−26%). Every output: qpdf syntax check clean (the reference's Organize needs a repair), pdf.js strict 0 warnings (the reference's are also 0), PDFium render max pixel diff 0 against the source pages, text, sizes, `/Rotate` and outline as specified. Object streams used, 12–46 objects per file (reference 27–112) | Writer safety: three adversarial fixtures (40 pages with 9,000-byte content streams of equal length differing only in a few bytes at 40 offsets; 24 images of equal raw length, raw and Flate, each differing in one 6×6 block at 24 offsets), run through Split, Extract, Delete, Organize, Alternate, Combine and Merge. All 15 outputs (Split as 88 single-page ZIP entries) render with max diff 0 against their sources, and the text is intact: the writer merges no objects that merely look alike | **win** (run 1: lose) | `09-M8-output-extract.png`, `09-M8-output-delete.png`, `09-M8-output-alt.png`, `09-M8-output-org.png`, `09-M8-output-split.png` |
| M9 | Errors and limits | Generic failure on corrupt; paywall caps | Unchanged: named per-file messages ("notes.txt isn't a PDF, so it was skipped…", "corrupt.pdf couldn't be opened…"), password dialog with a wrong-password message and unlock, 20- and 50-file caps named, other files stay | – | **win** | `10-M9-errors.png`, `10b-M9-password-ours.png` |
| M10 | Privacy and cost | Uploads every file on pick | 0 uploads and 0 cross-origin requests in all 12 micro contexts (six tools × desktop and phone); 0 non-GET requests in the error/password flow; CSP `connect-src 'self'` | – | **win** | – |
| M11 | Look and motion | Plain, dense, many repeated hints | G-7 fixed: after a mouse pick (Choose, then Add files) "Add files" keeps focus but shows no ring (`:focus-visible` false, outline none) on all six pages; keyboard focus shows a 3 px ring | – | **win** (run 1: tie, held back only by the G-7 nit) | `11-M11-look-alternate.png`, `12-M11-G7-no-ring-after-mouse-pick.png`, `12b-M11-G7-ring-on-keyboard-focus.png` |
| M12 | First screen fit | Delete loaded: 59/57/63/65/56% of height (1366/1280/1536/1920/390); Organize ~43% at 390 | Identical to run 1 (layout not changed): primary in view at all five viewports in every state, no sideways scroll; pages 56–58% (1366), 55–56% (1280), 61–62% (1536), 70–71% (1920); at 390×664 Split 52, Extract 44, Delete 52, Organize 60, Combine 52, Alternate 59% | Delete 390: 56 vs 52; Organize 390: ~43 vs 60 | **tie** (unchanged, close to the line; G-9 still open) | `13-M12-fit-390x664-delete.png`, `14-M12-fit-1366x657-delete.png`, `15-M12-fit-1366x657-organize.png` |

### Focus items asked for this run

1. **M4 / G-1, thumbnail backing resolution: fixed.** Backing px per CSS px is 1.13 (1x), 2.12 (2x), 2.51–2.58 (390@3x) and 2.07–2.19 (320@2x), the same on all twelve views measured (Split, Extract, Delete, Organize pages/files, Combine pages/files, Alternate files/pages, Merge files/pages, Rotate). The reference is 1.82 at every DPR. The only places below 1.13 at 1x are Alternate's file cards (1.05) and landscape or rotated tiles (1.00), and all of these are at or above 1.0 × DPR.
2. **M8 / G-2, output size: fixed.** See the M8 row. Every output passed all four oracles: pikepdf `check_pdf_syntax`, PDFium text and render diff against the input pages, and strict pdf.js load with outline resolution.
3. **G-3, paste race: fixed.** On Split Custom (`links.pdf`, `1-2, 3-12`), with the field filled in one go, inserted as a paste, or replacing an earlier `1-4`; on Extract and Delete (`2-3, 9` over `1`); and on Every N (`5`, and the stepper clicked three times): Enter at once, Tab to the primary then Enter, Tab then click, and click all gave the right file in 3 of 3 runs each (63 runs in all). Two quick Enters give one run and one result.
4. **G-6: fixed** (AC-499 as rewritten, plus moving and rotating B3 to the front).
5. **G-7: fixed.** No ring after a mouse pick. Alternate cards are named Tab stops ("odd.pdf, 5 pages") with roving focus and 2-D arrow keys. At 1280 the cards sit in one row, so ArrowDown clamps to the last card, as in the page grid, and Left/Right step through every card. Merge, Combine and Organize file cards behave the same way.
6. **G-11: fixed** for the unthrottled phone case (Organize +0.12 s over Extract, Alternate level with it; run 1 had +0.1–0.2 s). Throttled phone numbers are new (no run 1 baseline): 4.3–4.6 s, dominated by downloading the PDF engine after the pick (G-14).

### Lighthouse (mobile) and axe, run 2

| Page | Perf (3 runs) | A11y | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| /split-pdf | 99 / 99 / 99 (one run returned no score, a headless runtime error as in run 1; repeated) | 100 | 100 | 66* | 1.26–1.27 s | 1.41–1.86 s | 92–135 ms | 0 |
| /extract-pdf-pages | 99 / 100 / 99 | 100 | 100 | 66* | 1.26–1.30 s | 1.49–1.67 s | 64–70 ms | 0 |
| /delete-pdf-pages | 99 / 99 / 99 | 100 | 100 | 66* | 1.26–1.28 s | 1.56–1.88 s | 54–104 ms | 0 |
| /organize-pdf | 96 / 98 / 96 | 100 | 100 | 66* | 1.34–1.35 s | 1.49–1.50 s | 148–221 ms | 0 |
| /combine-reorder-pdf | 98 / 99 / 97 | 100 | 100 | 66* | 1.27–1.35 s | 1.42–1.50 s | 107–205 ms | 0 |
| /alternate-mix-pdf | 99 / 97 / 96 | 100 | 100 | 66* | 1.34–1.35 s | 1.49–1.50 s | 128–220 ms | 0 |

\* As in run 1, the only failing SEO audit is `is-crawlable`: staging sends `x-robots-tag: noindex, nofollow` and `robots.txt` has `Disallow: /`. HTTP and SEO checks are unchanged from run 1: one title (43–52 characters), a description (135–155), a self-referencing absolute canonical, one `h1`, JSON-LD BreadcrumbList/HowTo/FAQPage, and all six routes in the sitemap. HTML still has `cache-control: s-maxage=31536000` (G-8), though `/api/health` shows the new build is the one served. Core Web Vitals: lab only (no CrUX on staging). LCP 1.41–1.88 s and CLS 0 are good. TBT, the INP proxy, is 54–221 ms; Organize, Combine and Alternate have runs just over 200 ms.

axe-core 4.14.1 (wcag2a/aa, 21a/aa, 22aa, best-practice): **0 violations of any impact** in 54 scans. That covers the six pages at 1280 and 375 px in the empty, loaded and result states, plus Split custom, invalid range and More options; Extract odd; Delete marked and all-marked; Organize Select menu and selection; and Alternate's result-order preview.

### Gap list after run 2

Fixed and verified: G-1, G-2, G-3, G-6, G-7, G-11 (unthrottled). G-5 is decided by the lead. None of the items below is a micro-check loss; they are follow-ups, not blockers.

1. **G-4 (M1, open, tie).** The chooser still opens 905–1,057 ms after navigation against the reference's 703–839 ms on 5 of 6 pages. Make the first click work before hydration (a native file input or a bound label). This is the main thing between M1 and a win.
2. **G-9 (M12, open, tie close to the line).** Numbers are unchanged from run 1. At 390×664, Extract gives pages 44% of the height (reference Delete ~56%), and Split, Delete and Combine give 52%. Fix as described in run 1 so M12 becomes a clear win.
3. **G-1b (M4, new, small).** At 1x, thumbnail glyph edges carry 2.07 units of edge energy per unit of ink against the reference's 3.01. Ours renders at 1.13× and the browser scales it down, which costs ~11% against an exact 1.0× render (2.32). Render at exactly CSS width × DPR, rounded to whole device pixels, and consider a crisper text rasterization setting for small tiles. This would make M4 a win at 1x as well as at 2x and 3x.
4. **G-14 (M3, new).** On a throttled phone (4× CPU, slow 4G), the first thumbnail takes 4.3–4.6 s because the PDF renderer and worker are fetched only after the pick, even after 8 s idle on the page (CPU-only throttling: 1.1 s). Prefetch them at idle after the page loads, or on hover/focus of "Choose PDF files". The reference fetches its engine after the pick too (and also uploads), so this is a chance to win M3 on slow phones; confirming it needs a throttled reference run.
5. **G-8 (deploy hygiene, open).** HTML is still `s-maxage=31536000`.
6. **G-10 (M2, info, open).** Dropbox, OneDrive and a link source are not offered (F23).
7. **G-15 (info, for the lead).** With nothing selected, Organize's Add pages → Blank page puts the blank page at the **end**, while the reference (t5) put it at the **front**. Ours seems more natural. This is not in G-5's decided list, so I record it as a reference difference to confirm.
8. Still open from run 1 for a later booked slot (not blocking): §8b.6 (run-time page cap), §8b.4b (Delete all pages), §8b.7 (every even page card). New "needs reference run" items: a throttled-phone M3 run and a 2x/3x M4 capture.

### Run 2 harness notes

- My tile helper first read only the first page list and the first labelled button in each list item. That made AC-407/408/460/491/492 read short or wrong lists, and an AC-412 click hit the header link instead of the Continue-with button. I fixed and re-ran them; the table above uses the re-runs. The Tab+Enter variant of the race test first timed out because Tab from a field lands on the next control (More options), not the primary. The re-run tabs to the primary.
- The adversarial fixtures are synthetic (pikepdf, generated in the session). They and their outputs are in `run2/outputs/trap/`, and the generator is `run2/scripts/trap.py`.

### Lead decision on G-15 (2026-11-27)

Keep ours: with nothing selected, Organize's blank page goes at the end. Adding after the existing content is the common convention, and a selection still places it exactly. Recorded as a decided reference difference alongside G-5; not a loss.
