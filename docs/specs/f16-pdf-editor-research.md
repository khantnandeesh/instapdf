# F16 research: competitor editors and open-source feasibility

Companion to `docs/specs/f16-pdf-editor.md`. Written by the competitor-researcher agent on 2026-11-23; sejda.com was not contacted for this part.

Date: 2026-11-23. sejda.com was not contacted. The only Sejda input is the repo crawl `docs/discovery/pages/pdf-editor.md` plus one third-party review.

How to read the claim tags:
- **[V]** means verified from the vendor's own page or docs, or from the package itself (npm registry metadata or the shipped files).
- **[3P]** means a third-party source.
- **[U]** means unverified or contradictory.
- **[A]** means my own engineering analysis, not a cited fact.

---

## Part A: Competitor editors

### A.1 Feature matrix

| Feature | Sejda (crawl, baseline) | iLovePDF Edit PDF | Smallpdf Edit PDF | PDF24 Edit PDF | Adobe Acrobat online | PDFgear online | Stirling-PDF 2.x | Xodo online / Apryse WebViewer |
|---|---|---|---|---|---|---|---|---|
| Edit existing text | Yes (bold, italic, size, family, colour) [V crawl] | Yes, "automatic text detection" (May 2025). Free tier unclear: TechRadar says paid [V]/[3P conflict] | **Pro only** ("Direct text editing is a feature available with a Pro subscription") [V] | **No.** The page suggests PDF→Word→PDF [V] | **No in free.** Pro only, which adds font changes and reflow [V] | **No online.** Desktop app only [V] | Yes, **alpha**. Open-sourced in v2.1.0 [3P release notes] | Apryse WebViewer: yes, paragraphs and images, since 10.3 [V docs]. Xodo free online editor: unclear [U] |
| Paragraph reflow | No. TechRadar: "you can only select one line of text at a time" [3P] | Not stated [U] | Not stated [U] | n/a | Pro only [V] | n/a | Unknown [U] | Yes. Long-text reflow toggle API since 10.11 [V changelog] |
| Font matching | Curated list of OFL fonts, each shown with the proprietary font it stands in for (Liberation Sans for Arial, Carlito for Calibri, Caladea for Cambria, DejaVu for Verdana/Georgia, Fira for Trebuchet, Amiri/Scheherazade for Arabic) [V crawl] | "formatting stays consistent with the document's style" [V, vague] | Unknown | n/a | Pro | n/a | Per-page font endpoint in the text editor [3P commit] | Yes (commercial) |
| Add text / images / shapes | Yes / Yes / Yes [V crawl] | Yes / Yes / Yes (rect, ellipse, line, arrow, emoji) [V] | Yes / Yes / Yes [V] | Yes / Yes / Yes [V] | Text, drawings, lines, arrows, shapes [V] | Yes / Yes / Yes, plus stamps [V] | Add text, add and move images [3P] | Yes |
| Whiteout | Yes [V crawl] | Not stated | Not stated | "black out content" [V] | No | Not stated | Redact tool exists [3P] | Redact tool (browser only) [V] |
| Annotations | Yes [V crawl] | Yes (Annotate tab, freehand pencil) [V] | Highlight, draw, sticky notes [V] | Comments, free drawing [V] | Highlight, strike, underline, sticky notes, @-tagging, share link to comment [V] | Comments, notes, highlights, callouts [V] | Yes | Yes |
| Forms: fill | Yes [V crawl] | Separate tool | Separate "PDF Form Filler" [V] | Yes [V] | Yes, fill & sign [V] | Yes | Yes | Yes (browser only) [V] |
| Forms: create | Yes. Text, checkbox, radio group, dropdown, list (multiselect), comb ("Divide into boxes"), max length, required, "Repeat on all pages" [V crawl field names] | Yes, in the advanced editor (Feb 2026) [V] | No | No | No (Prepare Form is Pro) [U] | Yes: field, checkbox, radio, dropdown, list box [V] | Unknown | Yes |
| Signatures | Type or draw [V crawl] | In the app; eSign is a separate tool | Yes [V] | Yes [V] | Yes [V] | Yes [V] | Sign tool | Yes (browser only) [V] |
| Find & replace | Yes [V crawl] | Not stated | No | No | No | No | Unknown | Yes (commercial) [U] |
| True redaction | No (whiteout only) [V crawl] | Separate tool | Separate tool | Black out (true removal not verified) [U] | Pro | Unknown | Yes (redact tool) | Yes: "Permanently redact" [V] |
| Links | Add and edit: URL, email, phone, internal page [V crawl] | Hyperlinks, bookmarks, attachments (Feb 2026) [V] | Smallpdf app: "edit text, images, and links" [V app store] | No | No | No | Unknown | Yes |
| Page ops inside the editor | Unknown from crawl | Unknown | Organize pages [V] | Rearrange pages [V] | No | Reorder, rotate, copy, delete, insert blank, import PDF [V] | Yes, with full version history | Yes |
| Undo / redo | Unknown from crawl | Unknown | Unknown | Unknown | Unknown | Unknown | Undo, redo, full version history [3P] | Yes |
| Mobile | Browser only. No phone app found [3P] | Native iOS/Android app with existing-text edit [V vendor] | Native app [V] | Browser | **"desktop and web, not mobile"** (one FAQ) versus "works on mobile browsers" (editor page) [V conflict] | Browser plus apps | Desktop apps (Win/macOS/Linux) | Apps |

### A.2 Free tier limits and where files are processed

| Product | Free limits | Processing location | Retention | Sources |
|---|---|---|---|---|
| Sejda | 3 tasks/hour, 50 MB, 200 pages (editor), 5 MB per image [V crawl; 3P TechRepublic] | **Server upload**. "Files are safely uploaded over an encrypted connection" [V crawl] | 2 h [3P] | crawl; TechRepublic |
| iLovePDF | Per-tool limits. Exact editor cap not found. "25 MB" comes from one blog [U] | **Server** [3P] | 2 h automatic, plus a "Delete it now" button [V] | ilovepdf.com/blog/delete-file-from-ilovepdf |
| Smallpdf | Daily task limit, number not published. Existing-text edit needs Pro (7-day trial) [V] | **Server** [3P TechRepublic] | ~1 h per a May review [3P/U] | smallpdf.com/edit-pdf |
| PDF24 | "No limits", ad-supported, no registration [V] | **Server** (Germany/EU) [V] | ≤1 h after last use [V] | tools.pdf24.org/en/edit-pdf |
| Adobe online | Sign-in needed to download or share. ~100 MB for online tools. Premium-tool quotas vary by region [V] | **Server** (Adobe cloud) [V] | Deleted unless saved to account [V] | adobe.com/acrobat/online/pdf-editor.html; helpx FAQ |
| PDFgear online | 100 MB per PDF, unlimited uses [V] | **Browser**: "Files are processed locally and stay on your device instead of being uploaded to a server" [V vendor claim, not independently tested] | n/a | pdfgear.com/edit-pdf |
| Stirling-PDF | Free for individuals and teams up to 5. Larger orgs need a licence. Server licence $99/mo, which includes text editing [3P] | Self-hosted server (PDFBox-based). Desktop app is local [3P] | Self-managed | opensourceforu.com; heise.de |
| Xodo online | Not checked | Editor, Redact, Sign and Fill are marked **"Browser Only"**. Conversions, compress and OCR go to the server [V] | Server tools ~1 h [V] | xodo.com/tool-privacy |
| Apryse WebViewer | Commercial SDK | Client-side WASM; "document content never leaves the browser" [V] | n/a | apryse.com/webviewer; docs.apryse.com/web/guides/edit/text-edit |

**Key takeaway.** Sejda, iLovePDF, Smallpdf, PDF24 and Adobe all upload files to a server. Only PDFgear and Xodo (on Apryse WASM) claim browser-only editing, and neither edits existing text for free in the browser. No free, browser-only competitor offers existing-text editing combined with font matching and form creation. That combination is the gap BerryPDF can fill.

### A.3 Notable ideas seen

| Idea | Seen at | Notes |
|---|---|---|
| Font picker shows the proprietary font each OFL font stands in for, e.g. "Carlito (Calibri)" | Sejda crawl | Must-have parity item. Our own copy and list. |
| "Delete it now" button after download | iLovePDF | For us: "Clear from this tab" (we hold nothing on a server). |
| Upload once, run many tools, version history and undo | Stirling 2.0 | Fits in-browser: keep the document in IndexedDB and chain tools. |
| Long-text reflow on/off toggle | Apryse | Lets users choose a fixed-line edit (safe) or a reflowing paragraph edit. |
| Per-tool privacy table: browser vs server | Xodo tool-privacy | Fits our CSP privacy claim. Publish a per-tool "where it runs" page. |
| Page ops inside the editor (insert blank, import PDF, rotate, duplicate) | PDFgear, EmbedPDF | Cheap with pdf-lib or pdfium. |
| Comment, share-for-comment, @-tagging | Adobe | Needs a server and accounts. Skip for F16. |
| Native mobile apps | iLovePDF, Smallpdf | Skip. Do a responsive or touch editor instead. |
| Fill & sign: "Publish for others to fill & sign" | Sejda crawl (help heading) | Needs server storage. Skip or defer. |

---

## Part B: Open-source feasibility (permissive licences only)

### B.1 Licence and status table (npm registry checked 2026-11-23)

| Package | Latest | Published | Licence | Use for | Verdict |
|---|---|---|---|---|---|
| `pdfjs-dist` | 6.5.438 | 2026-11-01 | Apache-2.0 [V] | Render, text layer, annotation editors, XFA rendering, page extract and reorganize | **Use** |
| `pdf-lib` (Hopding) | 1.17.1 | **2021-11-06** | MIT [V] | Writing | Unmaintained for 5 years. Prefer the fork. |
| `@cantoo/pdf-lib` | 2.11.1 | 2026-09-15 | MIT [V] | Writing. Adds `encrypt()` (AES-256), full SVG drawing, `PDFPage.extractContents()`, attachments [V README] | **Use** (deps culori, fflate, node-html-better-parser: all MIT [V]) |
| `@pdfme/pdf-lib` | 6.2.8 | 2026-10-21 | MIT [V] | Alternative fork | Backup |
| `@embedpdf/pdfium` | 2.15.1 | 2026-09-16 | MIT wrapper + PDFium (BSD-3-style "PDFium Authors" licence in `LICENSE.pdfium`) [V shipped files] | Text-object editing, redaction, forms, fonts | **Use**. `pdfium.wasm` is 4.6 MB, so lazy-load it. |
| `@embedpdf/core` / engines / viewer | 3.3.0 / 2.15.1 | 2026-11 | Apache-2.0 / MIT [V] | Plugin viewer: annotations, form build, signatures, redaction, undoable page ops, RTL [V README] | **Use or borrow**. **Avoid `cloudpdf/server`** in the same repo: FCL-1.0-ALv2, not permissive yet [V LICENSE notice]. |
| `@neslinesli93/qpdf-wasm` | 0.3.1 | 2026-11-03 | ISC (qpdf itself Apache-2.0) | Repair, linearize, recompress after edits | Use (already in the charter) |
| `harfbuzzjs` | 1.6.4 | 2026-10-22 | MIT [V]. Ships `harfbuzz.wasm` and `harfbuzz-subset.wasm` [V file list] | Shaping (Devanagari, Arabic) and subsetting | **Use** |
| `subset-font` | 2.9.0 | 2026-09-20 | BSD-3-Clause [V] (deps fontverter BSD-3, wawoff2 MIT) | hb-subset wrapper | Use, or call harfbuzzjs directly |
| `fontkit` | 3.0.0 | 2026-11-11 | MIT [V] | Parse embedded fonts, cmap and glyph lookup, metrics | Use (`@pdf-lib/fontkit` 1.1.1 is from 2020, so avoid it) |
| `opentype.js` | 2.0.0 | 2026-05-06 | MIT [V] | Glyph paths, metrics | Optional |
| `fabric` | 7.4.0 | 2026-05-18 | MIT [V] | Overlay canvas | Option |
| `konva` | 10.11.0 | 2026-11 | MIT [V] | Overlay canvas | Option. [A] A DOM/SVG overlay may be simpler and more accessible than either. |
| `tesseract.js` | 7.0.0 | 2025-12-15 | Apache-2.0 [V] | OCR for "scanned page, make editable" | Use for small jobs (charter) |
| `mupdf` (MuPDF.js) | 1.28.6 | 2026-11-09 | **AGPL-3.0-or-later** [V] | n/a | **Forbidden** |
| PSPDFKit / Nutrient, Apryse WebViewer | n/a | n/a | Commercial | n/a | **Forbidden** (cost and licence) |
| Stirling-PDF | 2.x | 2025-26 | MIT base, but `engine/`, `app/proprietary/`, `frontend/src/editor/proprietary/` and others are under separate licences [V LICENSE] | Reference only | Do not copy code from the non-MIT directories. Its text editor is server-side PDFBox, which does not fit browser-first. |
| Fonts: Liberation, Carlito, Caladea, Noto, Amiri, Scheherazade New, Arimo/Tinos/Cousine | n/a | n/a | SIL OFL 1.1 [A; confirm per font] | Lookalikes | Use. DejaVu uses a Bitstream Vera-derived licence, so check it before including. |

**What pdf.js 6.5.438 can edit today** [V, from `build/pdf.mjs`]. `AnnotationEditorType` contains:
- FREETEXT (3)
- HIGHLIGHT (9)
- STAMP (13, image)
- INK (15)
- POPUP (16)
- SIGNATURE (101)
- COMMENT (102)

The registered editor classes are FreeText, Ink, Stamp, Highlight and Signature. There is no editor type for content-stream (existing) text. The only `TextEdit` symbol is the XFA `textEdit` template class. No 2025-2026 Mozilla announcement of existing-text editing was found [3P search]. The API also exposes `extractPages(...)` and `saveDocument()`, which provide page extraction and reorganization on save.

### B.2 Capability assessment

**(1) Editing existing text in the browser.** Feasible, with limits. [A unless cited]

Two routes:
- **Route A (recommended): PDFium WASM through `@embedpdf/pdfium`.** It exports these functions [V in `index.d.ts`]:
  - `FPDFTextObj_GetText`
  - `FPDFTextObj_GetFont`
  - `FPDFFont_GetBaseFontName`
  - `FPDFFont_GetFamilyName`
  - `FPDFFont_GetIsEmbedded`
  - `FPDFFont_GetFontData`
  - `FPDFText_SetText`
  - `FPDFText_LoadFont`
  - `FPDFText_LoadStandardFont`
  - `FPDFPageObj_CreateTextObj`
  - `FPDFPageObj_Remove`
  - `FPDFPage_GenerateContent`

  Together these let you list text objects, read their font, replace the text or remove the object, insert a new one, and regenerate the content stream. PDFium handles the content-stream parsing and rewriting, including TJ/Tj arrays, the text matrix and graphics state, so we do not hand-write a tokenizer.
- **Route B: hand-written approach** using pdf.js `getTextContent` for positions plus a custom content-stream tokenizer with pdf-lib. It is more work and more fragile: TJ kerning arrays, `Tz`/`Tc`/`Tw` operators, Form XObjects, inline images. Use it only as a fallback.

The subset-font problem: embedded fonts are usually subsets, so new characters may have no glyph.
- Strategy: check every new codepoint against the embedded font's cmap. Use `FPDFFont_GetFontData` plus fontkit to parse it, and for Type0/Identity-H fonts use the ToUnicode map to invert codepoint to GID.
- If every glyph is present, reuse the embedded font. The output is then visually identical.
- If any glyph is missing, switch the edited run (or the whole edited text object) to a matched OFL font. Subset it with hb-subset (harfbuzzjs), embed it with `FPDFText_LoadFont` (CID/Identity-H with a ToUnicode map) and keep the size and colour.
- Tell the user ("Font substituted: Carlito for Calibri"). Sejda-style UIs do this silently. Showing it is an improvement.
- Type3 fonts and fonts without a ToUnicode map cannot be re-encoded reliably. Mark that text as read-only, or offer the whiteout-and-retype fallback.

**(2) Paragraph detection and reflow.** No library does this. Build it on PDFium `FPDFText_*` char boxes, font size and weight, or on pdf.js text items [A].
- Group runs into lines: same baseline within tolerance, same direction.
- Group lines into paragraphs: consistent leading, x-alignment and font.
- Re-break lines with harfbuzz advance widths inside the original bounding box. Grow the box downward. Never push other content in v1.
- Apryse is the only product found with real reflow, and it is commercial [V]. Sejda edits one line at a time [3P TechRadar]. So paragraph edit, even within its own box only, beats Sejda. Make it opt-in, like Apryse's toggle.

**(3) Font matching.**
- `FPDFFont_GetBaseFontName` gives names like `ABCDEF+Calibri-Bold`. Strip the 6-letter subset prefix, then split off the style suffix and read the `FontDescriptor` flags (serif, fixed-pitch, italic, `FontWeight`) [A].
- Map to OFL lookalikes. These are metric-compatible: Arial/Helvetica → Liberation Sans or Arimo, Times → Liberation Serif or Tinos, Courier → Liberation Mono or Cousine, Calibri → Carlito, Cambria → Caladea [A, widely documented metric compatibility]. Use Noto for everything else, including scripts.
- When the family is unknown, fall back on the flags: serif → Liberation Serif, else Liberation Sans.
- Self-host the fonts. That avoids Google Fonts network calls and keeps the CSP strict. Lazy-load per family to limit payload.

**(4) AcroForm fill and create; XFA.**
- Fill: pdf-lib or the cantoo fork (`getForm()`, text/checkbox/radio/dropdown/list fields, `updateFieldAppearances`) or PDFium. pdf.js renders AcroForm widgets with `annotationMode` ENABLE_FORMS.
- Create: pdf-lib `form.createTextField(...)` and friends support max length, comb, multiline and required flags. PDFium has `EPDFPage_CreateFormField` and `EPDFAnnot_GenerateFormFieldAP` [V export list]. This covers Sejda parity: comb, max length, required, radio groups, options, multiselect.
- "Repeat on all pages" means the same field name with one widget per page. pdf-lib supports adding a widget to an existing field [A].
- XFA: pdf.js can render pure-XFA forms (`enableXfa`; XFA classes are in the build [V]). Writing XFA back is not practical. Recommended handling: detect XFA, show a notice, and offer "convert to AcroForm/flatten" by removing the XFA with pdf-lib `form.deleteXFA()` when an AcroForm fallback exists [A]. Pure XFA without an AcroForm fallback stays view-and-fill only through the pdf.js XFA layer. That is a known limit; Sejda likely has it too [U].

**(5) Complex scripts (Devanagari, Arabic).**
- Shaping needs harfbuzzjs (MIT, current 1.6.4). Shape the string to a GID sequence plus advances. Write it as an Identity-H CID font with explicit positioning (TJ adjustments). Build ToUnicode from the cluster mapping so copy and search still work [A].
- Neither pdf-lib nor PDFium `FPDFText_SetText` shapes text. Both map characters to glyphs 1:1, so Devanagari conjuncts and Arabic joining would break without harfbuzz [A].
- Use Noto Sans/Serif Devanagari (OFL) and Amiri or Noto Naskh Arabic (OFL). Bidi needs a UAX#9 implementation, e.g. `bidi-js` (MIT; licence not checked today [U]).
- Editing *existing* complex-script text is harder still: the embedded subset contains shaped glyphs, and ToUnicode is often lossy. v1 should treat existing Indic/Arabic runs as "replace whole run with a new shaped run" [A].
- This matters for an India-based product, and Sejda's list only covers Arabic plus Chakma and Tamil Noto fonts [V crawl]. Devanagari is a real differentiator.

**(6) Redaction that truly removes content.**
- Whiteout, as Sejda does it, only paints a rectangle. The text is still extractable [A].
- `@embedpdf/pdfium` exports `EPDFText_RedactInRect`, `EPDFText_RedactInQuads`, `EPDFPage_ApplyRedactions` and `EPDFAnnot_ApplyRedaction` [V]. EmbedPDF documents redaction as content "physically removed" [V README; independent verification U]. One HN report of a Firefox bug was said to be fixed [3P].
- Acceptance-test requirement: after redaction, (a) pdf.js `getTextContent` returns none of the redacted strings, (b) qpdf-WASM `--qdf` dump of streams contains no redacted text, (c) image XObjects under the area are cut or removed, (d) metadata, annotations, form values and bookmarks matching the text are also cleaned, (e) old revisions are dropped, i.e. a full rewrite, not an incremental save [A].
- Keep this a separate tool, or a clearly labelled "Redact (permanent)" mode, distinct from whiteout.

### B.3 Suggested architecture [A]

- **Render and view:** pdf.js, or EmbedPDF's PDFium-based viewer to avoid two engines. Picking one engine for both render and edit avoids glyph-position mismatches between what is shown and what is written.
- **Edit model:**
  - Load the PDF into PDFium WASM in a Web Worker.
  - Expose text objects, images and annotations to a DOM/SVG overlay.
  - Keep the operation log in IndexedDB. That gives undo/redo and crash recovery.
- **Write:** PDFium `GenerateContent` and save for content edits. Use pdf-lib (cantoo) for forms, links, page ops and attachments if they are easier there. Finish with a qpdf-WASM pass to compress streams and linearize.
- **Fonts:** fontkit to inspect, harfbuzzjs for shaping and subsetting, self-hosted OFL set.
- **Everything client-side.** No server is needed for F16, which keeps it within the ₹1000 budget and the CSP rule. OCR-to-editable is the only server-adjacent piece; use tesseract.js for small jobs.

### B.4 Risks

| Risk | Mitigation |
|---|---|
| PDFium WASM size (4.6 MB) slows first load | Lazy-load on the first edit action, serve brotli, cache with a service worker |
| Subset fonts are missing glyphs | Glyph-coverage check, then OFL fallback with a visible notice |
| Type3 / no-ToUnicode text | Read-only plus a whiteout-and-retype fallback |
| EmbedPDF's PDFium fork source was private in Aug 2025 [U, Privacy Guides forum] | Check that the fork's source is public before relying on it. Otherwise build our own PDFium WASM (BSD) or use pdfium-binaries. |
| Mobile performance | Use a page-at-a-time render and cap the canvas resolution |

---

## Sources

Competitors:
- iLovePDF: https://www.ilovepdf.com/blog/edit-pdf-text ; https://www.ilovepdf.com/hi/blog/new-advanced-pdf-editing-ilovepdf ; https://www.ilovepdf.com/blog/delete-file-from-ilovepdf ; https://www.techradar.com/reviews/i-love-pdf
- Smallpdf: https://smallpdf.com/edit-pdf
- PDF24: https://tools.pdf24.org/en/edit-pdf
- Adobe: https://www.adobe.com/acrobat/online/pdf-editor.html ; https://helpx.adobe.com/document-cloud/faq/free-online-pdf.html
- PDFgear: https://pdfgear.com/edit-pdf
- Xodo: https://xodo.com/tool-privacy
- Apryse: https://docs.apryse.com/web/guides/edit/text-edit ; https://docs.apryse.com/web/changelog/v10-11-0/ ; https://apryse.com/webviewer
- Stirling-PDF: https://www.opensourceforu.com/2025/12/stirling-pdf-2-0-brings-text-editing-and-enterprise-tools-to-open-source/ ; https://heise.de/-11095732 ; https://sourceforge.net/projects/stirling-pdf/files/v2.1.0/ ; https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/LICENSE
- Comparisons and reviews: https://www.techrepublic.com/article/news-best-free-pdf-editors-2026-privacy-limits/ ; https://techradar.com/reviews/sejda

Open source:
- npm registry metadata for each package (https://registry.npmjs.org/<pkg>)
- pdfjs-dist 6.5.438 tarball (`build/pdf.mjs`)
- @embedpdf/pdfium 2.15.1 tarball (`dist/index.d.ts`, `LICENSE`, `LICENSE.pdfium`)
- EmbedPDF: https://cdn.jsdelivr.net/gh/embedpdf/embed-pdf-viewer@main/README.md and LICENSE
- @cantoo/pdf-lib README: https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/README.md
- harfbuzzjs file list: https://data.jsdelivr.com/v1/packages/npm/harfbuzzjs@1.6.4
- Firefox and pdf.js editor: https://bugzilla.mozilla.org/show_bug.cgi?id=1774350 ; https://www.mozilla.org/firefox/features/pdf-editor
