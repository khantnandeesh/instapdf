# Parity Lab: micro-benchmarks against the reference

The evaluator gate (workflow step 8) checks that each acceptance criterion passes. The Parity Lab goes further. It runs the **same files and the same edits** through the reference site, through BerryPDF and, where useful, through other competitors. Then it measures every step down to milliseconds, bytes and pixels. Each feature must **meet or beat the reference on every metric** before release, and the score is tracked over time.

Owner: `parity-evaluator` runs it and `devops-engineer` keeps it in CI. First consumer: F16 (editor).

## 1. Corpus

`tests/parity/corpus/` holds synthetic files only (never user files). Each file has a manifest entry: producer, font types, and the edits to run.

| File | Why it is hard |
|---|---|
| `std14-reportlab.pdf` | Base case: standard-14 fonts, simple `Tj` |
| `libreoffice-memo.pdf` | Subset TrueType, WinAnsi; typical office export |
| `chrome-justified-mixed.pdf` | Per-glyph positioning, Identity-H subsets, bold/italic in one line, justified, Type 3 fallback glyph (₹) |
| `word-export.pdf` | Word "Save as PDF" (generate on a Windows runner later) |
| `latex-type1.pdf` | Type 1 / CFF subsets, ligatures (fi, fl) |
| `scripts-hi-ar.pdf` | Devanagari and Arabic shaped text |
| `form-acro.pdf`, `xfa-only.pdf` | Forms |
| `scan.pdf` | Image-only page |
| `rotated-90.pdf`, `shared-xobject.pdf` | Rotation; the same Form XObject on several pages |
| `big-300p.pdf` | Scale |

Each file comes with an **edit script** (JSON) that is tool-agnostic, for example: `{page:1, find:"made", replace:"signed"}`, `{page:1, find:"45,000", replace:"59,999 Ž"}`, `{add_text:{x,y,text}}`, `{sign:{type:"Alex"}}`.

## 2. Metrics (per file × tool)

| Group | Metric | How measured |
|---|---|---|
| Privacy | Bytes uploaded; when the upload starts; third-party hosts on the page | Playwright network log (request `Content-Length`, hosts) |
| Speed | Page weight before pick; pick → first page visible; pick → editor interactive; save → file ready; total pick → downloaded | Playwright timestamps, median of 3 runs |
| Edit UX | Edit unit (glyph run / style run / line / paragraph); clicks and keystrokes to complete the script; warnings or dialogs shown; preview font = output font? | Scripted run + screenshots |
| Fidelity | **Untouched-region pixel diff** (must be 0); edited-run glyph-shape match vs the original font; extracted text == expected; neighbouring glyph drift (pt); font reused vs substituted; Type 3 or other content lost; justification kept | pypdfium2 + pdf.js render at 2×, pdfplumber chars, pdffonts |
| Output health | `qpdf --check`; opens in PDFium, pdf.js, Chrome; size delta | CLI oracles |
| Limits | Free-tier gates hit (tasks/hour, pages, MB, login, watermark, paywall) | Scripted |
| Mobile | Same script at 390×844: toolbar fits, touch targets ≥ 44 px, completes | Playwright device profile |

**Score:** each metric is normalised to 0–100 against the best value seen across tools. The feature's Parity Lab score is the weighted mean: fidelity 40, privacy 20, speed 20, UX 15, limits 5. Release gate: BerryPDF ≥ reference on **every** metric group, and fidelity's untouched-region diff is 0 on every file.

## 3. Running it

- **Ours:** on every PR that touches the feature (staging preview), all files, 3 runs each.
- **Reference:** nightly at most, **≤ 3 tasks per hour** and ≤ 1 request/second (CLAUDE.md rule 7). A rehearsal ("dry") pass without saving comes first, then saves are spent only on runs whose edits registered. Results are cached by (corpus hash, reference build id); re-run only when either changes.
- **Other competitors:** monthly, ≤ 2 runs per site, no login, no evading bot protection.
- Output: `docs/evals/parity/<feature>-<date>.md` with the table, the score, side-by-side screenshots, and diffs. Screenshots of other sites are internal evidence only and never ship (CLAUDE.md rule 1).

## 4. Rules for the lab

1. Synthetic files only. Never upload a user's file anywhere.
2. Measure, don't assume. Every claim in a spec or on the site links to a lab result or to a source.
3. A metric we lose is a bug with an owner, not a footnote.
