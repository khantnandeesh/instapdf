# F10: Remove annotations, Flatten, Metadata (Bookmarks and Rename follow)

Reference pages: `docs/discovery/pages/delete-pdf-annotations.md`, `flatten-pdf.md`, `edit-pdf-metadata.md`.
All three run in the browser; nothing is uploaded. Settings tools (F25 §4): options in the side panel from 1024 px, in the bar and the More options sheet below.

## 1. Remove annotations (`/remove-pdf-annotations`, shown as "Clear annotations": the longer name wraps in the All tools menu)

- The pick-pages flow: click pages to clean only those; with none picked, every page.
- Five switches, each a group of kinds: highlights and underlines (with strikeouts and squiggles); drawings and shapes; notes and text boxes (with their pop-ups and replies); stamps and attachments (and kinds we do not know); links.
- Links are off by default: they are how a reader moves around the file. Everything else is on, so one click cleans a marked-up file.
- Form fields are never removed here.
- A note takes its pop-up and its replies with it. Nothing found ends in a plain message, not an empty download.

Where we differ from the reference: it lists thirteen kinds one by one and removes links under "All"; it processes on its servers. We group the kinds so the panel fits the first screen and keep links unless asked. The engine works by kind, so finer switches can come later without a format change.

## 2. Flatten (`/flatten-pdf`)

- "Form fields and annotations" (default) or "Form fields only". Up to 20 files, a ZIP for several.
- A field is drawn with the value it shows and stops being a field. A field that cannot be drawn safely stays fillable, with a note.
- An annotation with a drawn form (most highlights, stamps, text boxes) is drawn at its place and removed. One without stays an annotation, with a note. Hidden notes go without being drawn. Links stay links.
- Text stays text: pages are not turned into pictures.

Follow-up: the reference's second mode, whole pages as images at 75 to 220 dpi, is not in this version.

## 3. Metadata (`/edit-pdf-metadata`)

- The form is filled from the first file: Title, Author, Subject, Keywords, the program it was made with and the PDF producer, plus any fields of the maker's own.
- Edit: what the form shows is what the file gets. An emptied field is removed. Up to 20 own fields; names are checked (letters, digits, spaces, dots, dashes; not a date key; not a duplicate).
- Remove all: no field, no dates, and the hidden XML copy goes too.
- On edit the XML copy is removed as well, since readers that prefer it would show the old values. The creation date is kept and the change date is set.
- Several files get the same details (the reference's free tier takes one file).

## Acceptance criteria

Engine (`f10.test.ts`): AC-1200 kinds group subtypes, fields are never a kind; AC-1201 counts by kind; AC-1202 chosen kinds on chosen pages only; AC-1203 a note takes its pop-up and replies; AC-1204 an emptied list leaves no `/Annots`; AC-1205 nothing to remove returns the file unchanged; AC-1206 an appearance is fitted to its rectangle through its matrix; AC-1210 annotations with a drawn form become content, links stay, the rest stays with a note; AC-1211 fields are drawn and the form goes; AC-1212 fields only leaves annotations; AC-1220 fields are read, standard first, no dates; AC-1221 update writes listed fields, drops the rest, keeps the creation date; AC-1222 remove all leaves nothing, not even in unreachable objects; AC-1223 a bare file gets its details; AC-1224 names are checked.

Browser (`e2e/f10/doc-tools.spec.ts`): AC-1230 to AC-1232 Remove annotations; AC-1240, AC-1241 Flatten; AC-1250 to AC-1253 Metadata.

## Known limits

- Annotation appearances that rely on a blend mode set on the annotation (not in its drawn form) may look slightly different once flattened.
- Remove annotations leaves the tags of a tagged PDF pointing at removed notes; readers ignore them.
- Metadata inside embedded pictures or attached files is not touched.
