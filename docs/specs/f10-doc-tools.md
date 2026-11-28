# F10: Remove annotations, Flatten, Metadata, Bookmarks, Rename

Reference pages: `docs/discovery/pages/delete-pdf-annotations.md`, `flatten-pdf.md`, `edit-pdf-metadata.md`, `pdf-bookmarks.md`, `rename-pdf.md`.
All five run in the browser; nothing is uploaded. Settings tools (F25 §4): options in the side panel from 1024 px, in the bar and the More options sheet below.

## 1. Remove annotations (`/remove-pdf-annotations`, shown as "Clear annotations": the longer name wraps in the All tools menu)

- The pick-pages flow: click pages to clean only those; with none picked, every page.
- Five switches, each a group of kinds: highlights and underlines (with strikeouts and squiggles); drawings and shapes; notes and text boxes (with their pop-ups and replies); stamps and attachments (and kinds we do not know); links.
- Links are off by default: they are how a reader moves around the file. Everything else is on, so one click cleans a marked-up file.
- Form fields are never removed here.
- A note takes its pop-up and its replies with it; a pop-up is never removed on its own. An annotation two pages share is taken off the cleaned page only. In a batch, a file with nothing to remove is named. Nothing found ends in a plain message, not an empty download.

Where we differ from the reference: it lists thirteen kinds one by one and removes links under "All"; it processes on its servers. We group the kinds so the panel fits the first screen and keep links unless asked. The engine works by kind, so finer switches can come later without a format change.

## 2. Flatten (`/flatten-pdf`)

- "Form fields and annotations" (default) or "Form fields only". Up to 20 files, a ZIP for several.
- A field is drawn with the value it shows and stops being a field. A field that cannot be drawn safely stays fillable, with a note.
- An annotation with a drawn form (most highlights, stamps, text boxes) is drawn at its place and removed. One without stays an annotation, with a note. Notes hidden on screen and on paper, and replies to drawn annotations, go without being drawn, and the result says how many. Links, attached files and redaction marks stay as they are (drawing an attachment's icon would throw the file away). A signed file is flattened with a note that the signature can no longer be verified.
- Text stays text: pages are not turned into pictures.

### 2b. Whole pages, as pictures

- A third choice in the same select, with a quality select beside it (75, 100, 150 or 220 dpi; 150 by default). The quality select is always there and switched off for the other choices, so nothing moves.
- Each page is drawn as it shows (its rotation, fields and annotations included) and the picture becomes the whole page; page sizes stay. Text can no longer be selected, copied or edited. The title of the file is kept, nothing else.
- Pages are drawn in the tab one at a time; the worker builds the files. A page too large for the device is drawn at a lower resolution and the result says so.
- Below 1024 px the two selects share the bar with short names ("Pages as pictures", "150 dpi").

## 3. Metadata (`/edit-pdf-metadata`)

- The form is filled from the first file: Title, Author, Subject, Keywords, the program it was made with and the PDF producer, plus any fields of the maker's own.
- Edit: the fields in the form are written; a field the reader empties or deletes is taken out; anything the form did not show (a 21st own field, another file's fields in a batch) stays. Unchanged text is left as the file wrote it. Up to 20 own fields in the form; a name may be any printable text up to 120 characters, not a date key and not a duplicate.
- Remove all: no field, no dates, no file identifier; the hidden XML copy goes, and so do the XML details of pages and pictures and programs' private notes (`/PieceInfo`).
- A file marked PDF/A loses that mark with its XML copy; the result says so.
- On edit the XML copy is removed as well, since readers that prefer it would show the old values. The creation date is kept and the change date is set.
- Several files get the same details (the reference's free tier takes one file).

## 4. Bookmarks (`/pdf-bookmarks`)

- One file. Its bookmarks are read when it opens; the side panel (the bar below 1024 px) says how many and has "Edit bookmarks".
- The list opens in the shared dialog, the same at every width: one row per bookmark with its name, its page and a menu (Add below, Add inside, Move up, Move down, Move in a level, Move out a level, Delete). Nesting shows as an indent. "Add bookmark" adds one at the end; a new row takes the page of the row before it and its name gets the focus.
- Moving a bookmark moves what is under it; deleting it deletes what is under it. Up to 12 levels and 2,000 bookmarks.
- The button waits, and says why, until something changed, every bookmark has a name and every page is a page of the file.
- A bookmark the file already had keeps its colour, bold or italic style and open state, and the exact place it jumps to while its page is unchanged. The old outline's objects are deleted, so a removed bookmark's name is nowhere in the file.
- A file that gets bookmarks opens with the bookmarks panel unless it asks for another view; a file left with none has no outline.

Where we differ from the reference: it uploads the file and edits through right-click menus and drag and drop on a tree beside a page preview. Ours stays on the device and every action is in a menu a keyboard or a phone can reach. Not in this version: making a bookmark by clicking text on the page, and drag and drop.

## 5. Rename by content (`/rename-pdf`)

- Up to 20 files. "Choose text area" opens the shared area dialog on the first file's first page; the box starts across the top of the page, where a title usually is. The line under the page says what text the box catches.
- Every file is named after the text its own first page has in that box. The name pattern mixes `{text}` with `{name}` (the old name) and `{n}` (the file's number); empty means `{text}`.
- The first file's new name shows at once (side panel; beside the button below 1024 px).
- Names are made safe for a file system, long text is cut at a word (100 characters), two equal names get a number. A file with no text in the box keeps its name and the result says which.
- The files themselves are not touched: one file downloads under its new name, several in a ZIP.

Where we differ from the reference: it uploads the files and takes 5 per task on its free tier; ours stay on the device, 20 at a time, and the new name is shown before anything runs.

## Acceptance criteria

Engine (`f10.test.ts`): AC-1200 kinds group subtypes, fields are never a kind; AC-1201 counts by kind; AC-1202 chosen kinds on chosen pages only; AC-1203 a note takes its pop-up and replies; AC-1204 an emptied list leaves no `/Annots`; AC-1205 nothing to remove returns the file unchanged; AC-1206 an appearance is fitted to its rectangle through its matrix; AC-1210 annotations with a drawn form become content, links stay, the rest stays with a note; AC-1211 fields are drawn and the form goes; AC-1212 fields only leaves annotations; AC-1220 fields are read, standard first, no dates; AC-1221 update writes listed fields, drops the rest, keeps the creation date; AC-1222 remove all leaves nothing, not even in unreachable objects; AC-1223 a bare file gets its details; AC-1224 names are checked; AC-1225 fields the form never showed, odd names and long values survive an update; AC-1226 remove all clears page-level details, private notes and the identifier, and calls out PDF/A. Review cases: AC-1207 shared annotations; AC-1208 pop-ups never by kind; AC-1213 attachments and redaction marks are not flattened; AC-1214, AC-1215 what goes undrawn is said, print-only stamps are drawn; AC-1216 signed files.

Bookmarks (`bookmarks.test.ts`): AC-1280 rows from the outline; AC-1281 add below or inside; AC-1282 delete with children; AC-1283 move in and out; AC-1284 move up and down; AC-1285 names and pages checked; AC-1290 edits written, style kept; AC-1291 a new page drops the old view; AC-1292 deleted names leave the file; AC-1293 opens with the panel.

Rename (`rename.test.ts`): AC-1260 text becomes a safe name; AC-1261 pattern tokens; AC-1262 no text keeps the old name; AC-1263 equal texts get different names; AC-1264 long text is cut at a word; AC-1265 unseen characters are dropped.

Browser (`e2e/f10/doc-tools.spec.ts`): AC-1230 to AC-1232 Remove annotations; AC-1240, AC-1241 Flatten; AC-1242, AC-1243 Flatten to pictures; AC-1250 to AC-1253 Metadata; AC-1270, AC-1271 Rename; AC-1300, AC-1301 Bookmarks.

## Known limits

- Rename reads the first page only, and scanned pages have no text until they have been through text recognition.
- Flatten to pictures writes JPG pictures: a page of fine line art grows in size at 220 dpi.
- Annotation appearances that rely on a blend mode set on the annotation (not in its drawn form) may look slightly different once flattened.
- Remove annotations leaves the tags of a tagged PDF pointing at removed notes; readers ignore them.
- Metadata inside embedded pictures or attached files is not touched.
