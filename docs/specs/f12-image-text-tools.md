# F12: PDF to image, Image to PDF, PDF to text

Routes: `/pdf-to-jpg`, `/jpg-to-pdf`, `/pdf-to-text`. All three run in the browser; nothing is uploaded
(rule 4). Extract images follows in its own PR (it needs its own engine). Reference pages:
`docs/discovery/pages/{pdf-to-jpg,jpg-to-pdf,extract-text-from-pdf}.md`.

Built only from the shared components (`docs/design/berrypdf.md`, "Shared components"): `ToolFlow`,
the tile kit, `SegmentedControl`, `Select`, `MoreOptions`, `LinkButton`, the result card. No new
one-off controls; the one-off guard's baseline did not grow.

## 1. Where we beat the reference

| | Reference | BerryPDF |
|---|---|---|
| Privacy | Files are uploaded | Done on the device, CSP blocks uploads |
| PDF to image: pages | A typed page range | Click the pages; none picked means all |
| Formats | JPG, PNG, TIFF by separate tabs | The same three, one row; one multi-page TIFF as an option |
| Limits | Daily task and size limits | None |
| Image to PDF | Fixed order after upload, options on a second step | Drag to reorder, rotate, remove, undo/redo; size, margin and orientation in the same row |
| PDF to text | A .txt download | The .txt, a preview and Copy text; scanned files get a plain "needs OCR" message |

## 2. PDF to image (`/pdf-to-jpg`)

Layout C. Row: Format (JPG / PNG / TIFF), Resolution (Small 75, Medium 150, Large 220, Print 300 dpi),
More options (Black and white; with TIFF, one file
with all pages). Engine `lib/pdf/page-images.ts`: pdf.js draws one page at a time, capped at 40 megapixels
(a note says when a page was reduced); JPG quality 0.92 on white; TIFF is written by `lib/pdf/tiff-write.ts`
(Deflate, our own writer). One image downloads as itself, several as a ZIP.

- AC-700 With no page picked, every page is converted; the button says "Convert N pages".
- AC-701 Several images come as `<name>-images.zip`; entries are `<name>-<page>.<ext>`, zero-padded, in page order.
- AC-702 One picked page downloads as a single image, not a ZIP.
- AC-703 The format tabs choose JPG, PNG or TIFF; the bytes are that format.
- AC-704 Resolution sets the pixel size (Print is 4× Small); oversized pages are reduced, never failed.
- AC-705 TIFF pages are valid TIFF files; "One TIFF file" gives one multi-page file per PDF.
- AC-706 Picking a page never moves the row; Escape clears the picks (back to all pages).
- AC-707 A result can go on to the tools that accept it.

## 3. Image to PDF (`/jpg-to-pdf`)

Organize's workspace for pictures (JPG, PNG, GIF, BMP, WebP, TIFF; a TIFF frame is a page). Row from
1280 px: Page size (Fit to image, A4, A3, A5, Letter, Legal), Margin (none, small 0.5 in, large 1 in),
Orientation (Auto, Portrait, Landscape; hidden in place for Fit to image), Undo│Redo. Below 1280 px the
three fields sit behind Options (sheet on phones). Tiles always show the whole image. Engine: Merge's,
with `imageLayout`.

- AC-710 Each image is one page, in the order shown; the file is named after the first image.
- AC-711 Default is A4, auto orientation, no margin; the image fills the page inside the margin, ratio kept.
- AC-712 Fit to image makes each page the size of its picture (plus the margin).
- AC-713 A file that is not an image is skipped with a plain message.

## 4. PDF to text (`/pdf-to-text`)

Bare flow: pick, "Extract text", result. Engine `lib/pdf/page-text.ts`: pdf.js text in reading order,
lines rebuilt from positions, pages separated by a blank line; one PDF gives a `.txt`, several a ZIP.
Needs the copy permission (owner password asked when a file forbids copying).

- AC-720 The .txt holds the pages' text in page order; the result says the word count.
- AC-721 The result shows a preview and a Copy text button.
- AC-722 A PDF with no text (a scan) says so and points to OCR; nothing downloads.

## 5. Tests

Unit: `tiff-write`, `page-text`, `page-images` (scale, names, layout). e2e: `e2e/f12/image-text.spec.ts`;
the shared guards in `e2e/ui` and `e2e/seo` cover the three pages like every tool.
