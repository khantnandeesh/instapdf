# Evaluation: F1 Shared flow (vehicle: Rotate)

- **Verdict: PASS**
- Evaluated: 2026-11-23 (15:20–16:05 UTC) by parity-evaluator
- Spec: `docs/specs/f1-shared-flow.md` (57 ACs: 17 P0, 30 P1, 10 P2)
- Reference: https://www.sejda.com/rotate-pdf-pages
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/rotate-pdf
- Harness: Playwright (headless Chrome for Testing 153), pdf-lib + pdfjs-dist 4 for output checks, pixelmatch for render diffs, @axe-core/playwright, Lighthouse CLI (mobile). Fixtures: the `.pdf` corpus from the repo test fixtures plus a generated `notes.txt` and a generated 101 MB PDF.

## Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | 17 / 17 | yes |
| All ACs | at least 90% | 56 / 56 evaluated (100%). AC-46 is N/A: the spec tells the evaluator to skip it (needs a test-only fault hook) | yes |
| Lighthouse performance (mobile) | at least 90 | 99 (median of 3 runs: 99 / 97 / 99) | yes |
| axe critical issues | none | 0 critical, 0 serious, 0 moderate, 0 minor in 7 states | yes |

By priority: **P0 17/17**, **P1 29/29** (+ AC-46 N/A), **P2 10/10**.

## Sejda runs (budget: 3 real tasks per hour)

| # | UTC start | Task | Cached output | Result |
|---|---|---|---|---|
| T1 | 15:28:21 | `pre-rotated.pdf`, All pages, rotate right, Apply | `cache/f1-shared-flow/sejda-t1-pre-rotated.pdf` | 3 pages, `/Rotate` [90,180,90], text "Page 1..3", 595×842, 1,621 B, file name `pre-rotated.pdf` |
| T2 | 15:31:47 | `user-pw.pdf` (password `test`), All pages, rotate right | `cache/f1-shared-flow/sejda-t2-user-pw.pdf` | 3 pages, [90,90,90], **not encrypted**, 1,682 B, name `user-pw.pdf` |
| T3 | 15:33:48 | `owner-restricted.pdf` (no prompt shown), All pages, rotate right | `cache/f1-shared-flow/sejda-t3-owner-restricted.pdf` | 3 pages, [90,90,90], **not encrypted** (restrictions dropped), 1,682 B, name `owner-restricted.pdf` |

The three runs were planned to answer the spec's open questions first. Each run's `.json` log, its pre-run screenshot and its result screenshot are in the same cache folder. The output bytes were fetched afterwards with one same-origin request per task, so no extra tasks ran. Upload-only visits (no processing) were used to read Sejda's ready-state controls. Requests stayed at or below 1 per second, apart from normal page-asset loading.

**Spec assumptions confirmed against the reference (§6):**
- The single-file output keeps the input file name (`<basename>.pdf`). InstaPDF does the same.
- Encrypted inputs (user password, and owner-only restrictions) produce an **unencrypted** output. InstaPDF does the same.
- Rotation is added to the existing `/Rotate` (pre-rotated gives [90,180,90]). InstaPDF does the same.

**Output parity (same task, same fixture), rendered at scale 1 with pdf.js and compared with pixelmatch (threshold 0.1):**

| Task | Pages | Order / text | `/Rotate` | Page sizes | Encrypted | Bytes Sejda → InstaPDF | Pixel diff |
|---|---|---|---|---|---|---|---|
| pre-rotated, all +90 | 3 = 3 | same | [90,180,90] = same | same | no = no | 1,621 → 1,926 | 0 px on all 3 pages |
| user-pw, all +90 | 3 = 3 | same | [90,90,90] = same | same | no = no | 1,682 → 2,282 | 0 px on all 3 pages |
| owner-restricted, all +90 | 3 = 3 | same | [90,90,90] = same | same | no = no | 1,682 → 2,279 | 0 px on all 3 pages |

**No AC is waiting on a Sejda run.** Optional parity runs for a later re-evaluation, after 16:34 UTC (when all three of today's runs have aged out of the hourly window): `three-pages.pdf` with Odd scope plus per-page rotate on page 2 (AC-32/33), and rotate-left (AC-31). These behaviors are deterministic, the spec's reference screenshots 07–09 already show them, and the InstaPDF results match the spec values exactly. Multi-file runs (AC-7/42) are impossible on the reference's free tier: it keeps only the first file.

## AC results

"Ref" = Sejda. "Spec obs." = the reference behavior recorded in the spec from upload-only observation (no task needed). "n/a (ours)" = an InstaPDF decision or improvement that the spec says is not compared with the reference.

| AC | Pri | Sejda result | InstaPDF result | Pass |
|---|---|---|---|---|
| AC-1 | P0 | input `accept=.pdf`, `multiple` (observed) | One "Choose PDF files" button; input `accept=".pdf,application/pdf"`, `multiple`; 0 tiles; primary disabled | PASS |
| AC-2 | P0 | ready, 3 thumbnails (observed) | Picker via filechooser: ready, 3 tiles labeled 1,2,3, primary enabled | PASS |
| AC-3 | P0 | whole page is a drop target (spec obs.) | `drop` with DataTransfer on a non-tool element: ready, 3 tiles | PASS |
| AC-4 | P1 | spec obs. | Overlay hidden, then visible (opacity 1) on dragenter/dragover, then hidden after dragleave and after drop | PASS |
| AC-5 | P0 | Ref uploads immediately (`upload-check`, `upload`, `/api/tasks`) | From pick to download: only GETs of JS/worker chunks; 0 POSTs; 0 bodies over 10 KB. The password unlock flow also sends nothing | PASS |
| AC-6 | P1 | n/a | "Reading sixty-pages.pdf" status at t=18 ms; first canvas at 464 ms; primary disabled during loading | PASS |
| AC-7 | P1 | free tier keeps only 1 file (spec obs.) | View toggle present; files view has 2 cards with thumbnails: "three-pages.pdf, 3 pages" and "sixty-pages.pdf, 60 pages" | PASS |
| AC-8 | P1 | n/a | "Add files" appends: 6 pages, 2 files | PASS |
| AC-9 | P1 | n/a | "Remove pre-rotated.pdf" leaves 1 file; output is a single `three-pages.pdf` (3 pages), not a ZIP | PASS |
| AC-10 | P2 | slider present (observed) | Tile width 160 px, then 320 px after setting the slider to 320 | PASS |
| AC-11 | P2 | Dropbox / Drive / OneDrive / URL in the dropdown | No cloud or URL entries rendered (whether the slot exists in code can't be seen from the UI) | PASS |
| AC-12 | P0 | red banner, stays empty (spec obs.) | "notes.txt isn't a PDF…"; state empty; 0 tiles | PASS |
| AC-13 | P0 | banner; broken pages view with action active (spec obs.) | "corrupt.pdf couldn't be opened…"; empty; primary disabled (an improvement on the ref) | PASS |
| AC-14 | P1 | not tested on ref | `empty.pdf` behaves the same as AC-13 | PASS |
| AC-15 | P1 | n/a | Error for notes.txt; three-pages.pdf loaded (ready, 3 tiles) | PASS |
| AC-16 | P1 | 50 MB free cap (spec obs.) | 101 MB file: "big.pdf is larger than 100 MB…" after 105 ms; main thread responsive; stays empty | PASS |
| AC-17 | P1 | 200-page free cap (spec obs.) | "too-many-pages.pdf would take this task past 1,000 pages…"; stays empty | PASS |
| AC-18 | P1 | 1 file on free tier | 21 copies: 20 loaded (60 pages, 20 files); warning names the 20-file cap and lists `copy-21.pdf` | PASS |
| AC-19 | P1 | Ref free tier: 200-page cap, 3 tasks/hour | sixty-pages.pdf loads; 4 consecutive runs, no limit or upgrade message | PASS |
| AC-20 | P0 | modal "Password for user-pw.pdf", masked field, eye toggle, "use for all" box, Continue (seen in T2) | Native modal `<dialog>` "user-pw.pdf is locked"; `type=password` input has focus | PASS |
| AC-21 | P0 | modal reopens with the field cleared (spec obs.) | Modal stays open; "That password didn't work…" visible; value kept and fully selected; 0 tiles | PASS |
| AC-22 | P0 | accepted (T2) | `test` closes the modal; 3 tiles; ready | PASS |
| AC-23 | P0 | **T2: unencrypted, 3 pages, [90,90,90]** | Unencrypted, 3 pages, [90,90,90], text Page 1..3; pixel-identical to the ref | PASS |
| AC-24 | P1 | eye toggle present | `password`, then `text` (`aria-pressed=true`), then `password` | PASS |
| AC-25 | P1 | no Skip/close on ref | Skip and Escape both remove the file, return to empty, and focus goes back to "Choose PDF files" | PASS |
| AC-26 | P1 | "use for all files" box (T2 screenshot) | One prompt ("Locked file 1 of 2"); both unlocked; 6 tiles | PASS |
| AC-27 | P1 | n/a | Two prompts in turn: "user-pw.pdf is locked", then "user-pw-2.pdf is locked" | PASS |
| AC-28 | P0 | **T3: no prompt; unencrypted, 3 pages, [90,90,90]** | No prompt; ready; output unencrypted, 3 pages, [90,90,90]; pixel-identical to the ref | PASS |
| AC-29 | P2 | Ref says nothing | "This copy has no password. Anyone who has the file can open it." | PASS |
| AC-30 | P0 | equivalent to T2/T3 (identical content, all +90) | 3 pages, "Page 1/2/3" in order, [90,90,90] | PASS |
| AC-31 | P0 | rotate-left control present (observed) | [270,270,270] | PASS |
| AC-32 | P0 | per-page hover rotate (spec obs. 06) | Per-page right on page 2: [0,90,0] | PASS |
| AC-33 | P1 | All / Only odd / Only even (observed) | Odd [90,0,90]; Even [0,90,0] | PASS |
| AC-34 | P1 | cumulative (spec obs. 08) | ×2 gives 180 on every page; ×4 gives 0 | PASS |
| AC-35 | P1 | Reset (observed) | pre-rotated.pdf with mixed edits then Reset: output [0,90,0], equal to the input | PASS |
| AC-36 | P1 | **T1: [90,180,90]** | [90,180,90]; pixel-identical to the ref | PASS |
| AC-37 | P1 | thumbnails rotate (observed) | Tiles change `rotate(0deg)` to `rotate(90deg)`; visual box 160×113 (landscape) | PASS |
| AC-38 | P0 | n/a | Disabled in empty (AC-1), loading (AC-6) and password (state `password`); enabled in ready | PASS |
| AC-39 | P1 | n/a | 4× CPU throttle, 60 pages: `role=progressbar` "Rotating" shown; primary replaced; options fieldset disabled | PASS |
| AC-40 | P2 | 1,621 B for a 1,897 B input | 1,925 B for a 1,886 B input (limit 12,315 B) | PASS |
| AC-41 | P0 | **name = input name** (T1–T3) | Download `three-pages.pdf`, a valid PDF; focus lands on Download | PASS |
| AC-42 | P1 | n/a (free tier single file) | `instapdf-rotate.zip` containing `three-pages.pdf` (3 pages) and `sixty-pages.pdf` (60 pages), all at 90 | PASS |
| AC-43 | P1 | "Continue editing: Rotate…" list (T1–T3 screenshots) | "Keep going with this file" then Rotate: ready, 3 landscape tiles, no picker; right again gives [180,180,180] | PASS |
| AC-44 | P0 | Start over present (T1–T3) | Back to empty, 0 tiles; a new pick works | PASS |
| AC-45 | P2 | "Back to editing" (T1–T3) | "Back to options": ready with pending [90,90,90] | PASS |
| AC-46 | P1 | – | **N/A**: the spec says the evaluator skips this one (test-only fault hook) | N/A |
| AC-47 | P1 | n/a | Batch error notice has a Dismiss button; after dismissing no notices remain; primary disabled | PASS |
| AC-48 | P1 | n/a | Keyboard only: Tab to "Choose PDF files", Enter, pick, Rotate right, Rotate PDF; focus moves to Download, Enter downloads ([90,90,90]); Start over returns focus to the picker. Password and preview dialogs trap Tab (10 and 6 presses stay inside); Escape returns focus to the trigger. 3 of 3 repeats pass | PASS |
| AC-49 | P1 | – | 375×667: scrollWidth 375 = clientWidth in empty, ready and result; primary at y=603–655, inside the viewport | PASS |
| AC-50 | P1 | – | axe (wcag2a/aa, wcag21a/aa, best-practice): 0 violations in empty, password, ready, ready+error, result, empty@375, ready@375 | PASS |
| AC-51 | P2 | not observed | `beforeunload` dialog fires with a file loaded | PASS |
| AC-52 | P1 | n/a (improvement) | When the primary enabled: 60 tiles, 0 rendered, all placeholders 113×160; 16 rendered at idle | PASS |
| AC-53 | P1 | n/a (improvement) | Page 60 rendered 169 ms after the scroll, shown at `rotate(90deg)`; output 60 pages, all 90 | PASS |
| AC-54 | P2 | ref shows a full viewer | Preview canvas 240×169 (landscape) after all +90; ZIP result lists both entry names | PASS |
| AC-55 | P2 | n/a (improvement) | Text paste: nothing happens, no error. PDF paste (event at the focused element or body, as real Ctrl+V does): ready, 3 tiles. A file pasted into the password field is not added. See gap G-1 | PASS |
| AC-56 | P2 | ref has a share button | No Share without the API, or when `canShare` returns false; with the stub: one `File` `three-pages.pdf`, `application/pdf` | PASS |
| AC-57 | P2 | n/a | "Done on this device. Your file was never uploaded." | PASS |

### Extra checks (not ACs; spec §6 "only `/Rotate` changes")

All passed. Each file was rotated +90 on InstaPDF and compared with its input:
- `bookmarks.pdf`: 3 outline items kept, title kept.
- `form.pdf`: fields `full_name` and `agree` kept.
- `mixed-sizes.pdf`: media boxes unchanged.
- `non-latin.pdf`: Cyrillic, Greek and CJK text extracts the same.
- `scanned.pdf`: not rasterized; size 6,107 → 6,135 B.
- `aes-128.pdf` and `rc4-128.pdf`: unlock with `test`, and the output is unencrypted with [90,90,90].

## UX parity notes

| Area | Sejda | InstaPDF |
|---|---|---|
| Options | All / Only odd / Only even, rotate left/right, Reset, per-page rotate on hover, thumbnail size slider | Same set (Reset is disabled while nothing is pending) |
| Primary | "Apply changes", always enabled once uploaded | "Rotate PDF", enabled only with at least 1 usable file; still enabled with nothing pending (same as the ref) |
| Result screen | Title, file name with rename (pencil), Download plus a dropdown, save to Drive, share, print, embedded viewer, continue list (Rotate, Compress, Edit…), Back to editing, Start over, Delete files | Title, name and size, preview, Download, Share (where supported), privacy note, unencrypted note, continue (Rotate), Start over, Back to options |
| Error/limit states | Banners; corrupt file leaves a broken view with the action enabled | Named, dismissible notices; state rolls back; primary never enabled without a file |
| 375 px | – | No horizontal scroll; 2-column grid; two-row dock with the primary always visible |

## Lighthouse (mobile, simulated throttling) and axe

| Run | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 99 | 100 | 100 | 100 | 0.9 s | 0.9 s | 140 ms | 0 | 1.2 s |
| 2 | 97 | 100 | 100 | 100 | 0.9 s | 0.9 s | 210 ms | 0 | 1.3 s |
| 3 | 99 | 100 | 100 | 100 | 0.8 s | 0.8 s | 100 ms | 0 | 1.1 s |

axe-core (via @axe-core/playwright; tags wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice): **0 violations of any impact** in each of 7 states: empty, password modal, ready, ready with an error notice, result, empty at 375 px, ready at 375 px.

## Gap list

None of these blocks the verdict. They are listed so the builders can act on them.

1. **G-1 (P2, AC-55 test robustness).** The paste listener does not react to a `paste` event dispatched on the `document` or `window` object itself. It reacts only when the event targets an element (the focused element or `body`). Real Ctrl+V always targets an element, so users are not affected. But an e2e test written literally from AC-55 ("a `paste` event on the document") using `document.dispatchEvent(...)` will fail. Fix: attach the listener to `document` (keep the editable-target guard).
2. **G-2 (info, AC-39).** During the throttled 60-page run, the progress bar was seen only at `aria-valuenow=0` until done (one mutation sample). That is acceptable under "determinate where possible", but on larger files you may want to emit per-page progress so the bar moves.
3. **G-3 (info, output size).** InstaPDF outputs are 18–36% larger than Sejda's for the same task: 1,926 vs 1,621 B, 2,282 vs 1,682 B, and 2,279 vs 1,682 B. They are well inside AC-40, and the renders are pixel-identical. Consider pdf-lib `useObjectStreams` (or similar) when F6/compress work starts. Nothing is needed for F1.
4. **G-4 (info, for F4 option review).** The reference result screen lets the user rename the output file (pencil icon next to the name) and offers Print. InstaPDF has neither, and neither is in the F1 spec. Hand these to F4's option review.

## Harness notes

- On the first AC-48 attempt, the keyboard-triggered file chooser was missed intermittently. Instrumenting the page showed the app calls `input.click()` with active user activation every time. The cause was Playwright enabling file-chooser interception lazily, which raced with the key press. With interception enabled up front, AC-48 passed 3 of 3 repeats.
- Evaluator scripts and raw results live in the session scratchpad and are not committed. The Sejda outputs, logs and screenshots are in `/mnt/project-files/evals-cache/f1-shared-flow/`; the screenshots are reference only and must never ship.
