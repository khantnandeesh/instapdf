# Evaluation: F25 tool layout standard (picker, top row, one progress, one result)

- **Verdict: FAIL.**
- **Gate AC-659 fails on one lost micro-check: M12 (first screen fit) on Edit PDF.**
  - The editor no longer has focus mode. The navbar (72 px) and the editor bar (56 px) now stay on screen, so the pages can never use more than 79.7–82.5% of the height at 1280–1536 px.
  - Measured after a 60% scroll, our pages get 71.5% (1280×632), 72.6% (1366×657) and 75.3% (1536×730) of the height. The cached reference gets 90–92% at the same sizes, and our own F16 round 2 got 90–91%.
  - No owner waiver is on record.
- **The F25 ACs also miss the 90% bar: 37 of 46 judged ACs pass (80%).** The nine fails:
  - AC-632 and AC-658: layout shift at every result swap;
  - AC-645, AC-646 and AC-647: where Download sits, and when it appears on phones;
  - AC-605: the editor enables Download before the first page is drawn;
  - AC-614: the row contents;
  - AC-616: More options focus and anchoring;
  - AC-659: the gate itself.
- **What passes:**
  - Every editor P0 re-checked passes: E1 21/21, forms 5/5, plus the F24 edit-text spot-check.
  - Lighthouse mobile performance passes (median 97 / 92 / 96).
  - axe finds 0 critical issues.
  - The owner's spot-check items mostly pass: picker card only, layout C row, the progress pill with a Cancel that really cancels, one result screen, and the pages-height targets on all six page tools.
- Evaluated: 2026-11-27, 05:40–08:10 UTC, by parity-evaluator.
  - Independent: I read only `docs/specs/f25-tool-layout-standard.md`, `docs/process/mission.md`, the earlier evals and their cache manifests, the editor spec's AC lines (`docs/specs/f16-pdf-editor.md`), the fixtures in `tests/parity/`, and the builder screenshots in `docs/specs/assets/f25/` (for AC-656).
  - I read no code, PR text or builder notes.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app. `/api/health` reports `15687e00f3d056fa8286c10b33a9a1babcd659cc`.
- **Reference tasks run: 0. Requests to the reference site: 0.**
  - Every reference value comes from the cached evidence of F4/F5 (Delete t4, 2026-11-26), F3 (Merge sejda-t3, 2026-11-24) and F16 E1 (editor, 2026-11-24). All of it is inside the 30-day window.
  - The cached hashes match their manifests.
  - No check needed new reference behaviour: F25 changes our layout, not the reference.
- Harness:
  - Playwright 1.63 (headless Chromium, touch emulation below 1024 px), @axe-core/playwright, and Lighthouse CLI (mobile preset, simulated throttling).
  - Outputs were checked with pikepdf (`check_pdf_syntax`) and pypdfium2 (text and render diffs).
  - Editor flows reuse the F16 round 2 harness, adapted to the new tool bar.
  - Fixtures are the cached F4/F5 set. I also generated some in the session (to the spec definitions where one exists): F3-spec `alpha`/`bravo`/`echo` with their outlines, `big-300.pdf` (the AC-635 fixture), a 990-page stress file, `ten-page.pdf` and `photo.png`. The forms and editor fixtures come from `tests/parity/`.
- Evidence (never in git):
  - Raw files: `/mnt/project-files/evals-cache/f25-tool-layout-standard/` (`micro/`, `eval/`, `lighthouse/`, `outputs/`, `scripts/`, `fixtures/`).
  - Eval screenshots: `/mnt/project-files/designs/tool-layout-standard/eval/`.
  - Side by side (reference left): `/mnt/project-files/comparisons/f25-tool-layout-standard/`.
  - Hashes, timings and notes: `docs/evals/cache/f25-tool-layout-standard/manifest.json`.

## Summary against the pass bar

| Gate | Bar | Result | OK |
|---|---|---|---|
| AC-659: micro-checks on Delete, Merge, Edit PDF | no *lose* unless waived | 6 win, 5 tie, **1 lose (M12, Edit PDF desktop)** | **no** |
| AC-659: editor P0 ACs re-checked on `/edit-pdf` | all pass | E1 P0 21/21, forms P0 5/5, F24 edit-text spot-check pass | yes |
| F25 ACs | ≥ 90% of judged ACs | **37 / 46 (80%)**. 14 ACs are source- or CI-level, or need a test-only fixture, and can't be judged on staging (listed below) | **no** |
| Lighthouse performance (mobile) | ≥ 90 | Delete 97/95/98, Merge 92/89/94, Edit PDF 96/95/96. Medians 97 / 92 / 96 | yes (Merge has one run at 89, see G-12) |
| axe critical issues | none | 0 critical, 2 serious, 1 moderate in 29 scans | yes |

F25's ACs carry no P0/P1 priority, so the "every P0" bar applies to the editor P0s re-checked under AC-659.

## Spot-checks asked for (1366×657, 1280×632, 390×664, 320×568)

| Item | Result |
|---|---|
| Picker card only before a file | **Pass** on all 9 routes × 4 viewports (36 states): one `drop-card`; no `[data-ip-dock]`, `primary-action`, `dock-status`, options or editor chrome; no sideways scroll. The picker is the first focusable control after the header links. The editor adds "Start with a blank page" and its Beta badge |
| Layout C top row, primary in view | **Pass** at 1024, 1279, 1280, 1366, 1536 and 1920: the row starts at y 72 and is 64 px tall, `data-ip-dock="row"`, and the primary sits at y 80–128. The row stays pinned after scrolling to the tool guide, with the same shadow and border pinned and at rest. Below 1024, `data-ip-dock="bar"` and the primary is in view in the fixed dock. The row's *contents* differ from §3.4 (AC-614) |
| Progress pill replaces the button; Cancel stops the run | **Pass.** The pill sits in the slot, the slot box is identical in every state, and options and pages go to 0.45 opacity and `inert`. Cancel on a 300-page Split (Every page) goes from click to `ready` in 184 / 181 / 230 ms. The processing worker is terminated 9–31 ms later, no download starts, no result appears, the notice reads "Cancelled. Your file is unchanged.", focus returns to the primary, and a second run completes. Escape on the pill also cancels. Editor download Cancel also passes (AC-636) |
| One result screen, Download in the same slot | **Partly.** There is one result screen and one Download, and it sits in the row's slot (desktop) or the dock (phone). **But it is not in the primary's box:** Save to Drive takes the primary's place, and Download sits 163 px to the left on desktop (AC-646) and on the left half of the dock on phones (AC-645). On phones, Download only appears 301–306 ms after `done` (AC-647). There is also a one-frame blank stage at the swap (AC-632) |
| Settings-tool side panel | **No settings tool on staging** (`/compress-pdf` is the coming-soon page). AC-620 to 623 can't be judged on staging. The builder screenshots in `docs/specs/assets/f25/settings-*` show the fixture |
| Pages ≥ 56% of height at 390×664 and ≥ 60% at 1366×657 | **Pass on all six.** At 390×664: Split 65.2, Extract 57.4, Delete 65.2, Organize 63.4, Combine 63.4, Alternate 63.4%. At 1366×657 all six are 66.8%. F4/F5 G-9 is closed: Extract went from 44 to 57.4% at 390. At 320×568, Merge and Combine reach only 47.9% and Extract 50.4% (no target was set there) |

## AC results

| AC | Area | Result on 15687e0 | Pass |
|---|---|---|---|
| AC-600 | Empty state | 36 of 36 states: exactly one `drop-card`; no dock, options or editor chrome | PASS |
| AC-601 | Picker | Names: "Choose files" (page and multi-file tools, several files) and "Choose PDF" (editor). It is first after the header links, inside the viewport and not covered at all 4 sizes | PASS |
| AC-602 | Card order | Picker with caret (plus the Drive row), hint, limits, privacy. The editor adds "Start with a blank page" after the hint. On touch phones the "or drop … here" hint is hidden (reasonable, since phones can't drop). The flag-off variant can't be set on staging | PASS |
| AC-603 | Privacy copy | "Your files stay on this device." on every browser tool. The server copy can't be reached on staging (unit-level) | PASS |
| AC-604 | Drop and paste | A drop anywhere on the page and a Ctrl+V paste both load the file on Delete, Merge and Edit PDF | PASS |
| AC-605 | Opening | The picker label never changes, and no "Opening…" text appears anywhere. **The editor enables Download before the first page is drawn:** 131 ms early on `para-times.pdf`, and 0.99 s early on a 990-page file, where the page is still a placeholder while Download is live (`e14-…`). Also, a locked file opens its password dialog over the picker card, not over the editor placeholders (`e17-…`) | **FAIL** |
| AC-606 | Grep test | Source-level | not judged |
| AC-607 | Floaties | 20 floaties, all `aria-hidden`; no animation running 5.2 s after load (editor and Delete); none visible under forced colours | PASS |
| AC-610 | Row ≥ 1024 | `data-ip-dock="row"`. The h1, options, status and primary share the 64 px row at y 72–136 at 1024, 1280, 1366 and 1920 | PASS |
| AC-611 | Pinned row | After scrolling to the end at 1280 and 1366, the row stays at y 72 and the primary at y 80, fully visible and not covered. Box-shadow and border are the same pinned and at rest | PASS |
| AC-612 | Below 1024 | The row holds only the h1. Fixed `bar` dock at 320, 390 and 768 | PASS |
| AC-613 | Stage | No bottom bar and no `--ip-dock-actual` at ≥ 1024. The stage at 1366×657 measures 507 px against 505 expected (it includes a 1 px border on each side). The pages span the main column | PASS |
| AC-614 | Row contents per tool | Four differences from §3.4 (details in G-6): (a) **Merge at 1280 and 1366 has no inline Contents page** (None / Names / Titles); it is only behind More options. (b) Split at 1024–1279 keeps the four pills instead of the native "Split" Select. (c) On Delete, Extract and Split, More options is icon-only at 1280 and 1366 (it shows its label only at 1920). (d) Undo│Redo show labels at 1024 on Organize, and at every width on Merge and Combine. Rotate shows "All / Odd / Even pages" where §3.4 says "All · Selected" (the unchanged F1 form) | **FAIL** |
| AC-615 | No wrap | Row `scrollWidth == clientWidth` for every tool at 1024, 1279, 1280, 1366 and 1920. The h1 is one line and not truncated. A long status truncates with an ellipsis ("990 pages · 990 …") | PASS |
| AC-616 | More options | A popover (≥ 1024) or a sheet (< 1024) opens. Focus goes inside; the body is the only `overlay` scroller and fits the viewport; Escape closes it and returns focus to the trigger. **An outside click closes it but leaves focus on `body`, not the trigger** (all 6 tools with More options). On Merge and Combine the popover is pinned to the left edge (x 8), not under its button. Merge's popover also carries a second "Merge PDFs" primary (`e08-…`) | **FAIL** |
| AC-617 | Keyboard order | Merge: More options → Undo → Redo → Merge PDFs → stage tools row → pages. Organize: Undo → Redo → Save PDF → stage. Delete: field → More options → stage (the primary is disabled until a page is marked). The h1 has `tabindex="-1"` | PASS |
| AC-618 | Tile metrics | Page visual is 100% of the tile width with a 0 px edge | PASS |
| AC-619 | Variant unit test | Source-level | not judged |
| AC-620–623 | Settings tool | No settings tool on staging; the fixture is test-only by design (AC-623) | not judged |
| AC-624 | Editor in page | At 1280 and 390 the header is visible and its links work (AC-629 run). No `position: fixed` ancestor; `main` is not inert; the page doesn't scroll (`scrollHeight == innerHeight`) | PASS |
| AC-625 | Editor bar | At ≥ 1024, left to right: h1 "Edit PDF" + Beta, the file menu, 10 tool buttons, Undo, Redo, Download (+ Save as caret). No `.ed-rail`. At 390: h1, file menu, Undo, Redo, Download, and the `ed-dock` stays | PASS |
| AC-626 | Strip | 132 px, `data-ip-scroll="rail"`, beside the canvas at 1024, 1280 and 1366. It is the only rail region | PASS |
| AC-627 | Properties | Absent at rest. It shows in the first frame after a selection (frame 17 ms); the object moves 0 px; deselecting hides it. **Design deviation (not in the AC):** the panel is a 272 px card floating over the canvas at its top right. It is not a 280 px column that narrows the canvas, so it can cover the page (`e12-…`, G-9) | PASS |
| AC-628 | Canvas height | 504 px at 1280×632 (128–632). At 390×664: 474 px (120 to the dock at 594) | PASS |
| AC-629 | Leave dialog | With edits, a navbar link opens "Close without downloading?". Cancel stays and keeps the object; "Download anyway" downloads `para-times.pdf` and then opens `/merge-pdf`. With no edits the link navigates at once | PASS |
| AC-630 | JS budget | Indicative only: `/edit-pdf` first-load JS at 1280×632 is 143.3 KB encoded (141.8 KB in F16 round 2), +1.5 KB. The e2e budget test itself is CI | PASS (indicative) |
| AC-631 | Editor suites | CI | not judged |
| AC-632 | Pill in slot, no shift | The `processing` pill sits inside `action-slot`, and the slot box is identical before, during and after (to 0.1 px) at 1366 and 390 on Delete and Merge (the editor's 220 px slot also never moves). **The Layout Shift total during a run is not 0:** 0.28 on Delete and Merge at 1366×657 (0.30 on Split and Organize at 1280×632), 0.052 on Delete and 0.015 on Merge at 390×664. On desktop the stage disappears for one frame at the result swap and the tool guide jumps into view (`e01-…`, `e02-…`), on 4 of 4 runs | **FAIL** |
| AC-633 | Dim and inert | During `processing`, options and pages are `inert` with opacity 0.45; the header is not inert; no `processing-loader` or `.mp-loading` | PASS |
| AC-634 | Label and jam | "Splitting… 44%" etc. The fill's inline `scaleX` equals n/100 at every update, the computed value tweens to it, and it never goes back (990-page run, 19 updates) | PASS |
| AC-635 | Cancel (browser) | See the spot-check table. On the 990-page stress file a 961 ms main-thread task stretched click-to-ready to 880 ms (G-13); the spec's 300-page fixture passes | PASS |
| AC-636 | Cancel (editor download) | 990-page file with one edit, Cancel at 453 ms: no download, 1 object kept, Undo enabled, the build worker closed 74 ms after the click and a fresh one spawned, the next Download works | PASS |
| AC-637 | Server phases | Route-mock test only; no job API exists | not judged |
| AC-638 | Error in slot | A damaged file fails at open on staging ("corrupt.pdf couldn't be opened…" in NoticeStack, back to the card), so a user can't reach a run-time error without a fault fixture | not judged |
| AC-639 | Done tick | "Done" shows for 553–577 ms before `data-state="done"`; the result is visible about 0.6 s after the job ends | PASS |
| AC-640 | Pill a11y | `role="group"`, named "Split PDF progress". The `progressbar` has `aria-valuenow` and `aria-valuetext="44%"`. Focus is on the pill at start, Tab reaches Cancel and Escape cancels. The live region said "Splitting 25%" and then "Cancelled". (The editor's indeterminate pill has an empty `aria-valuetext` attribute; minor) | PASS |
| AC-641 | Reduced motion | Spinner animation `ip-pulse` (not `ip-spin`); the fill jumps; no animation running 5 s after start | PASS |
| AC-642 | Contrast | axe finds no `color-contrast` issue in any pill, cancelled or result state. Each ratio was not measured by hand | PASS |
| AC-643 | Forced colours | The pill keeps a 1 px solid border (system colour). The fill's computed colour is `rgba(5,0,73,0.8)`, which I can't confirm as `Highlight` from a headless run | PASS (border); fill unconfirmed |
| AC-644 | Result ≥ 1024 | Delete at 1366×657: the result fills the stage; the preview is 465 px of a 507 px stage (91.7%), drawn at 462×654 for 328×465 CSS px; heading, name, meta, Download, Save to Drive, privacy line, 8 chips, "Back to editing" and "Start over" are all in view | PASS |
| AC-645 | Result < 1024 | At 390 and 320, Download is in the dock, visible, not covered and focused, and there is no second Download. **It is not at the primary's former box:** at 390, primary [163, 602, 212×48] → Download [15, 602, 180×48], with Save to Drive (168 px, not a 48 px icon button) at the primary's place. The preview is 365 px = 55dvh tall but 257 px wide in a 358 px stage (portrait pages are height-limited; the AC's "as wide as the stage" can't hold together with "≤ 55dvh", so that half is a spec conflict and not counted) | **FAIL** |
| AC-646 | Result Download slot | Exactly one Download, in the slot and focused; the row shows no options. **Rect [951, 80, 160×48] against the primary's [1114, 80, 177×48]:** Save to Drive [1123, 79, 168×48] sits where the primary was (`e03-…`). Note: on the build, `data-testid="save-main"` is the **Save to Drive** button; the Download link has no testid (G-3) | **FAIL** |
| AC-647 | First-frame click | At 1366 a click 30 ms after `done` downloads. **At 390×664 and 320×568 there is no Download for 301–306 ms after `done`** (a click 30 ms after `done` finds nothing) | **FAIL** |
| AC-648 | Back / Start over | "Back to editing" restores `ready`, keeps the field "5" ("Delete 1 page") and the Split ranges, and focuses the h1. "Start over" goes back to the card and focuses "Choose files"; no dock | PASS |
| AC-649 | ZIP | Split `1-3, 4-8, 9-12`: "Your files are ready", "1 / 3 files", 3 entries with per-entry downloads, no chips | PASS |
| AC-650 | Editor download | Pill (48–303 ms), then "Downloaded" for 2,407 ms, then "Download". The card shows "para-times.pdf, 2.6 KB", "Done on this device." and Compress / Fill & sign / Merge, with a Close; Escape and the next edit close it; focus stays on Download; no `.ed-toast`. `no-password-note` was not exercised (no locked-output case run) | PASS |
| AC-651 | Keep going | Compress chip → `/compress-pdf` (coming-soon page); no leave dialog; no `beforeunload` prompt | PASS |
| AC-652–655 | Hooks, types, CI, design docs | Source, CI or docs outside my read scope | not judged |
| AC-656 | Screenshots | `docs/specs/assets/f25/` holds 184 captures: Delete, Split, Merge, Alternate, the settings fixture and Edit PDF, each state at the 4 sizes (Alternate has no More options state, which is correct). The phone result capture shows a single full-width Download, which suggests the cloud flag was off in the capture environment; staging (flag on) differs, see AC-645 | PASS |
| AC-657 | Grep | Source-level | not judged |
| AC-658 | CLS through the flow | Lighthouse load CLS is 0 on both pages, but the load → pick → run → result flow on `/delete-pdf-pages` records 0.28 (see AC-632). The editor flow records 0 | **FAIL** |
| AC-659 | Gate | M12 lost on Edit PDF (below) | **FAIL** |

Not judged (14): AC-606, 619, 620, 621, 622, 623, 631, 637, 638, 652, 653, 654, 655, 657. Judged: 46. Passed: 37.

## Editor P0 re-check on `/edit-pdf` (AC-659, second half)

**E1 P0 (from `f16-e1-editor.md`): 21 / 21 pass.** The flow is the round 2 harness on the new tool bar: `para-times.pdf` with text, whiteout, 4 shapes, highlight, strike-out, ink, image and signature.

| AC | Result on 15687e0 | Pass |
|---|---|---|
| AC-1 | Open → 11 edits → 5 downloads: 0 non-GET requests, largest body 0 B, 0 cross-origin requests | PASS |
| AC-2 | CSP `connect-src 'self'`; `fetch('https://example.com/')` → "Failed to fetch" | PASS |
| AC-4 | 5 downloads in a row (763 / 371 / 333 / 308 / 326 ms); no limit text | PASS |
| AC-6 | First page painted 274–377 ms after the pick | PASS |
| AC-23 | "Added note here" at x 72.0 pt, top 395.8 pt; embedded Arimo with ToUnicode | PASS |
| AC-24 | Image moved (+60, +37.2 px); aspect-locked resize 1.500 → 1.500; Rotate 90 gives `cm 0 -1 1 0` | PASS |
| AC-25 | Whiteout in content. "Hides content; doesn't delete it" shows in the properties panel while the tool is armed | PASS |
| AC-26 | Rectangle, ellipse, line and arrow as content paths | PASS |
| AC-27 | Highlight, StrikeOut and Ink, all with appearance streams | PASS |
| AC-31 | Type (8 faces, 5 inks), Draw (canvas), Upload (file input + switch); the placed signature is extractable "Alex Rao" in Caveat | PASS |
| AC-43 | 105 duplicates → 107 undo steps back to 0 objects; redo works | PASS |
| AC-44 | Downloads in 0.31–0.76 s; stays on `/edit-pdf` with 11 objects | PASS |
| AC-48 | Touch at 390×844 and 320×568: every handle 48 px wide with a 42–48 px hit extent (same as round 2); off-centre resize and rotate grabs work | PASS |
| AC-54 | Editor bar at y 72 after scrolling (desktop); y 64 with the dock at 774 (phone) | PASS |
| AC-57 | A new box has its placeholder selected ("Text"), the first keystroke replaces it, and an empty box is removed | PASS |
| AC-68 | Esc returns to Select from Text, Shapes, Mark, Draw, Whiteout, mid-drag and the image ghost; every hint names Esc | PASS |
| AC-71 | Highlight QuadPoints x 93.7–154.0, StrikeOut 200.3–226.3 (identical to round 2) | PASS |
| AC-82 | A drawn rectangle takes focus; arrows nudge 3.53 px (2 pt) and Shift+arrow 17.70 px (10 pt) | PASS |
| AC-83 | 390 px: `scrollWidth` 390, page 374 px wide | PASS |
| AC-85 | h1 and "Choose PDF" above the fold at 1280×720, 1366×768, 1440×900 and 390×844 | PASS |
| AC-87 | Initials tab with its own "Your initials" field and Type / Draw / Upload | PASS |

All 7 editor outputs are qpdf-clean: `out-flow-1…5`, `out-image`, `edittext`.

**Forms P0 (from `f16-forms.md`): 5 / 5 pass.**
- **AC-230:** 13 widgets are read with their kinds.
- **AC-231:** changed fields get `V` and a fresh AP. Untouched `notes`, `pin`, `code`, `colour` and `days` APs are byte-identical to the source (MD5). No `NeedAppearances`.
- **AC-247:** the output is qpdf-clean.
- **AC-248:** Tab goes name → notes → pin → agree → size (one stop for the radio group) → colour → days → code → email. The cross-page custom order was not re-run.
- **AC-253**, read against the F25 bar (the rail is gone): all 10 tools fit the bar at 1366 and 1024 (`scrollWidth == clientWidth`), and Form is 5th. On phones the dock is Text / Sign / Mark / Whiteout / Draw / More, and Form is in More.

**F24 font P0s:** spot-check only, carried otherwise. With Edit text, line 2 was changed to "This sheet …". The output keeps the original `/Times-Roman` font object and extracts "This sheet shows…", qpdf-clean. Escape cancels a text edit and a click outside commits it.

**Regression seen, not P0:** with Shapes armed, drawing a shape selects it, and the kind switch (Rectangle / Ellipse / Line / Arrow) disappears until Esc. F16 round 1 gap 10 had fixed this (G-10).

## Micro-comparison M1–M12 (AC-659)

Desktop 1280×632/720 and phone 390×664 (plus the five M12 viewports). The reference column is the cached evidence, and no reference task was run. Medians are of 3 runs unless stated. Side-by-sides are in `/mnt/project-files/comparisons/f25-tool-layout-standard/`. The eval captures in `/mnt/project-files/designs/tool-layout-standard/eval/` are marked `e…`.

| # | Check | Reference (cache) | BerryPDF 15687e0 | Numbers | Result | Captures |
|---|---|---|---|---|---|---|
| M1 | Landing | Delete: chooser opens 703 ms (579 in a 2nd set); Merge page 974–1,145 ms; LH perf 89–91; 24–35 words above the action (Delete), 27 (Merge), 28 (editor) | LH perf: Delete 97, Merge 92, Edit 96 (medians); FCP 1.1–1.2 s. Chooser opens: Delete 1,008 (5 runs, 902–1,159), Merge 954, Edit 952 ms. 16–17 words above the action on desktop, 9–10 on phone | Delete chooser 703 vs 1,008 ms | **tie** (unchanged from F4/F5 run 2; G-4 still open) | `01-M1-landing-delete-1280.png` |
| M2 | Upload start | Click, drop, 3 clouds, link; uploads on pick | Click, drop anywhere, Ctrl+V paste, Google Drive. Nothing uploaded | – | **tie** (F3 ruling; G-10 in F4/F5) | `e18-empty-edit-1366x657.png` |
| M3 | First thumbnail | Delete 832 ms, Merge 852 ms, editor ~5.5 s | Pick after 4 s idle: Delete 880, Merge 656 ms. Pick 0.5 s after load: Delete 1,170, Merge 1,236 ms (F4/F5 run 2 measured 833–944 with the same method). Editor 288 ms (desktop) and 261 ms (390) | Delete 832 vs 880; Merge 852 vs 656; Edit 5.5 s vs 0.29 s | **tie** (Delete) / **win** (Merge, Edit). A quick pick regressed by ~0.3 s (G-8) | – |
| M4 | Display | 1.82 backing px per CSS px | Unchanged since F4/F5 run 2 (tile and canvas sizes the same; tiles 100% of the tile box) | – | **tie** (page tools; carried); editor win (carried) | – |
| M5 | Interaction | Basic; no undo; no cancel | As before, plus a Cancel that truly stops the run (Escape too) and "Back to editing" that keeps marks. Clicks to download unchanged (3) | – | **win** | `e06-pill-working-1366x657.png` |
| M6 | Options | Free tier caps (Delete 200 pages, Merge 50 pages, editor 3 tasks/h) | Same options, no caps. Merge's Contents page is now behind More options (G-6) | – | **win** | `e08-…` |
| M7 | Processing | Delete 3.06 s; Merge 3.2 s; editor 7.7 s | Action → Download ready: Delete 1.87 s (1,351–1,881), Merge 1.35 s, Edit 0.93 s. Slower than run 2's 0.87 s because of the 400 ms Done hold and the swap, but still well ahead | – | **win** | `08-M7-result-merge.png` |
| M8 | Output | Delete 3,626 B (qpdf clean); Merge 7,229 B, **3 qpdf warnings**; editor: Helvetica not embedded, raster signature | Delete 2,742 B, 11 pages, render diff 0, outline mapped, qpdf clean. Merge same task: 10 pages, same sizes (A4 + Letter landscape), 3 TOC links to 3/7/9, outline kept, 3,323 B, qpdf clean. Editor: embedded fonts, vector signature, APs, qpdf clean | Delete −24%; Merge −54% | **win** | – |
| M9 | Errors | Generic failure; no named message | Named NoticeStack messages, back to the card ("corrupt.pdf couldn't be opened…", "notes.txt isn't a PDF…"); password dialog on all three (the editor's sits over the card, G-5) | – | **win** | `10-M9-corrupt-delete.png`, `e17-…` |
| M10 | Privacy | Uploads every file on pick | 0 non-GET requests in every flow (runs, cancels, results, editor downloads); CSP `connect-src 'self'` | – | **win** | – |
| M11 | Look and motion | Plain, dense | One action slot and one pill, as designed; no ring after a mouse pick (F4/F5 G-7 holds). Held back by: a **one-frame blank stage at every result swap** (G-2); the Merge popover pinned to the left edge with a second primary in it (G-7); the picker's keyboard focus ring drawn offset from the split button (`e18-…`) | – | **tie** | `e02-…`, `e08-…` |
| M12 | First screen fit | Delete loaded: 59 / 57 / 63 / 65 / 56% height (1366 / 1280 / 1536 / 1920 / 390), 95–99% width. Merge: ~39% (1366), ~20% (390). **Editor after scroll: 90–92% (1280–1536), 83% (1920), 46–69% (390)** | Picker, primary and Download in view at all 5 viewports on load, loaded, enlarged, scrolled (60-page file) and result. Delete/Merge loaded: 65.5 / 66.8 / 70.1 / 77.5% (1280 / 1366 / 1536 / 1920), 65.2 / 63.4% at 390. At 1920 the pages are only 63% of the width (main column), so about 16 visible tiles against the reference's ~20 (G-14). **Editor after scroll: 71.5 / 72.6 / 75.3 / 81.4% (1280 / 1366 / 1536 / 1920), 68.4% at 390.** The navbar and editor bar (128 px) cap the canvas at 79.7–82.5% | Editor 1366: 91 vs 72.6%; 1280: 90 vs 71.5%; 1536: 92 vs 75.3% | Delete **tie**, Merge **win**, **Edit PDF LOSE** (desktop pages clearly smaller than the reference; F16 round 2 was 90–91%) | `02-…`, `03-…`, `04-…`, `05-…`, `06-…`, `07-…`, `09-M12-edit-1280.png`, `e15-…` |

Overall: M1 tie, M2 tie, M3 tie/win, M4 tie, M5–M10 win, M11 tie, **M12 lose (Edit PDF)**.

## Lighthouse (mobile), axe, SEO and Core Web Vitals

Lighthouse CLI, mobile preset, simulated throttling. The 3 runs below ran with no other load on the machine. A first set, run while other browser jobs were running, is kept in `lighthouse/summary-contended.txt` and not counted.

| Page | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS (load) |
|---|---|---|---|---|---|---|---|---|
| /delete-pdf-pages | 97 / 95 / 98 | 100 | 100 | 66* | 1.12–1.21 s | 1.12–1.21 s | 174–240 ms | 0 |
| /merge-pdf | 92 / 89 / 94 | 100 | 100 | 66* | 1.12 s | 1.12 s | **295–446 ms** | 0 |
| /edit-pdf | 96 / 95 / 96 | 100 | 100 | 66* | 1.11–1.16 s | 1.11–1.16 s | 214–252 ms | 0 |

\* The only failing SEO audit is `is-crawlable` (staging sends `x-robots-tag: noindex, nofollow` and `robots.txt` has `Disallow: /`).

**SEO (rendered HTML and headers).** Titles: "Delete Pages from PDF Online Free | BerryPDF" (44 characters), "Merge PDF: Combine PDF Files Free | BerryPDF" (44) and "Edit PDF (beta) | BerryPDF" (26). Descriptions are 114–140 characters. The canonicals are absolute `https://www.berrypdf.com/<slug>`. Each page has one h1. Delete and Merge carry JSON-LD and `index, follow`. `/edit-pdf` has `noindex, follow`, no JSON-LD and no sitemap entry (beta, as before). HTML is still `cache-control: s-maxage=31536000` (F4/F5 G-8). F25 changed no SEO signal.

**Core Web Vitals (lab only; no CrUX on staging).**
- Load LCP is 1.1–1.2 s and load CLS is 0.
- **The interaction CLS is not 0:** 0.28 at every desktop result swap (G-2). Field CLS counts this, because the shift comes about 1.4 s after the click, outside the 500 ms input exclusion.
- TBT, the INP proxy, is 174–252 ms on Delete and the editor and 295–446 ms on Merge (G-12).

**axe** (wcag2a/aa, 21a/aa, 22aa, best-practice): 29 scans of Delete, Split (pill, cancelled), Merge and the editor in empty, ready, marked, More options, result, open, selection and downloaded states, at 1280 and 390.
- **0 critical.**
- **Serious ×2:** `label-content-name-mismatch` on the editor's Download button in its "Downloaded" state, at 1280 and 390. The visible "Downloaded" text is not in the name "Download PDF".
- **Moderate ×1:** `heading-order` in the Merge More options popover (an h3 under the h1).

## Gap list (ranked; the first two block PASS)

1. **G-1 (blocks PASS: M12 lose on Edit PDF; AC-659). Pages get ~72–75% of the height on desktop against the reference's 90–92%.**
   - Focus mode is gone. The 72 px navbar and the 56 px editor bar now stay on screen, so the canvas is capped at 504 px at 1280×632 (79.7%).
   - Measured after a 60% scroll: 1280×632 71.5%, 1366×657 72.6%, 1536×730 75.3%, 1920×969 81.4%. Reference: 90 / 91 / 92 / 83%; our F16 round 2: 90–91%.
   - Options, any of which reaches ≥ 90% at 1280–1536:
     - let the navbar scroll away, or collapse it, once a document is open (the editor bar stays sticky at the top);
     - or merge the navbar and the editor bar into one 56–64 px row at ≥ 1024;
     - or record the owner's written waiver here.
   - Re-measure with the same method (`scripts/m12.cjs`).
2. **G-2 (blocks the AC bar: AC-632, AC-658, M11). A blank frame and CLS 0.28–0.30 at every result swap on desktop.**
   - For one frame (~33 ms) between the work area's exit and the result's entry, the stage is unmounted. The grid paper shows and the tool guide jumps up to y 206 and back (`e01-…`, `e02-…`).
   - Seen on Delete, Merge, Split and Organize, 4 of 4 runs. Phones shift by 0.015–0.052 in the dock.
   - Fix: keep the stage element mounted at its fixed height through the swap and cross-fade its contents. Then `layout-shift` entries during load → pick → run → result must total 0.
3. **G-3 (AC-645, AC-646): Download is not in the primary's box.**
   - With Drive enabled, Save to Drive takes the primary's place (desktop x 1123; phone right half), and Download sits to its left.
   - Fix: put Download right-aligned in the primary's exact rect, with Save to Drive to its left (desktop). On phones, Download takes the flex primary place and Drive becomes a 48 px `line` icon button, as §7 says.
   - Also, `data-testid="save-main"` is on the Save to Drive button, while the spec and `flow.ts` expect it on Download. Give Download a stable testid (`save-main` per the spec) and rename the Drive one. Any e2e that clicks `save-main` today clicks Drive.
4. **G-4 (AC-647): no Download for ~300 ms after `done` below 1024** (301 ms at 390×664, 306 ms at 320×568). Mount the dock's Download in the same commit that sets `done`, as desktop already does.
5. **G-5 (AC-605): the editor enables Download before page 1 is drawn.**
   - It is enabled 131 ms early on a 2-page file and 0.99 s early on a 990-page file, while the canvas still shows the placeholder (`e14-…`). Enable it on the first page's paint.
   - Related:
     - the "opening" frame shows a spinner, not the paper placeholders of motion E1;
     - a locked file's password dialog opens over the picker card, not over the editor placeholders (`e17-…`).
6. **G-6 (AC-614): the row contents differ from §3.4.**
   - Merge at ≥ 1280 must show Contents page (None / Names / Titles) inline, folding at 1024–1279.
   - Split at 1024–1279 should switch its pills to the native "Split" Select.
   - More options needs its label at ≥ 1280 on Delete, Extract and Split (today it is icon-only until 1920).
   - Undo│Redo should be icons at 1024–1279 (Organize) and at all widths on Merge and Combine (labels today).
   - Or amend §3.4 if the build is the preferred design; Rotate's "All · Selected" line in §3.4 also doesn't match the shipped F1 form.
7. **G-7 (AC-616, M11): More options.**
   - An outside click must return focus to the trigger (today it goes to `body`).
   - Anchor the Merge and Combine popover under its button and right-align it to it (today it sits at x 8).
   - Remove the second "Merge PDFs" primary inside the popover, so the primary lives only in the slot (Done stays).
   - Add `data-testid="options-popover"` to the page tools' popover; only Merge and Combine have it.
8. **G-8 (M3): a quick pick is ~0.3 s slower than before.**
   - Picking within 0.5 s of load: first thumbnail at 1.17 s (Delete) and 1.24 s (Merge), against 0.83–0.94 s in F4/F5 run 2. With 4 s idle: 0.88 / 0.66 s.
   - Even after 6 s idle, 9 chunks plus the pdf.js worker and renderer load only after the pick.
   - Prefetch the loaded-layout chunks and the PDF engine at idle, or on hover/focus of the picker, so a drop or paste right after load is as fast as before.
9. **G-9 (design deviation, editor).** The properties panel is a 272 px card floating over the canvas's top right and can cover page content (`e12-…`). §5 specifies a 280 px column that narrows the canvas and keeps the selection still. Either build the column, or keep the card but make sure it never covers the selected object.
10. **G-10 (editor regression, not P0).** With Shapes armed, drawing a shape hides the kind switch until Esc. F16 round 1 gap 10 had fixed this. Keep the tool's options visible above the selection controls while the tool stays armed.
11. **G-11 (axe serious).** The editor's Download in its "Downloaded" state is named "Download PDF" while it shows "Downloaded" (`label-content-name-mismatch`, 1280 and 390). Name it from its visible text. Also fix the moderate `heading-order` in the Merge popover (an h3 directly under the h1).
12. **G-12 (Lighthouse).** Merge TBT is 295–446 ms, perf 89–94 (F3: 130–250 ms, perf 95–98). Find the new main-thread work on `/merge-pdf` load.
13. **G-13 (M7/M11, stress).** On a 990-page Split, one 961 ms main-thread task delayed Cancel to 880 ms. The pill appears 110–310 ms after the click (150 ms on 300 pages), where §6 says "on the click". Move the work off the main thread, or yield before it.
14. **G-14 (M12, 1920).** At 1920×969 the page tools' stage is the 1216 px main column (63% of the width), which shows about 16 tiles against the reference's ~20. Before F25 the grid used 100% of the width at 1920. Consider letting the stage widen past 1280 on large screens.
15. **G-15 (copy).** Delete's result meta reads "11 pages, 2.7 KB." without the spec's "1 page deleted." part (§7 item 2).
16. **G-16 (carried).** F4/F5 G-4: the chooser opens about 0.3 s after the reference on Delete (1,008 vs 703 ms).
17. **Spec notes for the PM:**
    - AC-645's "as wide as the stage" conflicts with "≤ 55dvh" for portrait pages.
    - AC-646 names `save-main`, which on the build (from F23) is the Drive button.
    - F16 AC-253's "11-slot rail" is superseded by F25's tool bar (judged here against the new bar).

## Owner waiver

None on record. M12 (Edit PDF) is therefore counted as a lose.

## Harness notes

- Playwright's own `click()` on the pill's Cancel button sometimes reports "element was detached" during fast progress updates. I checked this as a user would: real mouse clicks at the button's position, logged in the page (pointerdown and click both land on `cancel`). Cancel works by mouse, keyboard (Escape) and at 390 px. The detach shows the button re-rendering on each progress tick. It did not lose a real click in 6 tries.
- The F4/F5 `alpha`/`bravo` fixtures differ from the F3 spec (no outline, portrait). So the Merge M8 task used F3-spec fixtures generated in the session (`fixtures/` in the raw folder).
- The first Lighthouse set ran while other browser scripts were running (Merge 86–95). It was re-run on an idle machine, and only that set is reported.
- Editor M12 uses the round 2 method: the visible page area over the viewport after a 60% scroll of the canvas. The canvas cap (79.7–82.5%) bounds any method, so the lose doesn't depend on the method.
