# Editor micro-checks (F16 annex to mission.md M1–M11)

`docs/process/mission.md` is the source of truth for our goal, ways of work and the M1–M11 micro-comparison gate. This annex lists only what the **editor** adds to that gate: the test corpus, the edit scripts and the extra measurements under each M-check. Each check is still scored **win / tie / lose** against the reference, and the mission's pass rule applies: no lost check without the owner's written waiver.

## 1. Corpus

`tests/parity/editor/` holds synthetic files only, never user files. Each file has a manifest entry giving its producer, font types and edit script.

| File | Why it is hard |
|---|---|
| `std14-reportlab.pdf` | Base case: standard-14 fonts, simple `Tj` |
| `libreoffice-memo.pdf` | Subset TrueType with WinAnsi encoding; a typical office export |
| `chrome-justified-mixed.pdf` | Per-glyph positioning, Identity-H subsets, bold and italic in one line, justified text, a Type 3 fallback glyph (₹) |
| `word-export.pdf` | Word "Save as PDF" (to be generated on a Windows runner) |
| `latex-type1.pdf` | Type 1 / CFF subsets, ligatures (fi, fl) |
| `scripts-hi-ar.pdf` | Shaped Devanagari and Arabic |
| `form-acro.pdf`, `xfa-only.pdf` | Forms |
| `scan.pdf` | Image-only page |
| `rotated-90.pdf`, `shared-xobject.pdf` | Page rotation; one Form XObject reused on several pages |
| `big-300p.pdf` | Scale |

Edit scripts are JSON and don't depend on any one tool, for example `{page:1, find:"made", replace:"signed"}`, `{page:1, find:"45,000", replace:"59,999 Ž"}`, `{add_text:{x,y,text}}`, `{sign:{type:"Alex"}}`.

## 2. Extra measurements per M-check

| Check | Editor-specific measurement |
|---|---|
| M2/M3 | Bytes uploaded and when the upload starts (the reference uploads the whole file the moment it is picked); time from pick to first page; time from pick to editor ready |
| M5 | The unit of an edit (glyph run, style run, line or paragraph); clicks and keystrokes needed to finish each script; whether the preview font matches the output font |
| M7 | Time from save to file ready; total time from pick to download (median of 3 runs) |
| **M8** | **Untouched-region pixel diff at 2× in both PDFium and pdf.js (must be 0)**; glyph-shape match of the edited run against the original font; extracted text equals expected; drift of neighbouring glyphs (pt); original font reused or substituted; any lost content (e.g. Type 3 text); justification kept; `qpdf --check`; change in file size |
| M9 | Behaviour on scanned pages, Type 3 text, text with no ToUnicode map, XFA forms, rotated pages and complex scripts |
| M10 | Free-tier gates hit (saves per hour, pages, MB, login, watermark, paywall) |

## 3. Running it

- **Ours:** on every editor PR, against the staging preview: all files, 3 runs each.
- **Reference:** cached in `docs/evals/cache/f16/` and re-run only when the reference build changes, at most 3 saves per hour. Rehearse each run without saving first, and spend a save only once the edits register.
- **Other competitors:** monthly, at most 2 runs per site, with no login and no attempt to evade bot protection.

Baseline (2026-11-23): see `docs/specs/f16-pdf-editor.md` §2a-bis and §3b.
