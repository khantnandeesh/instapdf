# F8: Crop, Resize, Flip, N-up

Routes: `/crop-pdf`, `/resize-pdf`, `/flip-pdf`, `/n-up-pdf`. All run in the browser; nothing is uploaded
(rule 4). Reference pages: `docs/discovery/pages/{crop-pdf,resize-pdf,flip-pdf,n-up-pdf}.md`.

Built from the shared components: the pick-pages flow (`PickPagesFlow`: Flip, Resize), `ToolFlow` (Crop,
N-up), `SegmentedControl`, `Select`, `TextInput`, `MoreOptions`, and the shared area picker
(`page-edit/AreaSelect` inside `page-edit/AreaDialog`, also used by Split by text). New shared pieces: two
page marks on the tile (`flip`: the picture mirrored; `keep`: the part that stays, the rest dimmed) and
`lib/pdf/page-geometry.ts` (reader's view to page coordinates for every rotation; one matrix moves a
page's content and its links, notes and fields).

No page is redrawn by any of the four: text stays text, pictures keep their resolution.

## 1. Where we beat the reference

| | Reference | BerryPDF |
|---|---|---|
| Privacy | Files are uploaded | Done on the device |
| Flip | One choice for the whole file; result seen after the run | The pages on screen are mirrored live; click pages to flip only those |
| Resize | Paper size or margins, by typed pages | Same, plus click pages to change only those; millimetres or inches; landscape pages keep landscape paper |
| Crop | Auto, auto maximum, or draw | Trim margins in one click with every page showing what stays before the run; one box for all pages or each page on its own; Fit to content in the box dialog; result size shown in mm |
| N-up | 2 to 32 per sheet | 2, 4, 8, 16; the status says how many sheets come out; rotated pages are placed as the reader saw them |
| Limits | Daily task, page and size limits | None |

Not yet: crop boxes that differ per page by hand, 32-up, a typed custom paper size.

## 2. Flip (`lib/pdf/flip.ts`)

Row: Left to right / Top to bottom. The content is drawn through a mirror matrix across the middle of
what the reader sees (a page turned a quarter mirrors along its other axis); links and fields move with it.

## 3. Resize (`lib/pdf/resize.ts`)

Row: Page size / Margins, then a paper list (A3, A4, A5, Letter, Legal, Tabloid) or a margin for every
side with mm / in. More options (Margins): each side on its own; an empty side takes the common value.
Page size scales the content to fit and centres it; margins only grow the page box.

## 4. Crop (`lib/pdf/crop.ts`, `lib/pdf/trim.ts`)

Row: Trim margins / Choose area. Trim margins measures each page from a small picture of it (anything
not paper white counts, 1.2% of room kept) behind the pages on screen; the status counts while it
measures. Same crop on every page (More options, on to begin with) uses one box that holds every page's
content. Choose area opens the box dialog. The crop sets the page's boxes; what lies outside is hidden,
not erased, and the guide says so.

## 5. N-up (`lib/pdf/nup.ts`)

Row: Pages per sheet 2 / 4 / 8 / 16. More options: Keep the paper size (pages shrink); Fill down, then
across; Start from the right. Upright pages go side by side, wide pages stack. By default the sheet
grows so pages keep full size. Each page is placed as a form of itself. Links are not carried over.

## 6. Acceptance criteria

- AC-1000 Flip left to right mirrors each picked page across its middle; AC-1001 top to bottom likewise.
- AC-1002 On a turned page the direction is the reader's. AC-1003 Unpicked pages stay; links move with the content.
- AC-1004 The tiles show the mirror before the run.
- AC-1010 Margins grow the page by the typed amounts; content keeps its size. AC-1011 Sides are the reader's on a turned page.
- AC-1012 A paper size scales the content to fit, centred; a wide page gets the paper on its side. AC-1013 A turned page that reads upright gets upright paper.
- AC-1014 Unpicked pages stay. AC-1015 A margin that is not a usable number keeps the button waiting.
- AC-1020 Choose area: every page keeps the box. AC-1021 The box is the reader's on a turned page. AC-1022 A box that is the whole page changes nothing.
- AC-1023 Trim margins finds the content of each page. AC-1024 The tiles show what stays; Same crop gives every page of a file one size.
- AC-1025 Fit to content sets the box to the shown page's content; the dialog shows the result size. AC-1026 Nothing to trim: the button waits and says so.
- AC-1030 N pages per sheet in reading order; a short last sheet is fine. AC-1031 Keep the paper size shrinks pages onto the first page's paper.
- AC-1032 Column order and right-to-left place pages accordingly. AC-1033 Turned pages are placed as shown. AC-1034 Text stays text.
- AC-1035 The status shows pages and sheets.
- AC-1036 All four pages pass the every-tool guards (first-screen fit, one scroller, budgets, axe).

Tests: `src/lib/pdf/page-shape.test.ts`, `e2e/f8/page-shape.spec.ts`.
