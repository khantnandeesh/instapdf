# F16 engine research: how the reference editor engine works's PDF editor engine works (research for BerryPDF / InstaPDF)

Date: 2026-11-23. Tags: **[V]** verified in code, binaries or docs · **[A]** my analysis · **[U]** unverified.

Licence note: sejda-sdk is **AGPL-3.0** (since commit `2e7f364dd`, 2015-08-03, "Moving to GNU Affero GPLv3"). This report describes techniques in my own words. **No code is copied**, and none may be copied into our repo. SAMBox is Apache-2.0. The Sejda Desktop binaries are proprietary (EULA). I only listed the file and class names inside them and grepped readable strings. I did not decompile or run anything.

Sources examined (local, under `scratch/`):
- `sejda-src/sejda-git`: full clone of github.com/torakiki/sejda (HEAD `b4ce669`, 2026-11-12, version 5.1.28-SNAPSHOT), including all history.
- `sejda-src/sambox-git`: github.com/torakiki/sambox (HEAD `b941b73`, 2026-11-20, 3.0.43-SNAPSHOT).
- `sejda-src/pdfsam-git`: github.com/torakiki/pdfsam (it has no editor code).
- `sejda-deb/`: the Sejda Desktop 7.9.12 `.deb`, the official CDN download linked from the AUR PKGBUILD. Only its file list and some string greps were used.
- Maven Central metadata for `org.sejda:*`.

---

## TL;DR

1. **The editor engine is proprietary.** Today it lives in a closed **Scala** jar, `com.sejda.common` (package `code.sejda.tasks.edit.EditTask`, `EditTextOperation`, `PageTextRedactor`, `PdfTextRedactingStreamEngine`, `FontsHelper`, `GoogleFonts`, …). That jar runs on top of open sejda-core and SAMBox. **[V]** The first version of "edit existing text" *was* in the open AGPL repo from Sept 2016 to Feb 2017, so its algorithm is readable in git history. **[V]**
2. **`3.0.42 (5.1.27) ` = SAMBox 3.0.42 (Sejda SDK 5.1.27).** Both are the newest releases on Maven Central. The closed jar's `PdfLibraryUtils` reads `org.sejda.sambox.util.Version.getVersion`, `org.sejda.core.Sejda.VERSION` and writes `SAMBox.PRODUCER`. **[V]** components, **[A]** exact format.
3. **The core technique** is "redact and re-append", not editing in place:
   - Run a text-aware content-stream interpreter over the page.
   - Drop (or shorten) every show-text operator whose glyphs fall in the edited bounding box. Inside a `TJ` array, replace only the removed substring with an equal-width kerning number, so the neighbouring text does not move.
   - Copy everything else to a new stream.
   - Append a fresh `BT … ET` at the leftmost original glyph's position, using **the same PDFont object**. SAMBox's `PDResources.add` then reuses the existing resource name, which is why our capture showed the same `/4R`-style font.
4. **Glyph coverage check:** encode the string with the font, then for each code check `getPath(code)` is non-empty, `CIDToGIDMap[code] != 0`, and decode(encode(text)) == text. **[V]** The browser side runs a canvas pixel test (`missingGlyphCanvas`) against the pdf.js-loaded embedded font to decide whether to show the **Font Replacement** dialog. **[V]** string, **[A]** mechanism.
5. **Subset fonts are never extended with new glyphs.** When a subset font (`ABCDEF+Name`) lacks a typed glyph, Sejda tries these in order:
   - the full original font from the system (desktop) or by name match;
   - a "similar" font: same family stem plus bold/italic flags;
   - a per-character fallback chain of bundled, metric-compatible and Google fonts (Liberation, Arimo, Tinos, Carlito, Caladea, Noto, …), mixed run by run within the line.
   **[V]**
6. **Our recommendation:** replicate the technique ourselves in TypeScript, in the browser, on a pdf.js-derived parser. Keep a small server fallback. Candidate engines: **PDFium** (BSD/Apache, has page-object text APIs, also ships as WASM); **qpdf** (Apache) for structure; a Rust stack (`lopdf` + `pdf-writer` + `subsetter`/`allsorts`) if we want our own engine. PDFBox/SAMBox would work on the server but is the weakest fit (JVM cold starts on Cloud Run, not browser-capable). **MuPDF is AGPL and forbidden.**

---

## 1. Open versus closed: what is where

### 1.1 Open source (AGPL sejda-sdk, Apache SAMBox) **[V]**

Open tasks still in `sejda-git/sejda-sambox/src/main/java/org/sejda/impl/sambox/`: AlternateMix, ExtractByOutline, ExtractPages, Merge, PdfToMultipleImage, PdfToSingleImage, Rotate, SetMetadata, SetPagesLabel, SetPagesTransition, SplitByOutlineLevel, SplitByPageNumbers, SplitBySize, Unpack, ViewerPreferences, AddBackPages.

Open components that are relevant to editing:

| File (sejda-git) | What it does |
|---|---|
| `sejda-sambox/.../util/FontUtils.java` | `canDisplay`, `findFontFor`, `fontOrFallback`, `resolveFonts` (split a string into runs, one font per run), `FontSubsetting` (detects a subset, `loadOriginalOrSimilar`), encode/decode round-trip check, CIDToGIDMap check |
| `sejda-sambox/.../component/PageTextWriter.java` | Appends a `BT…ET` with per-run font switching, crop-box and rotation compensation, faux italic via shear |
| `sejda-sambox/.../component/font/FallbackFontsProvider.java` | ServiceLoader SPI. The closed jar plugs `code.sejda.tasks.common.DefaultFallbackFontProvider` into it |
| `sejda-fonts/` | Bundled `NotoSansMerged-Regular/Bold.ttf` (about 20 Noto scripts merged with nototools), OFL |
| `sejda-sambox/.../component/PdfTextExtractorByArea.java`, `PdfVisibleTextStripper.java`, `TextWithFont.java` | Text extraction by area, and text runs paired with fonts |

SAMBox (Apache-2.0, `sambox-git/src/main/java/org/sejda/sambox/`): `input/ContentStreamParser.java`, `output/ContentStreamWriter.java`, `contentstream/PDFStreamEngine.java`, `text/PDFTextStreamEngine.java`, `text/PDFTextStripper.java`, `text/TextPosition.java`, `pdmodel/font/TrueTypeEmbedder.java`, `BaseTTFSubsetter.java`, and `PDResources.add`, which returns the existing key when the same font object is already in `/Resources/Font` (lines ~691-701).

### 1.2 Moved to closed source (git evidence) **[V]**

`git log --diff-filter=D` on `*Task.java` in sejda-git:

| Date | Commit | What left the open repo |
|---|---|---|
| 2016-09-27 | `f4e2db49f` | "Edit task: adds support for editing existing text" (added in the open repo) |
| 2016-10-06/08 | `46328878b`, `04f38adeb`, `d88d4dd7f` | Fixes for RTL ordering, shared Form XObjects and partial `TJ` redaction |
| **2017-01-11** | **`5b3fe59e1` "Moves edit task"** | `EditTask`, `EditParameters`, `Add{Image,Shape}Operation`, `AppendTextOperation`, `EditTextOperation`, `Highlight/StrikethroughTextOperation`, `Insert/DeletePageOperation` |
| 2017-02-22 | `da17ca967` "pro tasks moved to a separate project" | `PDFTextRedactingStreamEngine`, `PageTextReplacer`, `PageGeometricalShapeWriter`, Crop, ExtractText, Nup, Optimize, Repair, SplitByText, SplitDownTheMiddle |
| 2019-08/09 | `f5776ffb6`, `528e881f5`, `0b9a468a9`, `2bdae5044`, `dc915852d`, `d8836a9ad` | Optional fonts (CJK), Encrypt/Decrypt, CombineReorder, Watermark, HeaderFooter, Scale, Resize, JpegToPdf, PdfToExcel, the console |

To read the last open versions (for understanding only, never copy):
`git -C sejda-git show da17ca967^:sejda-sambox/src/main/java/org/sejda/impl/sambox/component/PDFTextRedactingStreamEngine.java` (and likewise `PageTextReplacer.java`, plus `5b3fe59e1^:` for `EditTask.java`).
Links: https://github.com/torakiki/sejda/commit/5b3fe59e18037f06ddc217484226e945c58d6e5e · https://github.com/torakiki/sejda/commit/da17ca967

### 1.3 What is inside the proprietary product today (Sejda Desktop 7.9.12 file list) **[V]**

`/opt/sejda-desktop/resources/`:
- `app.asar`: the Electron front-end. Bundles **pdf.js 4.10.38** (`pdfjsVersion = "4.10.38"`). Contains the operations list `editTextOperations, imageOperations, shapeOperations, insertPageOperations, deletePageOperations, highlightTextOperations, editHighlight…`, plus `FontReplacementModal`, `#fontReplacementPrompt`, `editor.previousFontReplacements` and `missingGlyphCanvas`. The web editor almost certainly shares this front-end **[A]**.
- `vendor/jdk25-linux/`: a bundled JDK 25 runtime. **So Sejda Desktop = Electron UI + a local Java/Scala engine process (`desktop-launcher`).** **[V]**
- `vendor/desktop-launcher/lib/`:
  - open jars: `org.sejda.sambox-3.0.38`, `sejda-core/model/sambox/fonts/image-writers-5.1.23`, `fontbox-2.0.34`, POI, BouncyCastle, icu4j, Scala 2.13;
  - closed jars: `org.sejda.sejda-{core,model,sambox,fonts}-pro-5.1.21` (Encrypt, Watermark, Optimize, Repair, Crop, Nup, ExtractText, …). The pro jar also has **`ExistingTTFSubsetter`, `ExistingType0CIDType2Subsetter`, `FontSubsettingContext`, `BytesToGlyphIDLookup`**, used by Optimize to re-subset fonts already in a file;
  - **`com.sejda.common-0.1-SNAPSHOT.jar` (30 MB, Scala)**. This is the editor and the other "web" tasks. Packages: `code.sejda.tasks.{edit, annotation, bookmark, deskew, doc, excel, flatten, flip, html, image, ocr, ppt, rename, common}`.
    - `edit/`: `EditTask`, `EditParameters`, `EditTextOperation` (fields seen in its constant pool: `originalText, fontId, fontOpt, boundingBox, position, fontSize, lineHeight, italic, pageNumber`, colour), `AppendText/Line/Draw/Link/FormField/Attachment/EmbeddedFileOperation`, `Delete{Image,Link,Highlight,FormField,Attachment}Operation`, `FillFormOperation`, `RotatePageOperation`, `SystemFont`.
    - `common/`: `PageTextRedactor`, `RedactedStream`, `Redaction`, `RedactionResult`, `Replacement`, `text/PdfTextRedactingStreamEngine`, `image/PdfImageRedactingStreamEngine`, `FontsHelper` (`familyNameWithoutSubsetPrefix`, `normalizeName`, `visualToLogical`, `arabicShaping`), `DocumentFontSearcher`, `GoogleFonts` (`GoogleFont`, `GoogleFontVariant`), `SystemFonts`, `SejdaBundledOnlyFontProvider` (web) and `SejdaBundledPlusFileSystemFontProvider` (desktop), `DefaultFallbackFontProvider`.
    - Bundled `fonts/`: Amiri, **Arimo** (metric-compatible with Arial), **Tinos** (Times), **Carlito** (Calibri), **Caladea** (Cambria), **Liberation Sans/Serif/Mono** (Arial/Times/Courier), DejaVu Sans/Serif, Droid Serif, EB Garamond, Fira Sans, Inter, Lato, Noto Sans/Serif (+Chakma, Tamil), Open Sans (+Condensed), Oranienbaum, PT Sans/Serif families, Poppins, Roboto, Scheherazade New, Selawik (Segoe-like), Didact Gothic, and **Foxit Symbol/Dingbats** (the PDFium base-14 substitutes).
  - `code/util/pdf/PdfLibraryUtils$` references `SAMBox.PRODUCER`, `sambox Version.getVersion`, `Sejda.VERSION`, and system properties `sejda.unethical.read` (ignore owner-password restrictions), `sejda.perform.memory.optimizations` and `org.sejda.sambox.rendering.UsePureJavaCMYKConversion`.

### 1.4 The Producer string **[V]/[A]**

Newest Maven releases: `org.sejda:sambox` 3.x line ends at **3.0.42**, and `org.sejda:sejda-core` 5.x line ends at **5.1.27** (tag `v5.1.27`, 2026-11-12). Open SAMBox's default is `PRODUCER = "SAMBox " + Version.getVersion()` (`sambox-git/src/main/java/org/sejda/sambox/SAMBox.java:41`), and the field is public and not final. The closed `PdfLibraryUtils` overwrites it with both versions, giving `"<sambox> (<sejda>) "`. So **sejda.com's server currently runs SAMBox 3.0.42 + Sejda SDK 5.1.27 + the closed Scala task jar**, one release newer than Desktop 7.9.12 (3.0.38 / 5.1.23).

---

## 2. How the techniques work (open code + closed-binary evidence)

### 2.1 Text recognition (with positions)

- **Browser:** pdf.js `getTextContent` / `getTextTask` (the string "Page getTextTask completed" is in app.asar) gives text items with transforms. Each item is grouped into an editable line box. Our capture's `fontId:"4R"` matches **pdf.js's `Ref.toString()` format** (`${num}R` when gen = 0, per `src/core/primitives.js`). So the client sends the PDF object number of the font dictionary, and the server can resolve the exact font object. **[V]** pdf.js format, **[A]** that Sejda uses it this way. `originalText` is kept as a sanity check or matching key **[A]**.
- **Server (2016 open version):** a subclass of SAMBox `PDFTextStreamEngine`. In `processTextPosition` it treats a glyph as "in the box" when its baseline-left point, its top-left (y − height) and its baseline-right (x + width) all fall inside the box. **[V]** For the first glyph in the box it records unicode, PDFont, font size (`TextPosition.getYScale()`), non-stroking colour and rendering mode. Whenever a glyph further *left* appears, it replaces the recorded start position, because content streams are not always in reading order ("date" may come before "Order"). **[V]**
- **No OCR in the editor.** The help centre says "Changing existing text within scanned documents is not supported," regardless of plan. **[V]** (https://www.sejda.com/help)

### 2.2 Removing the old text: rewriting the content stream **[V]**

- The engine interprets the page and writes every operator back to a **new** Flate stream through SAMBox's `ContentStreamWriter`. It then sets `/Contents` to `[newStream]`, replacing the whole page content array.
- It suppresses show-text operators whose glyphs matched the box. It also adds the colour operators (`cs/sc/scn/g/rg/k`, stroking and non-stroking) so it can track text colour.
- **Partial `TJ` handling:** each string element of a `TJ` array is shown glyph by glyph. If any glyph in that element is in the box, the element is replaced by a number equal to −(width of the removed glyphs / horizontal scaling), measured with the font's widths, or with TextPosition x-extents as a fallback. Text after it on the same line keeps its position. A plain `Tj` that matches is dropped entirely.
- `TD`, `T*`, `'` and `"` are dropped too, a known simplification. The `'` and `"` operators also show text, and `TD` sets leading, so dropping them can move later lines. Our version should **not** copy this behaviour.
- **Form XObjects:** the engine recurses into `Do` forms, writes a filtered copy and swaps it into the resource dictionary under the same name and the same object id. It remembers which forms it redacted, because a form shared between pages can only be redacted once.
- Today's closed version has dedicated `RedactedStream`, `Redaction`, `Replacement`, `RedactionResult` and `OperatorAndOperands` types and an image redactor, so the same approach now also covers image deletion and the whiteout tool. **[V]** names, **[A]** behaviour.

Our capture showed "old Tj removed from the original stream, new Tj appended". That matches this design: the whole stream is re-serialised without the matched operators, and the new text is appended. **[V]** behaviour, **[A]** that it is the same lineage.

### 2.3 Writing the new text **[V]**

- `PageTextWriter.write` opens `PDPageContentStream` in **APPEND** mode with `resetContext=true`, which wraps the old content in `q…Q`. It then writes `BT`, sets the rendering mode, sets the fill colour and, for each run `(text, font)`, emits `Tf` + `Tm` + `Tj`. It advances x by the run's measured width. It compensates for crop-box offset and page `/Rotate`, and can add faux italic with a 0.35 shear when no real italic font exists.
- Text is first whitespace-normalised. Arabic is shaped (ICU) and bidi-reordered visual to logical. Runs are split at zero-width glyphs so combining marks do not pile up.
- **Font reuse:** the writer is handed the *same* `PDFont` instance that was redacted. `PDResources.add` returns the existing key for an identical COS object, so the output says `/F4 12 Tf` with the original font and no new font object (as we observed). **No glyphs are added to the font.** This only works when every typed character already exists in the subset.
- The newer closed `EditTextOperation` adds `lineHeight`, `bold/italic`, `fontOpt` (font chosen by the user in the Font Replacement dialog) and multi-line handling (TechRadar notes "you can only select one original line at a time"). **[V]** field names, **[U]** details.

### 2.4 Glyph coverage check (`FontUtils.canDisplay`) **[V]**

For a string, ignoring whitespace:
1. `font.encode(text)` must not throw. A throw means the character is not in the encoding or cmap.
2. For vector fonts, read each code back and require `getPath(code)` to be non-null with non-zero width. An empty outline means the subset dropped that glyph.
3. For Type0 fonts, read `/CIDToGIDMap` and reject a code that maps to GID 0 (`.notdef`).
4. **Round-trip:** decode the encoded bytes through `toUnicode` and require them to equal the input after Unicode normalisation. This catches broken or garbled ToUnicode/cmap fonts ("what you see is not what you get"). Bundled fonts skip this step.
5. Spaces get their own check (`canDisplaySpace`: must encode, have width > 0 and round-trip). If that fails, the space is written in Helvetica as a separate run, because many subsets have no space glyph.

Browser side (app.asar, obfuscated) **[V]** string + **[A]** reading: a hidden 80×80 canvas, `missingGlyphCanvas`, draws a character at 30px in the candidate font family (the embedded font that pdf.js registered as a FontFace). It compares the bitmap with the same character drawn in a sentinel font, with results cached per (font, char). Identical bitmaps mean the browser fell back, so the glyph is missing. That triggers `#fontReplacementPrompt` / `FontReplacementModal`, with choices remembered in `editor.previousFontReplacements`. The warning "Embedded font, characters might be missing" fits this design: the font is a subset, and the client cannot prove coverage for characters it has not tested yet **[A]**.

### 2.5 Fallback font selection **[V]**

From the open 2016 `PageTextReplacer`, today's `FontUtils`, and the closed class names:
1. **Is it a subset?** Split the name on `+`. If the prefix is exactly 6 characters, the font is a subset, and the base name is the part after `+`.
2. **`loadOriginal`:** look up the base name (with `-` changed to a space) through FontBox `FontMappers`, which searches system fonts on desktop. Accept only an exact, non-fallback match, then embed it as a new Type0 font, subset on save.
3. **`loadSimilar`:** build a font descriptor with the family stem (text before `-`, e.g. `Arial` from `Arial-BoldMT`), plus bold and italic guessed from the name ("bold", "italic"/"oblique"). Ask the mapper for the closest match, accepting a fallback.
4. **`findFontFor`, run by run:** first ask the pluggable `FallbackFontsProvider`s. The closed `DefaultFallbackFontProvider` has the bundled metric-compatible and Google families, plus `GoogleFonts` by name **[A]**. Then try the bundled Type0 list in priority order, preferring a font whose bold flag matches and otherwise taking the first partial match. `resolveFonts` applies this **per code point**, so one edited line can mix the original subset font for the glyphs it has with a fallback font for the rest.
5. If nothing works, `UnsupportedTextException` is thrown, or the character is stripped via `removeUnsupportedCharacters`.
6. The online service uses `SejdaBundledOnlyFontProvider` (no system fonts). Desktop uses `SejdaBundledPlusFileSystemFontProvider`, which matches the help page: on Desktop you can add custom fonts by installing them ("Fonts > More fonts"). **[V]**

### 2.6 Can they add glyphs to a subset font? **No.** **[V]/[A]**

There is no code anywhere, open or in closed class names, that merges new glyphs into an existing embedded subset. The closed `ExistingTTFSubsetter` / `ExistingType0CIDType2Subsetter` belong to `optimization/font`, the Compress task, and only make existing fonts *smaller*. Adding a glyph needs the glyph outline, which the subset does not contain. Without the original font file, the only options are substitution or a full replacement font. Sejda's answer to "same font" is therefore:
- reuse the subset when it covers the text (the common case: edits that reuse letters already on the page);
- otherwise use the system original (desktop only);
- otherwise use a metric-compatible clone (Liberation/Arimo/Tinos/Carlito/Caladea/Selawik). This keeps line widths and looks close enough that users rarely notice.

---

## 3. Public statements

| Source | Statement | Tag |
|---|---|---|
| https://www.sejda.com/help | Scans cannot be edited, regardless of plan. Image-based text and outlined text cannot be edited either. Desktop can use custom fonts after you install them ("Fonts > More fonts"). If loading local fonts fails on Linux, install libfontconfig. Desktop on Linux uses the system OCR engine. | [V] |
| https://www.sejda.com/blog/post/144162708524 (10 May 2016) | Online editor launched: add text, images, insert/delete pages, highlight. Editing existing text was **not** mentioned, which matches git history (Sept 2016). | [V] (search snippet) |
| https://www.sejda.com/pdf-editor | Advertises "Edit existing PDF text"; click on existing text to edit. | [V] (search snippet) |
| https://techradar.com/reviews/sejda | You can only select one original line at a time, so rewriting a paragraph is hard. | [V] (search snippet) |
| https://capterra.com/p/164130/Sejda-PDF/reviews/?page=2 | A user often has trouble getting the added font to match the PDF's font. | [V] (search snippet) |
| AUR `sejda-desktop` PKGBUILD | "Proprietary commercial PDF editor", licence LicenseRef-EULA, v7.9.12 | [V] |
| Desktop package contents | Electron + bundled JDK 25 + Scala/Java engine jars (section 1.3) | [V] |
| sejda-git history | AGPL since 2015-08. Editor moved private on 2017-01-11 (`5b3fe59e1`). The merged Noto font gained Armenian/CJK punctuation on 2026-11-12 (`fd42e4c23`), so the fonts are still actively maintained. | [V] |

I did not touch any sejda.com app endpoints. I read the static help page once. I downloaded the Desktop `.deb` once from the CDN link published in the AUR.

---

## 4. Assessment for our engine

### 4.1 Techniques worth reimplementing (independently, clean-room from this description)

| # | Technique | Value | Difficulty | Notes for us |
|---|---|---|---|---|
| 1 | Content-stream interpreter with a text-state tracker (CTM, Tm, Tf, Tc, Tw, Tz, TL, Ts; q/Q; Form XObjects) that gives glyph-level positions | Required | M | We can derive positions in the browser from pdf.js, but we need our own tokenizer/serializer to *rewrite* streams. Write it in TS (or Rust→WASM) |
| 2 | **Selective operator removal with TJ kerning compensation** so neighbouring text does not move | High | M | Do better than Sejda: keep `TD`/`T*` state ops; split `'` and `"` correctly; handle `Tj` partial matches by turning `Tj` into `TJ` with a gap |
| 3 | Rewrite in place rather than re-serialising the whole page | Better than Sejda | M-H | Edit only the affected stream object, leave the rest byte-identical, use an incremental update. Smaller diff, keeps signatures in unchanged objects valid, keeps tagged-PDF marked content |
| 4 | **Reuse the original font resource** when its glyphs cover the text | High | L | Coverage test: the cmap/ToUnicode reverse map must exist, the glyph must have a non-empty outline (glyf/CFF charstring) and GID ≠ 0, and decode(encode(text)) must equal text. We can parse the embedded font in-browser (pdf.js already does, and `missingGlyphs` exists in pdf.js font code) |
| 5 | Browser glyph check (canvas diff) to warn before the user saves | Medium | L | Better: check against the parsed font program directly (no canvas heuristics), and show per-character highlights |
| 6 | Per-character run splitting (original font for covered glyphs, fallback for the rest) | High | L-M | Keeps most of the line in the real font |
| 7 | **Metric-compatible fallback library**, matched by family stem + bold/italic + serif/sans/mono flags from the FontDescriptor | High | L | All permissive: Liberation (OFL 1.1), Arimo/Tinos/Cousine (Apache-2.0/OFL), Carlito/Caladea (OFL), Noto (OFL), DejaVu (Bitstream Vera, permissive), PDFium Foxit base-14 (BSD-style). Check each licence before adding |
| 8 | Width-match the fallback: scale Tz/Tc so the new run fits the original box | Better than Sejda | M | Sejda does not do this. It removes the most visible "different font" artefact |
| 9 | Subset-embed the fallback font (only used glyphs) | Required | M | Browser: `pdf-lib` + `@pdf-lib/fontkit` subsets (MIT). Rust: `subsetter` (MIT/Apache, from Typst) or `allsorts` (Apache-2.0) |
| 10 | **Extend an existing subset font** when the *same family* is available in full (e.g. the PDF uses `ABCDEF+Roboto`, and we have Roboto) | Better than Sejda | H | Re-embed a fresh subset of the full font covering old + new glyphs, remap the CIDs in the edited stream, keep the old font for untouched text. Only possible for fonts we legally have (Google Fonts, OFL). Otherwise substitute |
| 11 | Shared Form XObject awareness (redact once, copy-on-write when the form is used elsewhere) | Medium | M | Sejda mutates shared forms in place. We should clone before editing if other pages reference the form |
| 12 | Paragraph reflow across lines | Better than Sejda | H | Sejda edits one line at a time. Group lines into paragraphs (pdf.js items + leading) and re-wrap them with the same font metrics |

### 4.2 Engine options for the server fallback, and for ideas

| Option | Licence | Language / runtime | Fit for this job | Verdict |
|---|---|---|---|---|
| **PDFBox / SAMBox** | Apache-2.0 | Java (JVM) | Very capable: `PDFStreamEngine`, `ContentStreamWriter`, `TextPosition`, TTF subsetting, FontMapper. This is exactly what Sejda uses. | Works for the server, but JVM cold starts (2-5 s) and memory cost more on scale-to-zero Cloud Run, and it cannot run in the browser. Acceptable fallback, not a strategic choice [A] |
| **PDFium** | BSD-3 / Apache-2.0 | C++; Python via `pypdfium2` (Apache/BSD) already in our stack; WASM builds exist | Has page-object APIs: enumerate text objects, read text, font, matrix; `FPDFText_SetText`, `FPDFTextObj_*`, `FPDFText_LoadFont`; `FPDFPage_GenerateContent` regenerates the page stream | Best ready-made "edit text objects" API with a permissive licence. Caveat: `GenerateContent` re-serialises the whole page and can drop unknown operators or marked content, so test it on real files. Good server engine, and possibly in-browser via WASM (~4-5 MB). Verify the licence of any specific WASM wrapper [A] |
| **qpdf** | Apache-2.0 | C++ (pikepdf: MPL-2.0) | Excellent structure work, a content-stream tokenizer (`QPDFTokenizer`, `parseContentStream`), incremental-safe writing. No text layout and no font handling | Use it for structure, repair and object surgery. Pair it with our own text logic. pikepdf in the worker is already allowed [A] |
| **Rust: lopdf + pdf-writer (+ subsetter / ttf-parser / allsorts)** | MIT / MIT-Apache | Rust → native or WASM | lopdf parses and edits objects and content-stream operations. pdf-writer writes. ttf-parser/allsorts read fonts. subsetter subsets. There is no text-position engine, so we would build one (~1-2k lines) | Best long-term "our own engine" path: one codebase for browser (WASM, fast) and server. Highest initial effort [A] |
| **pdf.js + pdf-lib (TS)** | Apache-2.0 / MIT | Browser JS | pdf.js already gives fonts, glyph positions and parsed font programs. pdf-lib writes objects, embeds fonts, subsets via fontkit. A content-stream rewrite layer is missing (we write it) | Fastest route to a browser-first editor that meets rule 4 [A] |
| MuPDF / PyMuPDF | **AGPL-3.0** | C | It has redaction and text-editing APIs | **Forbidden (CLAUDE.md rule 3).** Do not use it, even in tests |
| iText | **AGPL** | Java | n/a | **Forbidden** |
| sejda-sdk | **AGPL** | Java | Read for ideas only | **Forbidden** as a dependency, and its code must not be copied |

### 4.3 Recommended architecture [A]

1. **Browser (default, nothing uploaded):** pdf.js renders and extracts text items with font refs. Our TS module parses and rewrites the content stream: removes glyphs in the box with TJ compensation, then emits a new `BT…ET` (or rewrites in place). The coverage check runs against the parsed embedded font. Fallback fonts are fetched lazily from a static bucket of OFL/Apache fonts (metric clones first, then Google Fonts by family name). pdf-lib + fontkit subsets and embeds. Save as an incremental update.
2. **Server fallback (Cloud Run, scale to zero):** pypdfium2 + pikepdf for files the browser cannot handle (very large files, broken xref, exotic encodings), using the same operation JSON. This avoids adding a JVM.
3. **Later:** port the TS rewrite core to Rust/WASM if performance needs it (lopdf + subsetter).

### 4.4 Rough difficulty

- Match Sejda (single-line edit, font reuse, fallback chain, whiteout, shapes, images, links, form fields): **about 3-5 agent-weeks** for the text-edit core plus tests.
- Beat Sejda (in-place rewrite, width matching, paragraph reflow, same-family subset extension, shared-form copy-on-write): **another 4-6 weeks**.
- Hardest parts:
  - Type3 fonts and fonts without ToUnicode (Sejda has a dedicated "handle unsupported fonts type3" fix);
  - vertical/CJK CID fonts;
  - RTL text;
  - text drawn through clipping or patterns;
  - tagged PDF / marked content preservation.

---

## Appendix: reproduce the evidence

Clone github.com/torakiki/sejda and github.com/torakiki/sambox, then inspect history with `git log --diff-filter=D --name-only -- '*Task.java'` and `git log --all -- '*PageTextReplacer*'`. Read only; never copy AGPL code into this repo.
