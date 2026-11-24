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
   tolerance). If the check fails, the edit is rolled back and an error is returned.
7. **Save.** The output is the original bytes plus one appended revision (incremental update).
   It is read back and every object is compared with the engine's copy.

## Commands

```
cd crates
cargo test                                  # unit and integration tests
cargo build -p berry-cli && python3 oracle/run_corpus.py   # PDFium oracle over tests/parity/editor
cargo build -p berry-wasm --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/berry_wasm.wasm --out-dir berry-wasm/pkg --target web --out-name berry_engine
node berry-wasm/smoke.mjs
```

The oracle needs `pypdfium2`, `pikepdf`, `pillow` and the Liberation, Carlito and Caladea fonts.

## Known limits (next steps)

- Edits one line at a time. Paragraph reflow is phase E3.
- Fallback fonts must have TrueType outlines. Text in a fallback font is not shaped yet
  (no kerning or ligatures; complex scripts are phase E4 with HarfRust).
- Vertical text, CID fonts with a non-Identity CMap and invisible (OCR) text are read-only.
- A shared Form XObject nested inside another form is refused (`shared-nested-form`).
- Superscripts and subscripts are separate lines. Table cells closer than 1.5 em read as one line.
- Fake-bold text drawn twice reads as doubled characters.
- No width-fitting (`Tz`) of substitute fonts yet (AC-11e), and no style changes, move or delete
  of existing text (AC-12, AC-13).
- The WebAssembly module is about 0.8 MB gzip. It is loaded only when the editor opens a file.

## Licences

All dependencies are MIT, Apache-2.0 or BSD, except two permissive licences that CLAUDE.md
rule 3 does not name: **Zlib** (`zlib-rs`, the inflate code inside `lopdf`) and **Unicode-3.0**
(Unicode data tables in `unicode-normalization`, `unicode-properties`, `unicode-ident`).
Neither is copyleft. `oracle/check_licences.py` enforces the list in CI.
The tables in `berry-engine/src/tables.rs` are generated from reportlab (BSD) and the Adobe
Glyph List (BSD-3-Clause).
