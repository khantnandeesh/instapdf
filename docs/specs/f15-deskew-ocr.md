# F15: Deskew, OCR

Reference pages: `docs/discovery/pages/deskew-pdf.md`, `ocr-pdf.md`.

Screens: `designs/f15/deskew-{empty,loaded,dialog,result}-{1280,390}.png`.

## 1. Deskew (`/deskew-pdf`)

Runs in the browser; nothing is uploaded. The page-tool layout (F25 layout C): one switch in the top row.

- Up to 50 files. As soon as a file is in, every page is measured from a small picture of it, one after the other behind the pages on screen. The status line counts along ("Checking pages… 3 of 12"), then says how many pages will be straightened.
- How the tilt is found: the dark pixels of a straight page make sharp stripes when counted row by row (lines of text) and column by column (rules, table edges). The tilt is the turn, up to 15° either way, at which the stripes are sharpest, found to about a tenth of a degree. A page with no clear direction (blank, a photo, mostly dark) and a page that is already straight are left alone: a turn must be clearly sharper than none to count.
- The pages on screen show the result before the run: a tilted page is drawn straightened inside its frame with its turn as a badge ("−3.0°").
- A click on a page opens it large with level guide lines and a slider: −15° to +15°, the buttons step a tenth of a degree. "Use detected" goes back to the measured turn. Setting a page to 0 leaves it alone. The arrows step through the file's pages.
- "Skip slight tilts" leaves pages tilted by less than 1° as they are (a turn set by hand always counts). Pages tilted by less than 0.2° are never touched.
- The page is turned, not redrawn: its content is drawn through a rotation about the middle of the page. Scanned pictures keep every pixel, text stays text (an OCR layer turns with the picture), links and form fields move with the content, and the page keeps its size. Pages that are not turned are byte for byte what they were.
- A file with nothing to straighten says "Every page is straight" and the button waits.

Where we differ from the reference: it uploads the file, takes one file of up to 50 MB and 3 tasks an hour on its free tier, and makes the person choose between automatic and manual before seeing anything. Ours stays on the device, takes 50 files, shows every page straightened before the run, and lets any page be corrected by hand on top of the automatic result.

## 2. OCR (`/ocr-pdf`)

To come in this feature's second part.

## Acceptance criteria

Engine (`deskew.test.ts`): AC-1500 the tilt of a page of text is found to a tenth of a degree; AC-1501 a straight page is left alone; AC-1502 a page with no lines to go by gives no tilt; AC-1503 a page tilted further than the search reaches is not guessed at; AC-1504 rules and table edges count; AC-1510 the turn is clockwise as seen, about the middle of the page; AC-1511 only the pages named are turned, text stays text, the page keeps its size; AC-1512 a link moves with the content.

Browser (`e2e/f15/deskew.spec.ts`): AC-1520 tilted pages are found, shown straightened and turned in the file, the straight page is left alone; AC-1521 a page is set by hand a tenth of a degree at a time and can go back to the detected turn; AC-1522 slight tilts can be skipped, and a file with nothing to straighten says so.

## Known limits

- A page tilted by more than 15°, or lying on its side, is not corrected: Rotate does quarter turns first.
- The corners of a turned page that swing outside the page are cut off, and the opposite corners show the paper's white. The page is not enlarged to keep them.
- A link's or field's box is kept upright: after a turn it is the box around where its corners went.
- The pages on screen are small pictures turned by the browser, so a straightened preview is a little softer than the file will be.
