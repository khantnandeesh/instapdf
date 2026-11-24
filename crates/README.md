# Berry engine

The edit engine behind the BerryPDF editor (spec: `docs/specs/f16-pdf-editor.md` §3d). One Rust
codebase that runs as WebAssembly in the browser and natively for the consented server fallback.

| Crate | What it is |
|---|---|
| `berry-engine` | The engine: read text with exact position, font and colour; group it into words, lines and paragraphs; check glyph coverage in the embedded font; replace text surgically; verify the result |
| `berry-wasm` | WebAssembly bindings. The typed interface the UI calls is `berry-wasm/berry-engine.d.ts` |
| `berry-cli` | `berry text` and `berry replace`, used by the oracle and later by the server fallback |
| `oracle/` | Test-only checks with PDFium and qpdf. PDFium is never the edit engine |

## How an edit works

1. **Read.** `interp.rs` walks the page's content stream (and Form XObjects) with the full text
   state and records every glyph: position, font, size, colour and the exact operator, array
   element and byte that drew it. `content.rs` keeps each operator's byte span.
2. **Group.** `layout.rs` builds lines, style runs, words and paragraphs. A gap made by
   positioning (justified text) becomes a *virtual* space: it reads as a space but has no glyph.
3. **Diff.** `Engine::replace_line` compares old and new text and keeps the common start and
   end. Only the glyphs in between are touched.
4. **Choose fonts per character.** `font.rs` parses the embedded font program itself (TrueType,
   CFF, Type 1 names, Type 3 procedures). A character is drawn in the original font when that
   font has a code for it that round-trips and a non-empty outline. Otherwise `fallback.rs`
   picks the same family, then a metric-compatible open font, from the fonts the host
   registered, and only that character changes font. With no usable font the edit is refused
   with `missing-glyphs` and the list of families to fetch.
5. **Rewrite in place.** Only the show operators that hold changed glyphs are rewritten. The new
   text goes where the old text was, in the same operator, so colour, clipping, marked content
   and draw order are inherited. The rest of the line shifts by the change in width, using
   `TJ` spacing numbers or a `Td`, and anything else on the page is put back exactly. A shared
   content stream or Form XObject is copied first, so other pages do not change.
6. **Check, then keep.** The page is read again and compared glyph by glyph with the plan: same
   glyph, font, size and colour, at the old position plus the planned shift (0.05 pt
   tolerance). A space typed in a font without a space glyph (every TeX font, many subsets) is
   a gap before the new glyphs, and the check expects them after it. An edit that would push the
   line past the page edge, or into other text on its baseline (a TOC page number, the next
   column), is refused too. If any check fails, the edit is rolled back and a `verify` error
   with a reason code is returned: `text-mismatch`, `position-drift`, `glyph-mismatch`,
   `overflow` or `overlap`. Letters a subset cannot draw alone but has as a ligature (a TeX
   heading that kept only "fi") are drawn with the ligature.
   Complex scripts (Hindi and the other Indic scripts, Arabic, Hebrew) take their own path in
   `complex.rs`: the edit widens to whole words, the new text is laid out with the Unicode
   bidi algorithm and each word is drawn from the same word already on the page, the embedded
   font (when it still has its layout tables), or a registered open font shaped with
   rustybuzz (`shape.rs`). New words get `/ActualText` where their glyphs alone would not read
   right. Reading (`layout.rs`) rebuilds logical order from ActualText, or from glyph order with
   the Indic and inverse-bidi rules in `script.rs`; the spec is `docs/specs/f16-complex-scripts.md`.
   A registered-face glyph keeps the first ToUnicode text written for it; the same glyph
   needed with another text (a letter with and without its harakat) gets an alias code past
   the font's glyph ids, mapped through a CIDToGIDMap, so both words read from their glyphs.
   On either path, an edit that touches an `/ActualText` span (a ligature, replaced text)
   rewrites the whole span with its real characters and removes the span. Its other
   properties, such as a tagged PDF's `/MCID`, stay; a named property list holding more than
   the ActualText is left alone and the edit is refused (`actual-text-span`). When the read-back
   of a right-to-left line has the right glyphs in the wrong order (digits or Latin typed into
   Arabic, which readers reorder with their own bidi rules), the edit is refused
   (`text-mismatch`), not wrapped in ActualText. In a line with right-to-left text that reads by
   its glyphs, a new word that would need ActualText is refused the same way, since pdf.js
   ignores ActualText; digits an Arabic subset draws but does not map go through a sibling font
   instead (see Known limits). Two more cases PDFium orders differently from
   UAX #9 (the engine's read-back) are refused the same way in a right-to-left line:
   punctuation typed next to punctuation
   ("تجريبي." + "، نعم" reads "تجريبي،. نعم"; also ".!", ": ", ", "), and a left-to-right run
   of two or more words (" abc def" reads "defabc"). The editor offers "Replace with new text"
   for all of them.
7. **Save.** The output is the original bytes plus one appended revision (incremental update).
   It is read back and every object is compared with the engine's copy. A failure is a `save`
   error with a reason code (`write-failed`, `prefix-changed`, `reparse-failed`,
   `object-mismatch`, `page-mismatch`, `text-mismatch`).

## Commands

```
cd crates
cargo test                                  # unit and integration tests
cargo build -p berry-cli && python3 oracle/run_corpus.py   # PDFium oracle over tests/parity/editor
python3 oracle/check_shaping.py             # new Hindi words: engine glyphs == HarfBuzz glyphs
cargo build -p berry-wasm --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/berry_wasm.wasm --out-dir berry-wasm/pkg --target web --out-name berry_engine
node berry-wasm/smoke.mjs
FUZZ_N=1500 FUZZ_OUT=/tmp/fz cargo test --release --test fuzz -- --nocapture   # random content streams
```

The tests and the oracle need the Liberation, Carlito and Caladea fonts; the oracle also needs
`pypdfium2`, `pikepdf` and `pillow`, and `check_shaping.py` needs `uharfbuzz` (Apache-2.0).
The Hindi and Arabic fixtures use the OFL fonts vendored in `tests/parity/editor/fonts/`.

Hostile files are bounded: 32 levels of array/dictionary nesting, 2,000,000 operators, 1,000,000
glyphs, 4,000 form invocations, 128 MB per decoded stream and 131,072 entries per width or
ToUnicode map. Past a limit the page is read-only with a reason, never a hang.

## Known limits (next steps)

- Edits one line at a time. Paragraph reflow is phase E3.
- Fallback fonts must have TrueType outlines. Latin text in a fallback font is not shaped
  (no kerning or ligatures); complex-script words are.
- A Latin letter typed inside an Arabic word next to digits or a Latin word can read back in
  the wrong order and is refused (`text-mismatch`); the editor offers "Replace with new text".
- Adding new text (not editing a line) is not in the engine yet, so there is no shaping call for
  it in the interface.
- PDFium reverses right-to-left `/ActualText`, so for Arabic and Hebrew the engine relies on the
  glyphs' own Unicode where it can (a registered face is preferred over an embedded font whose
  ToUnicode map lacks the new glyphs). Chrome- and LibreOffice-made Arabic, which uses
  ActualText throughout, already reads reversed in PDFium before any edit.
- pdf.js orders the text items of a line by content order. A word drawn in a font the line
  doesn't otherwise use (a registered face, for letters the subset lacks, as in AC-205's
  "بالعالم،" → "بالجميع،" on scripts-plain.pdf) is its own item, so in a right-to-left line pdf.js
  can read the words out of order ("هذا نص تجريبي. بالجميع، مرحبا"). PDFium reads those edits in
  order (checked for AC-205 and an appended Arabic word); refusing them would refuse most
  Arabic word edits on such files, so they are kept. This is a pdf.js-only limit: every kept edit
  must read correctly in PDFium, and the cases where PDFium reorders are refused (above).
- A digit (or other left-to-right text) typed into an Arabic line reads by its glyphs, with no
  ActualText, in two ways:
  - the line's font maps the digit in its ToUnicode: drawn in place;
  - otherwise (no entry for the code, or an entry for other text): the digits are drawn through a
    *sibling* font, a copy of the font's dictionary with the same program and its own ToUnicode
    for just the codes it draws (a Type 0 sibling also declares their widths, from the program,
    in a copy of its CIDFont). The font's own ToUnicode is never changed: other pages, forms and
    text may share it, and a new entry would change how they read. The sibling is a text item of
    its own, so in a right-to-left line it is drawn after the line's last glyph, where pdf.js
    reads it in logical order; that works when the new text ends the line (oracle case
    `plain-arabic-digits-unmapped-at-end`). Anywhere else in the line (inside it, or at its
    start) no content order reads right in pdf.js, so the edit is refused (`text-mismatch`;
    oracle case `plain-arabic-number-unmapped`, "2500" → "3750" on scripts-plain.pdf, whose
    subset has no width for "3"). pdf.js drops the space between the line and the sibling's
    digits ("تجريبي.2024"), as it does at any change of font and direction there; PDFium and
    copy and paste keep it. Each such edit makes a new sibling (reusing one is a follow-up), and
    a second digit edit at the end of the same line is refused for now (the engine reads the
    line back with the sibling runs out of order).
  Tests: crates/berry-engine/tests/font_mapping.rs, and pdfium and pdf.js read-back in
  apps/web/src/lib/editor/mixed-direction.test.ts.
- Lines already drawn with ActualText spans (Chrome and LibreOffice Arabic) are not covered by
  the ActualText refusal: neither reader reads them by their glyphs before an edit either.
- Vertical text, CID fonts with a non-Identity CMap and invisible (OCR) text are read-only.
- A shared Form XObject nested inside another form is refused (`shared-nested-form`).
- Superscripts and subscripts are separate lines. Table cells closer than 1.5 em read as one line.
- Fake-bold text drawn twice reads as doubled characters.
- No width-fitting (`Tz`) of substitute fonts yet (AC-11e), and no style changes, move or delete
  of existing text (AC-12, AC-13).
- A line that grows past the next column is not flagged yet.
- Saving holds the original and the new file in memory together (about 2x the file size).
- Owner-password permission flags are not enforced; that is a product decision for the editor.
- Two WebAssembly modules with one interface: `berry_engine` (default, about 0.75 MB gzip)
  reads Hindi and Arabic but marks those lines read-only with `needs-shaping`;
  `berry_engine_shaping` (cargo feature `shaping`, about 0.98 MB gzip) adds rustybuzz and
  edits them. The editor loads the second only when someone edits such a line. `berry-cli`
  always has shaping. Neither module loads until the editor opens a file.

## Licences

All dependencies are MIT, Apache-2.0 or BSD, except two permissive licences that CLAUDE.md
rule 3 does not name: **Zlib** (`zlib-rs`, the inflate code inside `lopdf`) and **Unicode-3.0**
(Unicode data tables in `unicode-normalization`, `unicode-properties`, `unicode-ident`).
Neither is copyleft. `oracle/check_licences.py` enforces the list in CI.
`berry-engine/src/script_tables.rs` (marks, right-to-left letters, digits, scripts and
presentation forms) is generated by `berry-engine/tools/gen_script_tables.py` from Python's
Unicode data and fontTools (MIT), so the default module carries no general Unicode crates.
The tables in `berry-engine/src/tables.rs` are generated from reportlab (BSD) and the Adobe
Glyph List (BSD-3-Clause).
