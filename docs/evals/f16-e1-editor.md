# Evaluation: F16 PDF editor, phase E1

- **Verdict: FAIL**
- Evaluated: 2026-11-24 (10:20–11:55 UTC) by parity-evaluator
- Spec: `docs/specs/f16-pdf-editor.md` at `ba63a9c` (E1-mapped ACs: 1–8, 23–27, 31–32, 41, 43–46, 48–52, 54–58, 60, 64–73, 78–98; AC-1b N/A in E1). That gives 62 judged ACs: 21 P0, 37 P1, 4 P2.
- Reference: https://www.sejda.com/pdf-editor
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf (deployed from `main` `ba63a9c`; Beta badge and noindex are expected)
- Harness: Playwright (headless Chromium), pikepdf (`check_pdf_syntax`), pypdfium2 (text, char boxes, renders), pypdf, pdfjs-dist 6.5.438, @axe-core/playwright, Lighthouse 12 CLI (mobile). Fixtures were generated for this eval (reportlab, Pillow, Chromium print): `para-times.pdf` (2 pages, Letter, Times 12), `ten-page.pdf`, `big-300p.pdf`, `big-500p.pdf`, `big-195mb.pdf` (197 MB, 24 pages), `scan.pdf`, `tinted.pdf` (#f6efd9 background), `deva-chrome.pdf` (Chrome print, Noto Sans Devanagari, OFL), `photo.png`, `sig.png`, `notes.txt`, `corrupt.pdf`, an empty file, plus the repo's `user-pw.pdf` (password `test`) and `owner-restricted.pdf`.
- Screenshots (both sites, 1280x720 and 390x844 at DSF 1, plus 320x568 and 1366x657 / 390x664 for M12): `/mnt/project-files/designs/editor-e1/eval/`

## Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | 18 / 21 (AC-48, AC-68, AC-82 fail) | **no** |
| All ACs | at least 90% | 56 / 62 (90.3%) | yes (barely) |
| Lighthouse performance (mobile) | at least 90 | 93 (median of 3 valid runs: 85 / 94 / 93) | yes |
| axe critical issues | none | 0 critical; 1 serious; moderate landmark issues | yes |
| Micro-checks (mission) | no "lose" unless waived | M2 lose, M12 lose on desktop | **no** |

By priority: **P0 18/21**, **P1 35/37**, **P2 3/4**. No owner waiver is on record.

## Sejda runs (budget: 3 real tasks in total for this eval)

All on 2026-11-24, UTC. Each "apply → ready" time includes Sejda's server processing plus our 1 s polling; requests stayed at or below 1 per second.

| # | Apply (UTC) | Ready | Task | Cached output | Result |
|---|---|---|---|---|---|
| T1 | 10:36:51 (upload 10:36:15) | not captured | `para-times.pdf`: add text + typed signature. Task `YK4CCN1C-202611241136` | none (`sejda-t1.json`, screenshots) | Output lost: the script turned on Sejda's auto-download, and the later GET for the file returned 404. It still counts as a task. |
| T2 | 10:42:14.4 | 10:42:22.0 (7.7 s); downloaded 10:42:22.3 | Add text + typed signature + edit line 2 "page" to "sheet". Task `BV4JF0MA-202611241142` | `cache/f16-e1-editor/sejda-t2-text-sign-lineedit.pdf` | 7,649 B. Added text is Helvetica 10 pt, **not embedded**, no ToUnicode. Signature is a 183x58 px **raster** image with SMask, so it is not extractable. The edited line moved to the end of the text order. qpdf-clean. |
| T3 | 10:50:55.0 | 10:51:02.7 (7.7 s); downloaded 10:51:03.1 | Whiteout over footer, rectangle, ellipse, arrow, highlight "quick brown", strike "thirty", freehand. Task `WVWUAKX2-202611241150` | `cache/f16-e1-editor/sejda-t3-whiteout-shapes-annots.pdf` | 4,032 B. Whiteout, rectangle and ellipse are in the content stream. Arrow is a Line annotation. Highlight and StrikeOut have **no appearance stream**; Ink has one. |

Same tasks on InstaPDF (cached as `ours-same-task-o1-text-sign-lineedit.pdf` and `ours-same-task-o2-whiteout-shapes-annots.pdf`):

- O1 (= T2), 8,279 B, built in about 1.18 s in the tab, 0 non-GET requests:
  - Added text is an embedded Arimo subset with ToUnicode, 12 pt (follows nearby text).
  - The signature is vector Caveat text, embedded; "Alex Rao" is extractable.
  - The line edit changed "page" to "sheet" and kept the reading order.
  - Added text is at the click point on both sites (x 72.0 for us, 72.1 for Sejda).
- O2 (= T3), 6,047 B. Whiteout, shapes and arrow are content paths. Highlight, StrikeOut and Ink all have appearance streams.
- Pixel diff at 2x of the untouched regions is 0 on both sites, and page 2 is identical on both.

Upload-only visits (no apply) were used to read Sejda's controls, its upload sources and its first-screen layout.

## AC results

| AC | Pri | Sejda result | InstaPDF result | Pass |
|---|---|---|---|---|
| AC-1 | P0 | Uploads the file as soon as it is picked | 0 non-GET requests, largest request body 0 B, single origin through open, edit and download | PASS |
| AC-2 | P0 | n/a | CSP `connect-src 'self'`; a test cross-origin fetch is blocked | PASS |
| AC-3 | P1 | Privacy copy only | "0 B uploaded" chip; popover; "How to check" goes to `/privacy#files` | PASS |
| AC-4 | P0 | Free tier: 3 tasks per hour | 5 downloads in 9 s; no counter or limit copy anywhere | PASS |
| AC-5 | P1 | n/a | 300 pages open in 3.5 s; virtualised list; no limit toast | PASS |
| AC-6 | P0 | Upload, then first page (about 5.5 s) | First page median 239 ms | PASS |
| AC-7 | P1 | Zoom | 50/100/200% with 0 overlay drift; Ctrl+wheel; pinch; consistent at DPR 1.25 | PASS |
| AC-8 | P1 | Thumbnails | Thumbnail jump in about 1.2 s (smooth scroll); page field follows | PASS |
| AC-23 | P0 | Text added at the click; Helvetica, not embedded | Text at the click point ±0.1 pt; embedded Arimo with ToUnicode; extractable | PASS |
| AC-24 | P0 | Image move and resize | Move, aspect-locked corner resize and Rotate 90° all reach the output. Gap 3 below (free-rotate handle covered) | PASS |
| AC-25 | P0 | Whiteout | Fill, border colour and width; inline "Hides content; doesn't delete it" | PASS |
| AC-26 | P0 | Rectangle, ellipse in content; arrow as annotation | Rectangle, ellipse, line, arrow as content paths with stroke and fill colour (6 paths, `rg`/`RG` checked) | PASS |
| AC-27 | P0 | Highlight and strike have no appearance stream | Highlight, underline (96.3–119, blue), strike, pen, marker (CA 0.4), all with appearance streams | PASS |
| AC-31 | P0 | Type / draw / upload; signature saved as a raster image | 8 faces, 5 inks; drawn signature as a path; upload with Remove background (SMask); place and resize | PASS |
| AC-32 | P1 | Saved signatures | IndexedDB `berrypdf-editor`; persists across tabs; each removable; clear from this device | PASS |
| AC-41 | P1 | Page actions | Displayed orientation matches the output; delete shows an undo toast | PASS |
| AC-43 | P0 | Undo | 105 history items; 105 undos; redo | PASS |
| AC-44 | P0 | Apply (7.7 s), then a separate result page | Download in 1.15 s; stays in the editor; second download works | PASS |
| AC-45 | P1 | n/a | "Restore 2 changes from 11:28 AM?" banner, non-blocking; restored | PASS |
| AC-46 | P1 | qpdf-clean | All 45 outputs clean in qpdf, PDFium and pdf.js | PASS |
| AC-48 | P0 | Toolbar is 600 px wide on a 390 px phone and scrolls sideways | Toolbar fits and tools work by touch, but **coarse-pointer handle hit areas are 42 px** (`::before` 42 px, inset -16 px) and **the rotate handle is 36 px**. Spec: ≥ 44 px | **FAIL** |
| AC-49 | P1 | n/a | Toolbar role, 9 tool shortcuts (V E T S H P R I W), named objects, Objects list; axe 0 critical | PASS |
| AC-50 | P1 | n/a | No motion under `prefers-reduced-motion` | PASS |
| AC-51 | P1 | n/a | **`berry_engine_bg.wasm` (564 KB) downloads 2.2 s after the landing page loads, with no file opened.** Editor route JS 233–254 KB gzip (at the 250 KB line) | **FAIL** |
| AC-52 | P1 | n/a | Lighthouse mobile performance 85 / 94 / 93, median 93 | PASS |
| AC-54 | P0 | Toolbar scrolls away | Top bar and tool bar stay put on desktop and phone | PASS |
| AC-55 | P1 | Page number + actions | Page number and actions (rotate, delete, duplicate, insert after) on the page in focus; thumbnail rail | PASS |
| AC-56 | P1 | Tooltips | Name, shortcut and a how-to line for all 9 tools | PASS |
| AC-57 | P0 | n/a | Placeholder "Text" pre-selected; first key replaces it; an empty box is removed on blur; placeholder never written | PASS |
| AC-58 | P1 | n/a | Duplicate lands +15 pt below and selected; Alt duplicate to page 2; typed size 37; presets 8–72 | PASS |
| AC-60 | P1 | Fixed swatches | Palette, hex, custom, No colour, Recent colours, eyedropper | PASS |
| AC-64 | P1 | None | Guides, snap to centre (-0.01 px), position readout, Alt suspends snapping | PASS |
| AC-65 | P1 | Info modals | Inline notes and toasts only; no information-only modal | PASS |
| AC-66 | P2 | n/a | **The Image tool opens the OS file picker directly; there is no list of recent images.** Recent signatures do work | **FAIL** |
| AC-67 | P1 | n/a | Ghost at opacity 0.6 follows the pointer; Esc cancels image and signature placement | PASS |
| AC-68 | P0 | n/a | Esc works in every mode, **but the Text tool's hint "Click to type, drag for a box" does not mention Esc**, unlike every other mode ("· Esc to stop" / "Esc cancels") | **FAIL** |
| AC-69 | P1 | n/a | Ctrl+[ and the menu reorder change the output paint order | PASS |
| AC-70 | P1 | n/a | Hide is view-only; 5 colours each; recent colours | PASS |
| AC-71 | P0 | Highlight boxes approximate | Latin strike 200.3–226.3 and Devanagari highlight 72–274.7 match the glyph advance boxes exactly. Caveat: the spec's named corpus is not in the repo, so generated fixtures were used | PASS |
| AC-72 | P1 | Fixed default | 120x80 pt default on click; Shift gives a square | PASS |
| AC-73 | P1 | n/a | History lists "Add text p. 1 11:52 AM" (type, page, time); 2 of 3 changes reverted at once; one undo brings them back | PASS |
| AC-78 | P1 | n/a | Highlight on an edited line; the line does not move | PASS |
| AC-79 | P1 | n/a | Overlays keep place through rotate, zoom and thumbnail reorder (bounds identical) | PASS |
| AC-80 | P2 | n/a | Thumbnail drag reorders; the counter follows scroll | PASS |
| AC-81 | P1 | n/a | Autosaved in 221 ms | PASS |
| AC-82 | P0 | n/a | **After drawing a shape or whiteout, focus stays on the tool button, so arrow keys do not nudge the new (selected) object.** Delete works. Text, signature and image do take focus. After a click on the object, all keys work (arrows, Shift+arrows, Ctrl+C/V/D, Delete, Backspace, Ctrl+Y, Ctrl+Shift+Z) | **FAIL** |
| AC-83 | P0 | Sideways scroll at 390 px | No sideways scroll; bottom dock + More; page fits the width; pinch zoom allowed | PASS |
| AC-84 | P1 | n/a | 500 pages and the 197 MB file open, edit and download (197 MB: open 3.3 s, download 2.6 s) | PASS |
| AC-85 | P0 | 17 words (phone) / 28 (desktop) before the action | Open PDF at y 229–281 (desktop), 211–263 (phone) | PASS |
| AC-86 | P1 | n/a | 148.9 KB JS by load; pdf.js prefetched after load | PASS |
| AC-87 | P0 | Initials exist | Separate saved lists for initials | PASS |
| AC-88 | P1 | n/a | 1 pt / 10 pt nudges, live "Moved 10 pt", one undo per burst | PASS |
| AC-89 | P1 | n/a | Enter or click in the Objects list focuses the object on canvas and scrolls to it | PASS |
| AC-90 | P1 | n/a | 339 ms | PASS |
| AC-91 | P1 | Helvetica | Tinos in preview and output, embedded | PASS |
| AC-92 | P1 | n/a | CLS 0 | PASS |
| AC-93 | P1 | n/a | Paste lands on the current page; drop at the drop point; Ctrl+S downloads | PASS |
| AC-94 | P1 | n/a | One finger draws, two fingers pan. The pen-only rule can't be checked headless | PASS |
| AC-95 | P2 | n/a | Area highlight on the scan | PASS |
| AC-96 | P1 | n/a | Colour change applies live, is one undo step, and becomes the next shape's default | PASS |
| AC-97 | P2 | White whiteout | Whiteout auto-matches the tinted page (RGB distance 0.1) | PASS |
| AC-98 | P1 | n/a | **At 320 px the Text context strip is 329 px wide inside a 290 px box; the ⋯ More button (x 308–344) runs off-screen.** It has 8 controls; the spec budget is 6 | **FAIL** |
| AC-1b | P0 | n/a | Not applicable in E1 (no server fallback ships) | N/A |

## Micro-comparison (M1–M12)

| Check | Sejda | InstaPDF | Result |
|---|---|---|---|
| M1 Landing | 17 words before the action (phone), 28 (desktop) | 3 words; Lighthouse 93 | win |
| M2 Upload start | Click, drop, Dropbox, Google Drive, OneDrive, Web address (URL), blank document | Click, drop, paste, Blank page. **No cloud or URL import** | **lose** (same finding as earlier features; needs an owner waiver or the sources) |
| M3 Loading | Upload, then first page (about 5.5 s) | Page 1 in 239–339 ms; 0 bytes sent | win |
| M4 Display | Sharp | Sharp; 500 pages fine | win |
| M5 Interaction | Basic | Undo history, keyboard, snapping (with the AC-82 focus gap) | win |
| M6 Options | Free tier limited | Initials, marker, unlimited | win |
| M7 Processing | 7.7 s apply to ready | about 1.15 s | win |
| M8 Output | Helvetica not embedded, raster signature, annotations without AP | Embedded fonts, vector signature, APs everywhere | win |
| M9 Errors | Error page | `notes.txt`: "isn't a PDF, so it was skipped"; corrupt and empty: "couldn't be opened. It may be damaged or not really a PDF"; password prompt with a clear wrong-password message, then opens; owner-restricted opens with tools disabled and a plain explanation | win |
| M10 Privacy | Uploads on pick; 3 tasks per hour | 0 B uploaded, verifiable | win |
| M11 Look | Toolbar 600 px on a 390 px phone, sideways scroll | Minimal chrome | win |
| M12 First screen fit | 1366x657: page 45% of screen, 91% after open. 390x664: 46% → 84% | 1366x657: 48% → **54%** (page width 58% at default 100% zoom). 390x664: 83% → 93%. 1920x969: only 39% | **lose on desktop**, win on phone |

## Lighthouse (mobile, simulated throttling) and axe

- Lighthouse on `/edit-pdf`: performance 85 / 94 / 93 (median **93**). Runs 1 and 4 failed with `NO_NAVSTART` and were discarded. SEO is 66 because staging is noindex (expected).
- axe across these states: landing, editor open, text selected, sign dialog, markup, phone dock, More sheet, history.
  - **0 critical** issues.
  - **1 serious:** `label-content-name-mismatch` on the active tool button while the sign dialog is open.
  - Moderate: `landmark-banner-is-top-level`.

## Gap list (actionable, in priority order)

1. **AC-48 (P0): coarse-pointer hit areas are too small.** Resize handles are 42 px and the rotate handle is 36 px; the spec says 44 px. Make the coarse-pointer hit area at least 44x44 for every handle, including rotate.
2. **AC-82 (P0): new shapes and whiteouts don't take keyboard focus.** After one is drawn it is selected, but focus stays on the tool button, so arrows and Shift+arrows don't move it. Focus the new object, as already happens for text, signature and image.
3. **AC-68 (P0): the Text mode hint doesn't mention Esc.** Add "· Esc to stop" (or the same wording as the other modes) to "Click to type, drag for a box".
4. **M12 (desktop lose): the default desktop view leaves the page small.** At 1366x657 the page fills 54% of the screen against Sejda's 91%, and at 1920x969 only 39%. Open in fit-width (or fit-page, whichever is larger) rather than at 100%.
5. **M2 (lose): no cloud or URL import.** Add the sources (Dropbox, Google Drive, OneDrive, URL) or get a written owner waiver, as for earlier features.
6. **AC-51 (P1): the editor WASM loads too early.** `berry_engine_bg.wasm` (564 KB) is fetched 2.2 s after the landing page with no file open. Load it only after a file is opened. Editor JS is at 233–254 KB gzip, so trim it to stay under 250 KB.
7. **AC-98 (P1): the 320 px Text strip overflows.** It is 329 px wide in a 290 px box, so the More button is off-screen. Cut the strip to 6 controls and move the rest into More.
8. **AC-24 follow-up: the free-rotate handle is hard to reach.** The selection popover's Duplicate button covers it. Move the popover or the handle.
9. **AC-66 (P2): no recent images.** Before the file picker opens, show the last 5 images used on this device, each removable.
10. **Desktop tool options disappear while an object is selected** (at 1024 px and up). Switching Rectangle to Ellipse then takes Esc, Esc and a tool click. Keep the active tool's options visible, or show the kind switch in the properties bar.
11. **The Esc order is reversed from the spec.** The first Esc returns to Select and the second deselects. With a sticky tool and an object selected, clicking empty space only deselects; it doesn't place a new object.
12. **Strike-out drag snapping takes in a neighbouring word** when the drag starts in a space between words.
13. **axe:** fix the serious `label-content-name-mismatch` on the active tool button while the sign dialog is open, and the moderate nested-banner landmark issue.

## AC-224: added Arabic and Hindi text, side by side

Same two lines added with the Text tool on both sites: a Hindi sentence ("the full amount was paid on time") and an Arabic one ("hello world, this is a test text"). The reference run and both renders are in `/mnt/project-files/designs/complex-scripts/` (`side-by-side-add-text.png`, `sejda-add-text-editor.jpg`, `sejda-add-text-output.png`, `sejda/01-05`). No new Sejda task was spent for this entry.

| Check | Sejda | InstaPDF |
|---|---|---|
| Warning | Shows a banner while you type that complex scripts (Arabic, Devanagari) are not supported. | None needed. Scripts we ship fonts for (Devanagari, Arabic, Hebrew, Thai) no longer show "Won't print". |
| Devanagari output | Broken: the reph of "संपूर्ण" ends up as a separate letter with a halant (र्ण → रण), and the i-matra of "किया" sits after its consonant (कयि). | Correct: conjuncts, reph and matra order as typed, drawn by the shaping engine with Noto Sans Devanagari. |
| Arabic output | Joined and right-to-left: parity. | Joined and right-to-left, in the requested face (Noto Naskh Arabic, the engine's pick for the box; the punctuation comes from Noto Sans). |
| Copy and paste | Not checked on Sejda (no new task). | pdfium extracts both lines exactly, in reading order (e2e `AC-224` in `e2e/f16/editor-shaping.spec.ts`). |

**Result: PASS.** Hindi is better than the reference, Arabic is at parity. How it works: `buildPdf` leaves out lines that need shaping and returns where each one goes; the download worker then loads the shaping engine (only for such text), opens the built file, calls `addText` once per line (`x = right - shape().width` for right alignment) and saves. Latin-only downloads never request the shaping engine or its fonts (tested).

Known limit: shaped lines are drawn after the other added objects, so an object added later that overlaps such a line sits under it instead of on top.

## Mixed-direction line edits: refused where other readers would misread them

Checked with pdf.js and pdfium (pypdfium2) on the saved file, not only with the engine's own read-back (`apps/web/src/lib/editor/mixed-direction.test.ts`, `crates/berry-engine/tests/latex.rs`).

- **Refused (`text-mismatch`), with "Replace with new text" offered:** a new word in a right-to-left line that would read as typed only through ActualText, which pdf.js ignores. On `scripts-plain.pdf` that covers " 2024" (pdf.js read "202v") and " abc 12" (pdf.js read "abc s2", pdfium "12 abc").
- **AC-206 on `scripts-plain.pdf` is refused for now.** The Arabic font's digit glyphs map elsewhere in its ToUnicode, so "2500" → "3750" read "u750" in pdf.js. Accepted by the lead for now: the sibling-font fix in the Hindi thread is to turn these refusals into correct edits. AC-206 still passes on the Chrome and LibreOffice files.
- **Exemption:** lines already drawn with ActualText spans (Chrome and LibreOffice Arabic) are not refused. Both readers already garble those lines before any edit.
- **Known pdf.js ordering limit (kept, confirmed by the lead):** a word drawn in a font the line doesn't otherwise use (".!" after "تجريبي.", the subset having no "!") is its own text item. pdf.js orders a line's items by content order, so it reads that word ahead of the line; pdfium reads it in place. AC-205 and Arabic appends that need a registered face behave the same way in pdf.js. Recorded in `crates/README.md`.

## Zoom without a white flash (reported on staging)

Zooming showed the page white for a moment on every re-render: each new bitmap faded in from opacity 0 over the white page. Now:

- the current bitmap stays on screen, stretched to the new size, until the render at the new scale is drawn offscreen; then it is swapped in one frame (only a page's first appearance fades in);
- Ctrl+wheel and pinch only scale the pages (bitmap, text layer and objects together) with a transform while the gesture goes on; the zoom is applied and the pages re-render once it rests (160 ms after the last wheel step);
- only pages on screen plus about one screen are rendered, and a render made stale by a newer zoom is cancelled (unchanged).

| Run | Screen frames recorded | Frames with page 1 near blank |
|---|---|---|
| Before (zoom buttons and Ctrl+wheel, `e2e/f16/editor-zoom-flash.spec.ts` with `ZOOM_FRAMES`) | 312 | 155 |
| After, same steps | 343 | 0 |

The e2e samples every animation frame at an ink spot of page 1 (canvas present, fully opaque, dark there) and fails on any blank frame; a second test checks that a line keeps its place on the page during and after a Ctrl+wheel zoom.

Reference: Sejda's zoom (page toolbar button, one upload-only visit, no Apply, requests held to 1 per second) blanks the page to white, shows one black frame, then draws it at the new size. Strips and screenshots: `/mnt/project-files/designs/editor-e1/zoom-flash/` (`before-strip-zoom-in.png`, `after-strip-zoom-in.png`, `sejda-strip-zoom.png`, `sejda-strip-zoom-end.png`). With requests throttled, Sejda's blank period is longer than a normal visit would show, so only its order of frames is compared, not its timing.

## Where InstaPDF is better than Sejda

- Nothing is uploaded: 0 B, checkable through the CSP. Sejda uploads on pick and allows 3 tasks per hour.
- Output quality:
  - embedded, extractable fonts that follow the size of nearby text, where Sejda uses Helvetica 10 pt, not embedded and without ToUnicode;
  - a vector, extractable signature, where Sejda's is a raster image;
  - annotations that all have appearance streams;
  - line edits that keep the reading order;
  - the font of edited lines matched (Tinos).
- Speed: first page in about 0.24 s, and download in about 1.15 s against 7.7 s plus a result page.
- Editing tools Sejda lacks:
  - history with multi-revert;
  - 105+ undo steps;
  - autosave and recovery;
  - snapping guides;
  - keyboard nudging;
  - an Objects list;
  - a whiteout that matches tinted pages;
  - marker and initials;
  - a colour picker with recent colours and an eyedropper.
- Added Hindi text prints correctly (reph and matra order), where Sejda's output breaks it and warns that these scripts are not supported (AC-224).
- Phone layout: no sideways scroll, a bottom dock, and the page fits the width. Sejda's toolbar is 600 px wide on a 390 px phone.
- Large files: 500 pages and 197 MB work without a limit.

## Owner waiver

None on record. M2 and M12 are therefore counted as losses.

## Harness notes

- **The spec is missing from the local checkout.** It exists only at `ba63a9c` / `origin/main`; the local checkout is on `feat/ui-berrypdf`. The spec was read from an export of `ba63a9c`.
- **AC-71 corpus.** The spec's named corpus isn't in the repo, so generated Latin and Chrome-printed Devanagari fixtures were used.
- **AC-94 pen rule.** The pen-only rule can't be checked headless; the touch behaviour was checked with emulated touch.
- **Sejda T1.** The output was lost to Sejda's auto-download (a later GET returned 404). T2 repeats T1's edits and adds the line edit, so no comparison was lost. In total 3 tasks were used.
- **Lighthouse.** Runs 1 and 4 hit `NO_NAVSTART` and are excluded; the median is over the 3 valid runs.
- **Cache.** Raw logs and outputs are in `docs/evals/cache/f16-e1-editor/`. The Sejda outputs can be reused for re-evaluation, so no new Sejda tasks are needed unless the task set changes.
