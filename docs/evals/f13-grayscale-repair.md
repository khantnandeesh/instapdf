# Key checks: F13 Grayscale and Repair

**Verdict: FAIL.** Two micro-checks are lost: M6 (Grayscale options) and M7 (speed to result, both tools). No owner waiver is on record. Everything else meets the bar.

- Run: 2026-11-28, 07:00–07:20 UTC, by parity-evaluator. Lean key checks (workflow step 5), not an every-AC run.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app, `/grayscale-pdf` and `/repair-pdf`. `/api/health` reported `c1c715f`. At 07:00–07:02 it still reported `4689c25` and both routes said "coming soon"; all results below are from after the new build was live.
- Reference: https://www.sejda.com/grayscale-pdf and https://www.sejda.com/repair-pdf. **2 tasks used** (one each), 07:04 and 07:07 UTC, plus 4 page loads.
- Independent: I read only the spec, `mission.md`, the key-checks section and the F25 eval for format. The fixtures were used as input files only.
- Harness: Playwright (headless Chromium), 1280×632 and 390×664 (plus the M12 viewports); Lighthouse 12.8.2 via `npx` (mobile, 3 runs per route); axe-core 4.14.1 fetched with `npm pack` and injected (no global install). Outputs checked with pypdfium2 (text, render) and pikepdf (qpdf syntax check).
- Evidence (not in git): `/mnt/project-files/evals-cache/f13/` (`ref/`, `shots/`, `out/`, `lh/`, `micro/`, `scripts/`). Side by side, reference left: `/mnt/project-files/comparisons/f13/`. Notes and hashes: `docs/evals/cache/f13/manifest.json`.

## Pass bar

| Gate | Bar | Result | OK |
|---|---|---|---|
| Micro-checks | no lose | 5 win, 5 tie, **2 lose (M6, M7)** | **no** |
| Real use on staging | works end to end | both tools, both widths, 9 files | yes |
| P0 ACs | pass | not re-run here (CI proves them); the two browser ACs I exercised (AC-1440, AC-1441, AC-1460, AC-1461) behaved as written | yes |
| Lighthouse performance, mobile | ≥ 90 | Grayscale 98 / 99 / 96, Repair 98 / 100 / 98 | yes |
| axe critical | none | 0 violations of any level in 12 states | yes |

## Reference tasks

| Tool | File | File chosen → button | Click → result | Outcome |
|---|---|---|---|---|
| Grayscale | `colours.pdf` (6,348 B, 1 page) | 0.57 s (it uploads here) | 0.79 s | 4,032 B, 1 page, text identical, qpdf clean. **The gradient box kept its full colour.** |
| Repair | `cut-short.pdf` (5,374 B, 12 pages) | 0.30 s | 0.86 s | 3,721 B, 12 pages, text identical, qpdf clean. Result says 12 pages recovered, with a warning. |

One run each (task budget), so these are single values, not medians.

## Micro-checks

| # | Check | Reference | BerryPDF | Result | Captures (`micro/`) |
|---|---|---|---|---|---|
| M1 | Landing | Load 0.85–2.2 s. One button, y=325 (1280) / 422 (390), under a title and two lines | Load 0.86–1.5 s. One button, y=306 / 336, under the title only | tie | `01-landing-*` |
| M2 | Upload start | Click, drop, cloud menu. The file uploads on choice | Click, drop, Drive menu. Nothing leaves the tab. Cloud picks not exercised on either side | tie | `02-loaded-*` |
| M3 | Loading progress | File name only after 0.3–0.6 s; no thumbnail ever | Button in 0.21–0.28 s; first page thumbnail in 1.0–1.6 s | win | `02-loaded-*` |
| M4 | Document display | No pages shown | Page grid, size slider, enlarge; 12 and 60 pages in order; damaged file shown as a placeholder | win | `02-loaded-*` |
| M5 | Interaction | Choose, one click, Download | Choose, one click, Download; arrow keys in the grid | tie | |
| M6 | Options | Grayscale: text grey **or black**; pictures grey or left; **compress pictures** tick (on). Repair: none | Grayscale: Everything / Text and drawings only / Pictures only. Repair: none | **lose** (Grayscale; Repair ties) | `03-options-grayscale-1280` |
| M7 | Processing | 0.79 s (Grayscale), 0.86 s (Repair), spinner | Median of 3: **1.68 s** (Grayscale: 1.72, 1.65, 1.68), **1.43 s** (Repair: 1.39, 1.43, 1.55). Truthful % and Cancel | **lose** | `shots/*-3-processing.png` |
| M8 | Output fidelity | Grayscale: gradient left in colour (channel spread 204), luminance error 3.03, 4,032 B. Repair: 12 pages, 3,721 B | Grayscale: nothing coloured (spread 0), error 0.51, text identical, photo kept as a grey JPEG, 5,625 B. Repair: 12 pages, text identical, 2,878 B. All qpdf clean | win | `08-output-grayscale-source-ref-ours` |
| M9 | Errors and limits | Not exercised (no task budget) | Password prompt; wrong type and unreadable file named plainly; Repair says "too little left to repair" for `no-pages.pdf`, `corrupt.pdf`, `empty.pdf` | tie (candidate only; see G-4, G-5) | `shots/err-*` |
| M10 | Privacy and cost | Uploads the file (`POST /api/files/upload`); 200 pages or 50 MB; 3 tasks an hour | 0 non-GET requests in every run; 20 files; batch gives a zip | win | `ref/*-netlog-*.json` |
| M11 | Look and motion | Plain, clear | On theme, clear; no sideways scroll at any width | tie | |
| M12 | First screen fit | Action in view on load, loaded and result at 1280 and 390; never shows pages | Action in view at all five viewports on load, loaded, after scrolling 60 pages and on the result. Pages get 65.5–77.5% of the height on desktop | win | `shots/m12-*` |

## Real use on staging

| Tool | File | Width | Outcome |
|---|---|---|---|
| Grayscale | `colours.pdf` | 1280, 390 | All grey, text selectable, 6,348 → 5,625 B |
| Grayscale | `with-images.pdf` (photo JPEG and other pictures, 3 pages) | 1280 | All grey, 4 pictures one-channel, 6,480 → 5,069 B |
| Grayscale | `scanned.pdf` (2 pages) | 390 | Converted, 6,107 → 4,299 B |
| Grayscale | `colours.pdf` + `with-images.pdf`, both partial choices | 1280 | Zip of 2 files each time; help line changes with the choice |
| Grayscale | `sixty-pages.pdf` | 1280 | 1.44–1.59 s |
| Repair | `cut-short.pdf` | 1280, 390 | 12 pages, text identical, qpdf clean |
| Repair | `three-pages.pdf` (sound) | 1280 | 3 pages, clean, nothing reported |
| Repair | `big-250.pdf` | 1280 | 1.66–1.80 s |
| Repair | `no-pages.pdf`, `corrupt.pdf`, `empty.pdf` | 1280 | Taken, shown as damaged, then "has too little left to repair: no page could be read from it." with Start over |

## Lighthouse, axe, SEO

- Lighthouse mobile performance: Grayscale 98, 99, 96 (LCP 1.4–1.9 s, TBT 110–220 ms, CLS 0). Repair 98, 100, 98 (LCP 1.4–1.9 s, TBT 70–170 ms, CLS 0). Accessibility 100 on both.
- axe: 0 violations on landing, loaded and result, both routes, 1280 and 390.
- SEO: Lighthouse SEO 66 on both, from one failed audit, `is-crawlable`. Staging sends `x-robots-tag: noindex, nofollow`, which is right for staging; the page itself has a unique title, a description, a canonical to the public host, `index, follow` and two JSON-LD blocks. Re-check on the public URL. Lab numbers only; no field data exists yet.

## Gaps

- **G-1 (M7, blocks).** Click to Download takes 1.4–1.7 s on files a few KB in size; the reference took 0.8–0.9 s, upload included in neither. The time is not the work: the bar sits at 0% for 0.8–1.1 s while script chunks are fetched after the click (8–9 requests, `instapdf-processing…js` among them), the work itself takes 10–250 ms, then "Done" is held for a fixed ~545 ms before Download appears. Fetch the engine while the file loads (there are 1.5 s idle before the first thumbnail) and cut the hold.
- **G-2 (M6, blocks).** Grayscale lacks two things the reference gives free: text to pure black, and a compress-pictures switch. We add "Pictures only", which it lacks, but parity is the floor. Add them or get a written waiver.
- **G-3 (M8, does not block).** Our grey `colours.pdf` is 5,625 B against the reference's 4,032 B (40% larger). Its file is the one with a coloured gradient left in, so fidelity still wins, but the size gap is worth a look (likely tied to G-2's compress switch).
- **G-4 (M9, wording).** After a failed repair the blue notice "… is damaged. It can still be repaired." stays on screen under the red "… has too little left to repair", and the top row shows "That didn't work." with a Try again that can only fail the same way. Remove the stale notice and offer only Start over.
- **G-5 (M9, wording).** Repairing `cut-short.pdf` ends on the plain "Your PDF is ready, 12 pages" with no word that anything was fixed; the reference says how many pages it recovered. The spec's "N of M pages were recovered" line shows only on loss. Also, Grayscale's "couldn't be opened. It may be damaged" message does not point to Repair.
- **G-6 (coverage).** Not compared against the reference: its error states and its cloud/URL import menu (no task budget). Cached reference evidence covers one small file per tool; a re-check after fixes needs no new reference tasks.
