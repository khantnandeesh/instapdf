# F15: Deskew, OCR

Reference pages: `docs/discovery/pages/deskew-pdf.md`, `ocr-pdf.md`.

Screens: `designs/f15/deskew-{empty,loaded,dialog,result}-{1280,390}.png`, `designs/f15/ocr-{empty,loaded,result}-{1280,390}.png`, `ocr-options-390.png`.

## 1. Deskew (`/deskew-pdf`)

Runs in the browser; nothing is uploaded. The page-tool layout (F25 layout C): a switch and a pages field in the top row.

- Up to 50 files. As soon as a file is in, every page is measured from a small picture of it, one after the other behind the pages on screen. The status line counts along ("Checking pages… 3 of 12"), then says how many pages will be straightened.
- How the tilt is found: the dark pixels of a straight page make sharp stripes when counted row by row (lines of text) and column by column (rules, table edges). The tilt is the turn, up to 15° either way, at which the stripes are sharpest, found to about a tenth of a degree. A page with no clear direction (blank, a photo, mostly dark) and a page that is already straight are left alone: a turn must be clearly sharper than none to count.
- The pages on screen show the result before the run: a tilted page is drawn straightened inside its frame with its turn as a badge ("−3.0°").
- A click on a page opens it large with level guide lines and a slider: −15° to +15°, the buttons step a tenth of a degree. "Leave as is" sets the page to no turn in one click; "Use detected" goes back to the measured turn. The arrows step through the file's pages.
- "Skip slight tilts" leaves pages tilted by less than 1° as they are (a turn set by hand always counts). Pages tilted by less than 0.2° are never touched.
- "Only these pages" (the shared range field: "2-4, 9, odd, last"; empty means every page) keeps the automatic correction to the pages named. A page set by hand counts wherever it is. A number past the end of the file is said in the field and the button waits.
- The page is turned, not redrawn: its content is drawn through a rotation about the middle of the page. Scanned pictures keep every pixel, text stays text (an OCR layer turns with the picture), links and form fields move with the content, and the page keeps its size. Pages that are not turned are byte for byte what they were.
- A file with nothing to straighten says "Every page is straight" and the button waits.

Where we differ from the reference: it uploads the file, takes one file of up to 50 MB and 3 tasks an hour on its free tier, and makes the person choose between automatic and manual before seeing anything. Ours stays on the device, takes 50 files, shows every page straightened before the run, and lets any page be corrected by hand on top of the automatic result.

## 2. OCR (`/ocr-pdf`)

Runs in the browser; nothing is uploaded. A settings tool (F25 §4): the options in the side panel, the language in the bar on narrow screens with the rest under More options.

- Engine: Tesseract (LSTM), compiled to WebAssembly, through tesseract.js 7 (Apache-2.0). The worker script, the WebAssembly core and the language data are copied into `public/ocr/` at build (`scripts/copy-ocr.mjs`) and served from our own origin under folders named by version, cached for a year. Nothing comes from a CDN, and the recogniser's worker runs under the same content security policy as our own workers (it can reach this site only).
- Languages: English, Hindi, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Arabic, Chinese (Simplified), Japanese (`src/lib/ocr/ocr.json`; the integer "best" models, 0.7 to 3.0 MB each, fetched on first use and then kept by the browser). A first visit starts on the browser's language when we ship it. A second language can be added for a document that mixes two.
- Each page that needs it is drawn at 300 dpi and read; up to three pages are read at once, fewer on a small device. The bar counts pages. Cancel stops the recognisers at once.
- "Skip pages that already have text" (on by default): a page whose own text has 12 letters or digits or more is not read again, so a file that mixes typed and scanned pages does not get doubled text. A page number or a stamp on a scan does not count as its text.
- Result, one of: a searchable PDF (default), a text file, or both in a ZIP.
  - Searchable PDF: the text found is laid over each page, invisible, each word where it is in the picture, in the page as shown (a page lying on its side gets its layer turned with it). The page itself is not redrawn or re-compressed: the file grows by a few kilobytes a page.
  - Text file: every page's text in order, the pages that already had text included.
- The result says how many pages were read ("Text was recognised on 2 of 3 pages. The others already had their text."). A file where nothing was found says so and is handed back unchanged; asking for a text file when there is no text at all is an error with that reason.
- Up to 50 files; no page limit.

Where we differ from the reference: it uploads the file, reads at most 10 pages on its free tier (100 paid) and one file per task, three tasks an hour. Ours stays on the device, has no page or task limit, takes 50 files, leaves typed pages alone and can read two languages at once. Its language list was not counted (the crawl does not show it); ours is 12 and grows one line at a time.

Server engine: not built. The charter allows a server fallback for large jobs; the browser engine has no page limit, so it is left until a real case needs it.

## Acceptance criteria

Engine (`deskew.test.ts`): AC-1500 the tilt of a page of text is found to a tenth of a degree; AC-1501 a straight page is left alone; AC-1502 a page with no lines to go by gives no tilt; AC-1503 a page tilted further than the search reaches is not guessed at; AC-1504 rules and table edges count; AC-1510 the turn is clockwise as seen, about the middle of the page; AC-1511 only the pages named are turned, text stays text, the page keeps its size; AC-1512 a link moves with the content.

Browser (`e2e/f15/deskew.spec.ts`): AC-1520 tilted pages are found, shown straightened and turned in the file, the straight page is left alone; AC-1521 a page is set by hand a tenth of a degree at a time and can go back to the detected turn; AC-1522 slight tilts can be skipped, and a file with nothing to straighten says so; AC-1523 the run can be kept to chosen pages, and one click in the dialog leaves a page as it is.

OCR, browser (`e2e/f15/ocr.spec.ts`): AC-1530 scanned pages get their text where the words are, an upright and a turned page alike, a typed page is left alone and the file grows by the text only; AC-1531 the text can be had as a text file, or both in a ZIP; AC-1532 a second language is fetched with the first, the choices are remembered, and pages that have text can be read again; AC-1533 only GET requests to our own origin are made; AC-1534 Cancel stops the reading and the tool is ready again; AC-1535 a language file that cannot be fetched is said and the tool can try again; AC-1536 Cancel while a page is being read stops the run and the next run finishes.

OCR, engine (`ocr-layer.test.ts`, `ocr/languages.test.ts`): AC-1540 a layer covers the whole page whatever size it was drawn at; AC-1541 on a page shown turned the layer is turned with it; AC-1542 a page box that does not start at the corner is followed and other pages are untouched; AC-1543 two pages that share their content streams each get only their own layer; AC-1545 the browser's language picks ours; AC-1546 every language listed is installed at the version named; AC-1547 a page number on a scan is not the page's text.

## Known limits

- A page tilted by more than 15°, or lying on its side, is not corrected: Rotate does quarter turns first.
- The corners of a turned page that swing outside the page are cut off, and the opposite corners show the paper's white. The page is not enlarged to keep them.
- A link's or field's box is kept upright: after a turn it is the box around where its corners went.
- The pages on screen are small pictures turned by the browser, so a straightened preview is a little softer than the file will be.
- OCR: accuracy is the recogniser's; small, faint or tilted print reads worse (Deskew first helps). Handwriting is not read.
- OCR: a page that mixes typed text and a scanned picture counts as having text and is skipped unless the switch is off; then its typed words are in the file twice.
- OCR: each layer carries its own copy of the (tiny) invisible font, about 1.5 kB a page.
