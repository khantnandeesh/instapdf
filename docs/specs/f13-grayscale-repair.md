# F13: Grayscale, Repair

Reference pages: `docs/discovery/pages/grayscale-pdf.md`, `repair-pdf.md`.
Both run in the browser; nothing is uploaded. Settings tools (F25 §4): options in the side panel from 1024 px, in the bar below.

Screens: `designs/f13/grayscale-{empty,loaded,result}-{1280,390}.png`, `designs/f13/repair-{damaged,loaded,result}-{1280,390}.png`.

## 1. Grayscale (`/grayscale-pdf`)

- Up to 20 files. One choice, "What to convert": Everything (default), Text and drawings only, Pictures only. The line under it says what the choice does.
- The file is converted in place, never redrawn as pictures:
  - Every colour a page sets (text, lines, fills) becomes one grey value, its luminance. This covers page content, forms, tiling patterns, annotation looks and Type 3 glyphs, in every colour space: RGB, CMYK, Lab, ICC, palette, spot and multi-ink colours (their tint functions are worked out).
  - Gradients keep their geometry and get a grey colour function; mesh gradients get a grey value at each corner.
  - Pictures are decoded in the tab and written back as one-channel pictures: a photo (JPEG, JPEG 2000) as a grey JPEG, anything else lossless. Transparency (soft masks) is kept. Pictures already grey, and stencils, are left untouched.
  - Annotation colours, form field text colours and bookmark colours turn grey too.
- Extras, both off at first: "Make text black" writes dark text (grey level 0.6 or darker) in pure black, for crisper print; light text on a dark ground keeps its grey, and drawings are never blackened. "Smaller photos" packs photos harder (JPEG quality 60 instead of 88) for a lighter file.
- Text stays selectable and searchable; links, bookmarks, fields, tags and metadata are kept.
- What cannot be converted is never hidden: the result names how many pictures, gradients or page parts kept their colour.
- A file that opened with a password is saved without one, as in every tool.

Where we differ from the reference: it uploads the file, takes one file of up to 50 MB and 3 tasks an hour on its free tier, and says scanned documents are not supported. Ours stays on the device, takes 20 files, converts scans (they are pictures) and lets pictures or text be converted alone.

## 2. Repair (`/repair-pdf`)

- Up to 20 files, no options: add the file, press Repair.
- A file nothing can open is still taken. It shows as one placeholder page marked Damaged, with a notice that says so, instead of the usual "could not be read" refusal (ToolFlow `acceptDamaged`).
- The ladder, each step only when the one before fails:
  1. Read the objects where they lie, without trusting the index, trailer or stream lengths. Text before `%PDF-` is dropped; a missing header is put on. This recovers a file cut short, shifted, or with a broken index.
  2. Rebuild the page list: the pages the tree still reaches, or, when the tree is gone, every page object found, in file order. When the tree reaches fewer pages than it counts, the page objects it missed are added after the ones it reached. A lost trailer's catalog and document information are found again among the objects. Each page gets what it inherited from lost parents (size, resources, rotation), a default size when it has none, and loses references to parts that no longer exist. The result is one flat page tree, written with a fresh index.
  3. When that fails but the file still renders, its pages are redrawn as pictures at 150 dpi, and the result says text is no longer selectable.
  4. When no page can be read, the tool says plainly that too little is left to repair.
- The result says what was done: a damaged file that lost nothing gets "The file was damaged. All N pages were recovered." A failed repair withdraws the "can still be repaired" notice and offers Start over, not Try again. Every other tool's "couldn't be opened" notice offers Repair and takes the file along.
- The result says what was lost: "N of M pages were recovered", pages that lost their content and are blank.
- A sound file comes back sound with nothing to report. A password file is asked for its password and saved without one.

Engine choice: our own repair on the PDF library already shipped, no new dependency. The qpdf WASM builds on npm were tried and set aside: one is built without exceptions and aborts on the damaged files qpdf itself recovers, the other needs threads, and with them cross-origin isolation on every page.

Where we differ from the reference: it uploads the file and takes one at a time. Ours stays on the device, takes 20, and names what could not be saved.

## Acceptance criteria

Engine (`grayscale.test.ts`): AC-1400 a colour of any space becomes its luminance; AC-1401 the four kinds of PDF function; AC-1410 colour operators become grey ones and nothing else changes; AC-1411 named colour spaces followed through q and Q; AC-1412 uncoloured and coloured patterns; AC-1413 small pictures inside the content; AC-1420 page, forms, patterns and annotation looks hold no colour operator; AC-1421 a gradient keeps its shape; AC-1422 annotation and field colours; AC-1423 pictures only leaves text; AC-1424 mesh gradients; AC-1425 every fixture converts; AC-1430 colour pictures are found; AC-1431 a grey picture takes the colour one's place; AC-1432 a picture left over is named; AC-1433 lossless packing gives back every pixel; AC-1434 a photo becomes a one-channel JPEG any reader decodes; AC-1435 a soft mask's matte is not applied twice; AC-1436 a picture decoded larger than its own size is brought back to it; AC-1437 dark text becomes black and what follows keeps its grey; AC-1438 light text, drawings and unknown colours are left alone; AC-1439 the option reaches a real file, and photos can be packed smaller.

Browser (`e2e/f13/grayscale.spec.ts`): AC-1440 everything turns grey, text stays text, the file is smaller; AC-1441 the two partial choices; AC-1442 the extras.

Repair engine (`repair.test.ts`): AC-1450 text before the header is dropped, a missing header put on; AC-1451 a file with its end cut off keeps every page; AC-1452 junk in front, a shifted body and a wrong index; AC-1453 a stream with a wrong length; AC-1454 a file cut in the middle gives the whole pages and says how many are gone; AC-1455 a page list pointing at missing pages is rebuilt; AC-1456 a sound file comes back sound; AC-1457 a file with nothing left says so; AC-1458 a lost branch of the page list does not lose its pages; AC-1459 a password file opens with its password, and one that lost its key says so.

Repair browser (`e2e/f13/repair.spec.ts`): AC-1460 a file whose end is missing comes back whole; AC-1461 a file nothing can open is taken, shown as damaged, and told plainly when nothing is left.

## Known limits

- A picture drawn only by a font glyph, and a picture larger than 50 megapixels, keeps its colour (the result says so).
- Small pictures written inside page content are converted when they are stored unpacked; packed ones, and Lab ones, keep their colour (the result says so).
- Content that uses a colour space the page does not define, a stream packed with a predictor we cannot rewrite, and a picture that carries its transparency inside its own data keep their colour (the result says so).
- A picture with a colour-key mask loses the key: the area it hid shows as the picture's own pixels.
- Colours are converted by luminance without colour profiles: a profile-managed print may differ by a shade.
- Rich-text notes (`/RC`) keep the colours written in their styling.
- Repair: pages stored inside a packed object stream that is itself cut short are lost (the stream cannot be unpacked to its end); the result says how many pages are gone.
- Repair: bookmarks, links and form fields that pointed at lost pages are dropped with them; a damaged font or picture inside a page is kept as it is.
- Repair: a password file too damaged to open in the tab cannot be asked for its password, and a password file that lost its trailer lost its key. Both are refused with a message that says why, never written out as noise.
- Grayscale, Make text black: text inside a form or pattern that is drawn in its caller's colour keeps its grey (the colour to go back to after the text cannot be known).
