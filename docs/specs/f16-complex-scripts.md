# F16 engine: editing Hindi (Devanagari) and Arabic text

Part of the PDF editor (`f16-pdf-editor.md`, phase E4, AC-20 to AC-22). Engine only: `crates/berry-engine`
and `crates/berry-wasm`. The editor UI picks this up through the existing `berry-engine.d.ts` contract
plus one additive field (`Line.direction`), agreed with the lead on 2026-11-24.

## 1. What the reference does (recorded 2026-11-24, one task)

File: `tests/parity/editor/scripts-plain.pdf` (Word-style producer, see §3). Captures are in
`/mnt/project-files/designs/complex-scripts/sejda/`.

| Step | Reference behaviour |
|---|---|
| Open | Renders the page correctly (its viewer is pdf.js). Shows "Right to left scripts are not fully supported". |
| Click a Hindi line | The edit box text is already wrong before any typing: राशि reads रिशि, a detached ि sits after पर, and the first letters of the next line (प्र) are pulled into the box. |
| Click an Arabic line | Separated letters plus stray Latin symbols (Ń, Ġ, Ħ) from unmapped glyphs. Shows "Complex script alphabets are not supported (eg: Arabic, Devanagari)". |
| Type a word at the end of each line | Hindi: shown unshaped (धन्यवाद with a visible virama). Arabic: "Original font replaced" notice; the line now overflows the page. |
| Apply (server) | Output Hindi line: "कुल रा ि श का भुगतान समय पर ि किया गया।प् र धन् यवाद": every conjunct and pre-base vowel broken, and the untouched words too. Arabic line: unreadable, overprinted and off the right edge. |

So the reference loses on every step for these scripts: reading, editing, shaping, output and copy-paste.

## 2. How real producers write these scripts (inspected 2026-11-24)

| Producer | Logical text | Marks and dots | Fonts |
|---|---|---|---|
| Chrome (Skia) print | One `/Span <</ActualText …>> BDC … EMC` per cluster; RTL runs inside `/ReversedChars BMC`. ToUnicode maps glyphs it cannot map to `<0000>`. | Arabic dots are separate glyphs moved with vertical `Td` | Type 0, Identity-H, subset with `cmap` but **no GSUB/GPOS** |
| LibreOffice | ActualText per cluster; ToUnicode maps the first glyph of a cluster to the whole cluster | as glyphs | simple TrueType, subset, no layout tables |
| Word-style (no ActualText) | Per-glyph ToUnicode in **visual** order: पूणर् for पूर्ण, िवराम for विराम; Arabic reversed, sometimes presentation forms (U+FExx) | marks positioned with `TJ` and `Ts` | Type 0, often the full font |

Consequences for the engine:
1. Read ActualText; otherwise rebuild logical order (Indic pre-base matra and reph, inverse bidi, presentation forms).
2. Never trust a subset to shape new text: subsets have no GSUB. New text is drawn from glyphs the page already shows, from the embedded font only when it really has layout tables, or from a registered OFL face shaped by the engine.
3. Copy and search must keep working: every new word is wrapped in ActualText.

## 3. Fixtures

In `tests/parity/editor/`, built by `generate.py` / `gen_scripts_plain.py` (all fonts OFL, vendored in `fonts/`):

- `scripts-chrome.pdf`: Chrome print of `scripts.html` (Noto Sans Devanagari, Noto Naskh Arabic, Carlito).
- `scripts-libreoffice.pdf`: LibreOffice export of the same HTML.
- `scripts-plain.pdf`: Word-style file built with HarfBuzz (uharfbuzz, Apache-2.0, test-only): visual order, per-glyph ToUnicode, no ActualText, full fonts with GSUB/GPOS.

## 4. Design

**Read.** The interpreter tracks marked content. A glyph inside an ActualText span belongs to that span; the
span is one *cluster* whose text is the ActualText. Glyphs with no Unicode that overlap a neighbour (dots, marks,
the other half of a ligature) join that neighbour's cluster. Lines are grouped on cluster baselines, so a dot moved
up or down never becomes its own line. Each line is then put in logical order:
- Devanagari (and the other Indic scripts) without ActualText: a pre-base matra (ि) moves after its consonant
  cluster, a reph (र्) drawn after its cluster moves before it.
- Arabic and Hebrew: the line's direction comes from its strong characters (and `/ReversedChars`). Right-to-left
  runs are reversed, numbers and Latin stay left to right, brackets are mirrored, and presentation forms are
  folded to the base letters.

**Edit.** In a line with complex-script text, the unit of an edit is the whole word (Arabic joining and Indic
conjuncts depend on neighbours). The removed words must be one visually contiguous block; otherwise the edit
widens to the whole line. New text is laid out with the Unicode bidi algorithm and drawn, per word, by the first
source that is exact:
1. **Reuse**: the same word in the same font already on the page; its glyphs and relative positions are copied.
2. **Embedded shaping**: the embedded program has `cmap` and GSUB for the script and covers the word.
3. **Registered face**: the same family if the host registered it, else the script's stand-in (Noto Sans or Serif
   Devanagari, Noto Naskh or Sans Arabic), shaped with rustybuzz and subset-embedded like other fallbacks.
If none can draw a word the edit fails with `missing-glyphs`, naming the script family to fetch.

Glyph offsets become `TJ` adjustments and `Ts` rise (restored after). A new word is wrapped in
`/Span <</ActualText (…)>> BDC … EMC` when its glyphs' own Unicode mappings would not read as the word
(Devanagari reordering, conjuncts) or the line already uses ActualText; the ActualText spans of removed
clusters are deleted with them. Right-to-left words avoid ActualText when they can, because PDFium (Chrome's
viewer) reverses right-to-left ActualText: they are drawn so that each glyph maps to its own letter (dotted
Arabic letters stay whole, `ccmp` off), and a registered face, whose ToUnicode map the engine writes, is
preferred over an embedded font whose map lacks the new glyphs.
Left-to-right lines keep their start and grow to the right; right-to-left lines keep their right edge and grow
to the left. The usual check then runs: the page is read again, every untouched glyph must be unchanged
(code, font, size, colour, position ±0.05 pt), every new glyph must sit where planned, and the edited line must
read back as exactly the requested text.

**Contract** (`berry-engine.d.ts`, additive): `Line.direction: "ltr" | "rtl"`; `read_only_reason` is the closed
list `"vertical-text" | "unsupported-encoding" | "invisible-text" | "legacy-font-encoding" | "needs-shaping"`
(the last only from the default build, which has no shaper: load `berry_engine_shaping` to edit); `FontRequest.families`
may name script families. Nothing else changes.

## 5. Acceptance criteria (AC-200 to AC-229 are reserved for this work)

- **AC-200 (P0)** On `scripts-chrome.pdf` and `scripts-libreoffice.pdf`, every Hindi and Arabic line reads exactly
  as the source text: no U+FFFD, no split marks, and the page has one line per source paragraph.
- **AC-201 (P0)** On `scripts-plain.pdf` (no ActualText, visual order), every line reads exactly as the source text
  (राशि, not रािश; पूर्ण, not पूणर्; Arabic in logical order with numbers left to right).
- **AC-202 (P0)** `Line.direction` is `"rtl"` for the Arabic lines and `"ltr"` for the others.
- **AC-203 (P0)** Replacing a Hindi word (कुल → संपूर्ण) gives a correctly shaped word: the rendered edited region
  matches HarfBuzz's rendering of the same word in the same font (pixel diff under threshold), and no glyph is
  missing or `.notdef`.
- **AC-204 (P0)** After any edit, the engine's own reading of the edited line equals the requested text, and
  PDFium's text contains the new words as typed (copy and search work). PDFium's reading of the untouched
  words is whatever it was before: it already misreads Chrome and LibreOffice Hindi and Arabic and
  Word-style Hindi (रािश), so whole-line equality in PDFium is not a criterion.
- **AC-205 (P0)** Replacing an Arabic word renders joined, right to left, with the line's right edge unchanged.
- **AC-206 (P0)** Editing a number inside an Arabic line (2500 → 3750) keeps it left to right in the right place.
- **AC-207 (P0)** Everything outside the edited words is unchanged: same glyphs at the same positions (±0.05 pt)
  and identical pixels outside `EditResult.changed`.
- **AC-208 (P1)** When the new words already appear on the page in the same font, the edit uses the original
  font's glyphs and reports no substitution.
- **AC-209 (P1)** When the embedded font has its layout tables and covers the text (`scripts-plain.pdf`), new
  words are shaped with it and no fallback font is added. For a right-to-left word this also needs the
  font's ToUnicode map to cover the new glyphs (see §4); otherwise the same family is used as a registered face.
- **AC-210 (P0)** When no font can draw the new text, the edit fails with `missing-glyphs` and the request lists the
  same family first, then the script's Noto family.
- **AC-211 (P0)** Inserting inside a word (भुगतान → भुगतानों) re-shapes the whole word.
- **AC-212 (P1)** Text in legacy non-Unicode Hindi fonts (Kruti Dev, DevLys, Chanakya and similar) is read-only with
  `legacy-font-encoding`.
- **AC-213 (P0)** The WebAssembly module stays under the 1 MB gzip budget; the size change is reported in the PR.
- **AC-214 (P0)** Existing Latin edits are unchanged: every earlier engine test and the PDFium oracle stay green.
- **AC-215 (P0)** Side by side with the reference on the same file and edits (§1), BerryPDF's output reads
  correctly and is correctly shaped where the reference's is broken.

## 6. Results (2026-11-24)

| AC | Result | Evidence |
|---|---|---|
| 200, 201, 202 | Pass | `crates/berry-engine/tests/complex.rs` `ac200_201_202_reading`: all three fixtures |
| 203, 211 | Pass | `ac203_hindi_word_replace`, `ac211_insert_inside_word`; `crates/oracle/check_shaping.py`: engine glyph ids equal HarfBuzz's for संपूर्ण, भुगतानों, धन्यवाद |
| 204 | Pass | engine: every edit test reads the line back; PDFium: 10 oracle cases in `manifest.json` (`plain-*`, `chrome-*`, `lo-*`) |
| 205, 206 | Pass | `ac205_arabic_word_replace_keeps_right_edge` (right edge within 0.5 pt), `ac206_number_in_arabic_line` |
| 207 | Pass | the engine's own glyph check on every edit; oracle: no pixel changes outside `changed` on all 10 cases |
| 208, 209 | Pass | `ac208_reuse_page_words`, `ac209_embedded_font_shapes_when_it_can` |
| 210 | Pass | `ac210_missing_glyphs_names_script_family` |
| 212 | Pass | `ac212_legacy_hindi_font_is_read_only` |
| 213 | Pass | Two modules (lead, 2026-11-24): default `berry_engine` 721,152 → 757,863 bytes gzip (+37 KB, for reading Hindi and Arabic right), complex-script lines read-only with `needs-shaping`; `berry_engine_shaping` 974,185 bytes gzip, loaded only to edit them. Shaper alone: rustybuzz 234 KB gzip, HarfRust 0.16 309 KB (it would also add a second read-fonts version). |
| 214 | Pass | all earlier engine tests and the 18 earlier oracle cases unchanged |
| 215 | Pass | `/mnt/project-files/designs/complex-scripts/side-by-side-append.png`: the reference breaks every conjunct and the Arabic line; ours is shaped and reads right |

