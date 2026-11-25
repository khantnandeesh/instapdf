# Evaluation: F16 PDF editor, phase E1 (round 2)

- **Verdict: FAIL.** The only gate still failing is the micro-check gate: **M2 (upload start) is a lose**, with no owner waiver on record. Every other gate now clears: **P0 21/21**, **all ACs 60/62 (96.8%)**, Lighthouse mobile performance **96** (median of 4), and **0 critical** axe issues. M12 is no longer a lose: desktop now ties the reference and phone wins. Two ACs still fail, neither of them P0: **AC-51** (P1, editor JS over 250 KB gzip) and **AC-66** (P2, no recent images).
- Evaluated: 2026-11-25, 18:45–19:10 UTC, by parity-evaluator. This is a re-evaluation of the round-1 FAIL of 2026-11-24.
- Spec: `docs/specs/f16-pdf-editor.md` at `origin/main` `da7cede`. The E1-mapped AC set is the same as round 1: 62 judged ACs (21 P0, 37 P1, 4 P2); AC-1b is N/A in E1.
- Reference: https://www.sejda.com/pdf-editor. **New Sejda tasks run: 0.** The cached round-1 evidence (T1–T3 from 2026-11-24, within the 30-day reuse window) was reused, and sejda.com was not visited.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf
  - **Build confirmed:** `/api/health` returned `{"version":"da7cede6b7515ee5b97d7296bc5b60ed4c30967b"}` at 18:47 UTC and again at 19:09 UTC.
  - The "Deploy staging" run for `da7cede` finished at 18:47:33 UTC: Cloud Run revision `web-staging-00053-4tz`, Next build id `tLmS5w5CNZNtOZOQskqxf` (it was `F4ouSvYEVgO4VWZYJ61DL` before the deploy).
- Harness:
  - Playwright 1.63 driving Chrome headless, with touch emulation for phones and `--workers 1`.
  - Output checks: pikepdf `check_pdf_syntax`, pypdfium2 (text, char boxes, renders), @axe-core/playwright, Lighthouse 13.6 CLI (mobile).
  - Fixtures: `para-times.pdf` (the round-1 fixture, from cache), plus `ten-page.pdf`, `one-page.pdf`, `photo.png` and `photo2.png`, generated for this run.
- Raw evidence (screenshots, PDFs, network logs, axe and Lighthouse JSON, harness scripts): `/mnt/project-files/evals-cache/f16-e1-editor/round2/`

## Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | **21 / 21** (AC-48, AC-68 and AC-82 now pass; no P0 regressions) | yes |
| All ACs | at least 90% | **60 / 62 (96.8%)** | yes |
| Lighthouse performance (mobile) | at least 90 | **96** (runs: 96 / 96 / 95 / 98) | yes |
| axe critical issues | none | **0 critical**; 1 serious (unchanged from round 1); 1 minor | yes |
| Micro-checks (mission) | no "lose" unless waived | **M2 lose** (no waiver). M12 is now tie on desktop and win on phone | **no** |

By priority: **P0 21/21**, **P1 36/37**, **P2 3/4**. No owner waiver is on record. The lead's note in `f24-font-library.md` says M2 is owned by F23 (cloud pickers, behind a flag until the owner creates the OAuth apps) and is "not waived". This eval keeps the gate as briefed: no lose unless waived.

## Sejda evidence (cached, no new tasks)

The round-1 cache was reused: `sejda-t2-text-sign-lineedit.pdf`, `sejda-t3-whiteout-shapes-annots.pdf`, `sejda-t1/t2/t3.json` and their screenshots, plus the M12 reference captures. Compared with today's InstaPDF output for the same edits (`round2/out-flow-1.pdf`):

| Property | Sejda T2 / T3 (cached) | InstaPDF `da7cede` |
|---|---|---|
| Page count, size, rotation | 2, Letter, 0 / 2, Letter, 0 | 2, Letter, 0 |
| Added text | Helvetica, not embedded, no ToUnicode | Arimo subset, embedded, ToUnicode. Starts at x 72.0 pt, the click point |
| Signature | Raster image, not extractable | Caveat subset, embedded; "Alex Rao" extracts |
| Highlight / StrikeOut | No appearance stream | Appearance streams on both, and on Ink |
| Whiteout | Content path | Content path. The footer region renders pure white (min 255, against 338 dark px in the source) |
| Page 2 untouched | yes | yes (pixel diff 0 at 2x) |
| File size | 7,649 B / 4,032 B | 11,958 B (more objects in a single file) |
| qpdf | clean | clean (all 7 outputs from this run) |

## AC results

The previously failing ACs and every P0 were re-run on `da7cede`. Rows marked "carried" were not re-run this round; their round-1 PASS stands, and nothing seen this round contradicts it.

| AC | Pri | Sejda result | InstaPDF result (`da7cede`) | Pass |
|---|---|---|---|---|
| AC-1 | P0 | Uploads the file as soon as it is picked | From open through 11 edits and 5 downloads: 0 non-GET requests, largest request body 0 B, 0 cross-origin requests | PASS |
| AC-2 | P0 | n/a | CSP `connect-src 'self'`; a `fetch('https://example.com/')` from the page fails ("Failed to fetch") | PASS |
| AC-3 | P1 | Privacy copy only | carried ("0 B uploaded" chip still in the top bar and the download toast) | PASS |
| AC-4 | P0 | Free tier: 3 tasks per hour | 5 downloads in a row (805 / 227 / 199 / 206 / 175 ms); no limit, countdown or upgrade copy | PASS |
| AC-5 | P1 | n/a | carried | PASS |
| AC-6 | P0 | Upload, then first page (about 5.5 s) | First page painted 285 ms and 290 ms after the pick | PASS |
| AC-7 | P1 | Zoom | carried. The editor now opens at fit width (141% at 1280) | PASS |
| AC-8 | P1 | Thumbnails | carried | PASS |
| AC-23 | P0 | Text at the click; Helvetica, not embedded | Text starts at x 72.0 pt (clicked at 72); embedded Arimo with ToUnicode; extractable | PASS |
| AC-24 | P0 | Image move and resize | Move (+60, +39.5 px), aspect-locked corner resize (1.500 → 1.500) and Rotate 90° all reach the output (`cm 0 -1 1 0`, 267.5×178.3 pt). The rotate handle is no longer covered (round-1 gap 8 fixed) | PASS |
| AC-25 | P0 | Whiteout | Covers the footer in the output; inline "Hides content; doesn't delete it" shown with the tool | PASS |
| AC-26 | P0 | Rectangle and ellipse in content; arrow as annotation | Rectangle, ellipse, line and arrow as content paths (`c` 4, `l` 10, `S` 6, `RG` 6) | PASS |
| AC-27 | P0 | Highlight and strike without appearance streams | Highlight, StrikeOut and Ink, each with an appearance stream | PASS |
| AC-31 | P0 | Type / draw / upload; raster signature | Type (8 faces, 5 inks), Draw (pad), Upload (file input + switch). Placed typed signature is vector Caveat and extractable | PASS |
| AC-32 | P1 | Saved signatures | carried | PASS |
| AC-41 | P1 | Page actions | carried | PASS |
| AC-43 | P0 | Undo | Undo to empty and redo to full via Ctrl+Z / Ctrl+Shift+Z; buttons disable at the ends. The 100-step depth is carried from round 1 (105) | PASS |
| AC-44 | P0 | Apply (7.7 s), then a separate result page | Download in 0.2–0.8 s; stays on `/edit-pdf` with all 11 objects; repeat downloads work | PASS |
| AC-45 | P1 | n/a | "Restore 1 change from 07:04 PM?" on reopening after a reload; Restore brings the edit back (390 and 320). See gap 3 for clipping at 320 | PASS |
| AC-46 | P1 | qpdf-clean | All 7 outputs from this run are clean | PASS |
| AC-48 | P0 | Toolbar is 600 px wide on a 390 px phone and scrolls sideways | **Fixed.** Coarse pointer, 390×844 and 320×568: each of the 8 resize handles and the rotate handle has a **48×48** hit box. Hit-tested extent is 48 px wide and 45–48 px tall where neighbouring handles meet (one 42 px edge case at 320, see note). Touch grabs 20 px off centre resize (140×90 → 200×150) and rotate (to about 55°). Dock fits with no sideways scroll | PASS |
| AC-49 | P1 | n/a | carried. Toolbar role and `aria-keyshortcuts` on all tools seen | PASS |
| AC-50 | P1 | n/a | carried | PASS |
| AC-51 | P1 | n/a | **WASM timing now meets the revised AC.** `berry_engine_bg.wasm` is fetched about 450 ms after the landing `load` event at idle; with effectiveType 2g or `saveData` it waits for the pick (hovering the picker did not trigger it). Landing first-load JS is 141.8 KB gzip (≤ 150). **Editor JS is still over 250 KB gzip:** the chunks fetched on file open are 253.7 kB (`9799…js`, pdf-lib + fontkit, 239.0 kB, plus 3 small ones), and the editor chunk prefetched at idle (`6632…js`, engine loader, 99.8 kB) comes on top. That makes about 366 kB of editor JS, excluding pdf.js, fonts and WASM. Round-1 gap 6 asked for this to be trimmed under 250 KB | **FAIL** |
| AC-52 | P1 | n/a | Lighthouse mobile 96 / 96 / 95 / 98 | PASS |
| AC-54 | P0 | Toolbar scrolls away | After scrolling: desktop top bar at y 10 and tool rail at y 85 (unchanged); phone top bar at y 8 and dock at y 774 (unchanged) | PASS |
| AC-55 | P1 | Page number + actions | carried | PASS |
| AC-56 | P1 | Tooltips | carried. Name, key and a how-to line seen on Shapes and Image | PASS |
| AC-57 | P0 | n/a | After a click, the selection is "Text" in a focused textarea; typing replaces it; an empty box is removed on Esc / blur | PASS |
| AC-58 | P1 | n/a | carried | PASS |
| AC-60 | P1 | Fixed swatches | carried | PASS |
| AC-64 | P1 | None | carried | PASS |
| AC-65 | P1 | Info modals | carried | PASS |
| AC-66 | P2 | n/a | **Unchanged.** The Image tool opens the OS file picker directly, also after an image was placed; no list of recent images. Recent signatures work | **FAIL** |
| AC-67 | P1 | n/a | carried. Image ghost shows "Click to place image · Esc cancels"; Esc leaves 0 objects | PASS |
| AC-68 | P0 | n/a | **Fixed.** The Text hint now reads "Click to type, drag for a box · Esc to stop". Esc returns to Select from Text, Shapes, Mark, Draw and Whiteout, mid-drag (no object left), and from the image ghost. Every mode hint names Esc | PASS |
| AC-69 | P1 | n/a | carried | PASS |
| AC-70 | P1 | n/a | carried | PASS |
| AC-71 | P0 | Highlight boxes approximate | Highlight "quick brown" QuadPoints x 93.7–154.0 (pdfium tight glyph boxes 93.9–153.8); StrikeOut "thirty" 200.3–226.3, identical to round 1 | PASS |
| AC-72 | P1 | Fixed default | carried | PASS |
| AC-73 | P1 | n/a | carried | PASS |
| AC-78 | P1 | n/a | carried | PASS |
| AC-79 | P1 | n/a | carried | PASS |
| AC-80 | P2 | n/a | carried | PASS |
| AC-81 | P1 | n/a | "Saving…" → "Saved" chip; the session restores after a reload (see AC-45) | PASS |
| AC-82 | P0 | n/a | **Fixed.** A newly drawn rectangle, ellipse, line, arrow or whiteout takes focus. Arrows nudge 2 pt (3.76 px at 1.882 px/pt) and Shift+arrow 10 pt (18.8 px); Ctrl+D duplicates and focuses; Delete, Ctrl+Z and Ctrl+Y work without a click. Ink and highlight stay with their armed tool, as the spec's sticky rule says; once selected they nudge 1 / 10 pt, delete and undo | PASS |
| AC-83 | P0 | Sideways scroll at 390 px | `scrollWidth` 390; dock of 5 tools + More; page 374 px wide (fit width); viewport meta `width=device-width, initial-scale=1` (pinch allowed) | PASS |
| AC-84 | P1 | n/a | carried | PASS |
| AC-85 | P0 | 17 / 28 words before the action | `h1` and the whole Open PDF button are above the fold at 1280×720, 1366×768, 1440×900 (button y 229–281) and 390×844 (211–263) | PASS |
| AC-86 | P1 | n/a | carried | PASS |
| AC-87 | P0 | Initials exist | Signature / Initials switch; Initials has its own "Your initials" field with Type / Draw / Upload | PASS |
| AC-88 | P1 | n/a | Nudges seen in AC-82 (1 pt and 10 pt) | PASS |
| AC-89 | P1 | n/a | carried | PASS |
| AC-90 | P1 | n/a | carried | PASS |
| AC-91 | P1 | Helvetica | carried | PASS |
| AC-92 | P1 | n/a | Lighthouse CLS 0 in all 4 runs | PASS |
| AC-93 | P1 | n/a | carried | PASS |
| AC-94 | P1 | n/a | carried | PASS |
| AC-95 | P2 | n/a | carried | PASS |
| AC-96 | P1 | n/a | carried | PASS |
| AC-97 | P2 | White whiteout | carried | PASS |
| AC-98 | P1 | n/a | **Fixed.** At 320×568 the context strip is 267 px wide with 6 controls (Font, −, size, +, Bold, More), and the top bar and dock are 304 px. At 390×844 the strip is 305–343 px, the top bar 374 and the dock 370. No bar's `scrollWidth` exceeds its `clientWidth`; no control is clipped. The active tool shows as the More icon when it lives in More ("More tools (Shapes active)") | PASS |
| AC-1b | P0 | n/a | Not applicable in E1 (no server fallback ships) | N/A |

AC-48 note: at 320×568, the bottom edge of a handle's hit box can sit under the context strip when the object is drawn right above it (the `se` handle measured 48×45, `sw` 48×42). That's the strip's z-order, not the handle size. It's acceptable, and is listed as a minor gap.

## Phone spot-check (390×844 and 320×568)

| Check | 390×844 | 320×568 | Result |
|---|---|---|---|
| Top bar, page chip and mode hint overlap | Top bar 8–60, chip 66–102, hint 114–148: no overlap | Same layout: no overlap | pass |
| Download toast | 716–762, above the dock (774) | 426–486, above the dock (498) | pass |
| Recovery notice | 3–387 wide, under the chip, no overlap | **Notice is 384 px wide in a 320 viewport (x −32 to 352).** "Restore 1 change from…" is cut off at the left and **Discard** at the right (281–344). The page doesn't scroll sideways, and Restore still works | **fail (clipping)**, gap 3 |
| Go to page from the page chip sheet | Page 2: top at y 114 (chip bottom 102). Page 10 (last): top at y 264, end of document | Pages 2 and 10: top at y 114 | pass |
| Desktop page field jump (1280×720, 1366×657) | Pages 7, 3 and 10: top at y 116–118, below the top bar (66) | n/a | pass |

## Micro-comparison (M1–M12)

| Check | Sejda | InstaPDF | Result |
|---|---|---|---|
| M1 Landing | 17 words before the action (phone), 28 (desktop) | carried; Lighthouse 96 | win |
| M2 Upload start | Click, drop, Dropbox, Google Drive, OneDrive, Web address (URL), blank document | Open PDF, drop, paste, Blank page. **No cloud or URL source** on `/edit-pdf` at 1280 or 390, and none in `/merge-pdf` HTML either | **lose** (no owner waiver; owned by F23 per the lead's note) |
| M3 Loading | Upload, then first page (about 5.5 s) | First page in 285–290 ms; 0 B sent | win |
| M4 Display | Sharp | carried | win |
| M5 Interaction | Basic | Undo history, keyboard (focus gap now fixed), snapping | win |
| M6 Options | Free tier limited | carried | win |
| M7 Processing | 7.7 s apply to ready | 0.2–0.8 s per download | win |
| M8 Output | Helvetica not embedded, raster signature, annotations without AP | Embedded fonts, vector signature, APs on all annotations | win |
| M9 Errors | Error page | carried | win |
| M10 Privacy | Uploads on pick; 3 tasks per hour | 0 non-GET requests, 0 B uploaded | win |
| M11 Look | Toolbar 600 px on a 390 px phone, sideways scroll | carried | win |
| M12 First screen fit | Pages area after scroll: 1366×657 about 91%; 1920×969 83%. Phone 390×664 46–69% with sideways overflow | Opens at fit width. Pages area after a 60% scroll (same method as the f16-forms re-measure): 1280×632 **90.0%**, 1366×657 **90.6%**, 1536×730 **91.7%**, 1920×969 **83.6%**, 390×664 **93.0%**. As loaded: 73.5–77.1% (Sejda's 1366×657 capture as loaded: about 43%) | **tie on desktop, win on phone** (was lose on desktop) |

## Lighthouse (mobile) and axe

- Lighthouse 13.6.0, mobile, simulated throttling, empty `/edit-pdf`. 4 runs, none failed. The median is 96.

  | Run | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS |
  |---|---|---|---|---|---|---|---|---|
  | 1 | 96 | 100 | 100 | 66 | 1.1 s | 1.1 s | 230 ms | 0 |
  | 2 | 96 | 100 | 100 | 66 | 1.1 s | 1.1 s | 220 ms | 0 |
  | 3 | 95 | 100 | 100 | 66 | 1.2 s | 1.2 s | 250 ms | 0 |
  | 4 | 98 | 100 | 100 | 66 | 1.2 s | 1.2 s | 180 ms | 0 |

  SEO 66 is the expected staging noindex.
- axe was run in 9 states: landing, editor open, text selected, Mark tool, sign dialog, File menu, phone editor, phone More sheet and phone Pages sheet. Tools were also checked with the pointer resting on the tool button and with it moved away.
  - **0 critical.**
  - **Serious, unchanged from round 1:** `label-content-name-mismatch` on the active tool button while its tooltip is shown (pointer resting on it). The text inside the button ("Mark H Drag across words…") is not included in the name "Mark".
  - **Serious, transient:** `color-contrast` on `.ed-hint` while the hint is fading in. It is gone after 1.5 s, so it was not counted.
  - **Minor:** `aria-allowed-role`, because `role="spinbutton"` is set on the font size `<input>`.
  - The round-1 moderate `landmark-banner-is-top-level` no longer appears.

## Round-1 gaps: status

| Round-1 gap | Status on `da7cede` |
|---|---|
| 1 AC-48 handle hit areas | **Fixed** (48 px; rotate 48 px) |
| 2 AC-82 focus after drawing | **Fixed** |
| 3 AC-68 Text hint without Esc | **Fixed** |
| 4 M12 desktop | **Fixed** (fit width; tie) |
| 5 M2 cloud / URL import | **Open** |
| 6 AC-51 WASM early + JS at 250 KB | WASM timing **fixed** against the revised AC; JS size **open** |
| 7 AC-98 320 strip overflow | **Fixed** |
| 8 Rotate handle covered by the popover | **Fixed** (hit-test reaches the handle) |
| 9 AC-66 recent images | **Open** |
| 10 Tool options hidden while an object is selected (desktop) | **Fixed** (the Shapes kind switch stays visible with a shape selected) |
| 11 Esc order | **Fixed** (first Esc deselects, second returns to Select) |
| 12 Strike snapping takes in a neighbour word | **Fixed** (a drag from the space before "quick" marks only "quick brown") |
| 13 axe serious name mismatch | **Open**; the nested-banner moderate issue is fixed |

## Gap list (actionable, in priority order)

1. **M2 (gate blocker): no cloud or URL source on the editor's landing.** Ship the F23 cloud pickers to staging for `/edit-pdf`, or record the owner's written waiver in this file. Nothing else blocks a PASS.
2. **AC-51 (P1): editor JS is over the 250 KB gzip budget.**
   - On file open the editor fetches `9799.bee524a3c32ba431.js` (pdf-lib + fontkit, 239.0 kB gzip) plus 3 small chunks, 253.7 kB in total.
   - On top of that, the idle-prefetched editor chunk `6632.b909802994ace601.js` (99.8 kB) makes about 366 kB, excluding pdf.js, fonts and WASM.
   - U-E13 budgets pdf-lib to load on **Download intent**, not on open. Defer it, or split fontkit out, so the editor's JS stays at or under 250 KB.
3. **Recovery notice clips at 320×568.** The notice is 384 px wide (x −32 to 352). The start of "Restore 1 change from…" and most of **Discard** are off-screen. Let it wrap to two lines, or stack the buttons, below 360 px. The spec says nothing on a phone clips.
4. **AC-66 (P2): no recent images.** Before the file picker opens, show the last 5 images used on this device, each removable.
5. **axe serious:** the active tool button's tooltip text sits inside the button, so its name ("Mark") doesn't match its content. Move the tooltip out of the button (for example with `aria-describedby`), or start the name with the visible text.
6. **With Draw armed, a click on an existing ink stroke draws a new stroke instead of selecting it.** Checked by clicking the middle of a straight stroke. The spec says clicking an existing object with any tool selects it.
7. **Minor:**
   - At 390×844 the text properties strip shows 8 controls; U-E2 budgets 6 (first 5 + ⋯). It fits, so it is not an AC fail.
   - At 320×568 the context strip can sit over the lower 3–6 px of a handle's hit box.
   - `role="spinbutton"` on an `<input>` (axe minor).
   - The hint pill fails contrast during its fade-in.

## Process notes for the lead

- **AC-51 was reworded after the round-1 FAIL.** The rewording came in commit `1b30656` (PR #37, the builders' E1 polish PR): "(Revised after the E1 eval: the idle prefetch is by design…)". This eval judges the WASM timing against the revised wording on `main`. Under the round-1 wording ("not downloaded until the editor opens a file") it would still fail, because the WASM is fetched about 450 ms after the landing load with no file. Please confirm the revision was sanctioned.
  - *Lead (25 Nov): confirmed. The idle prefetch was a lead decision (U-E13, so Edit text is ready when reached), made in reviewed PR #37 and recorded in the spec with its reason. The JS-size half of AC-51 is unchanged and still binds.* The verdict does not depend on it: AC-51 fails on JS size either way, and M2 blocks.
- **Coverage:** every P0 and every round-1 failure was re-run. P1/P2 rows marked "carried" were not.
- **Harness false alarms, ruled out:**
  - A first AC-82 run that chained Esc presses between shapes showed lost focus. It was a harness artefact; isolated runs per shape pass.
  - A `Beta` badge reported "under" the hint pill is not visible in screenshots (it sits behind the editor surface), so it is not counted as an overlap.

## Where InstaPDF is better than Sejda

Unchanged from round 1, and confirmed again on `da7cede`:

- nothing is uploaded (0 non-GET requests);
- embedded, extractable fonts and a vector signature;
- appearance streams on all annotations;
- a first page in about 0.29 s and downloads in 0.2–0.8 s, against 7.7 s plus a result page;
- the editor stays open after a download.

New this round:

- the desktop opens at fit width and matches Sejda's page share;
- on phones the page fills 93% of the screen with no sideways scroll.

## Owner waiver

None on record. M2 is therefore counted as a lose.
