# F13: Grayscale, Repair

Reference pages: `docs/discovery/pages/grayscale-pdf.md`, `repair-pdf.md`.
Both run in the browser; nothing is uploaded. Settings tools (F25 §4): options in the side panel from 1024 px, in the bar below.

Screens: `designs/f13/grayscale-{empty,loaded,result}-{1280,390}.png`.

## 1. Grayscale (`/grayscale-pdf`)

- Up to 20 files. One choice, "What to convert": Everything (default), Text and drawings only, Pictures only. The line under it says what the choice does.
- The file is converted in place, never redrawn as pictures:
  - Every colour a page sets (text, lines, fills) becomes one grey value, its luminance. This covers page content, forms, tiling patterns, annotation looks and Type 3 glyphs, in every colour space: RGB, CMYK, Lab, ICC, palette, spot and multi-ink colours (their tint functions are worked out).
  - Gradients keep their geometry and get a grey colour function; mesh gradients get a grey value at each corner.
  - Pictures are decoded in the tab and written back as one-channel pictures: a photo (JPEG, JPEG 2000) as a grey JPEG, anything else lossless. Transparency (soft masks) is kept. Pictures already grey, and stencils, are left untouched.
  - Annotation colours, form field text colours and bookmark colours turn grey too.
- Text stays selectable and searchable; links, bookmarks, fields, tags and metadata are kept.
- What cannot be converted is never hidden: the result names how many pictures, gradients or page parts kept their colour.
- A file that opened with a password is saved without one, as in every tool.

Where we differ from the reference: it uploads the file, takes one file of up to 50 MB and 3 tasks an hour on its free tier, and says scanned documents are not supported. Ours stays on the device, takes 20 files, converts scans (they are pictures) and lets pictures or text be converted alone.

## 2. Repair (`/repair-pdf`)

To come in this feature's second part.

## Acceptance criteria

Engine (`grayscale.test.ts`): AC-1400 a colour of any space becomes its luminance; AC-1401 the four kinds of PDF function; AC-1410 colour operators become grey ones and nothing else changes; AC-1411 named colour spaces followed through q and Q; AC-1412 uncoloured and coloured patterns; AC-1413 small pictures inside the content; AC-1420 page, forms, patterns and annotation looks hold no colour operator; AC-1421 a gradient keeps its shape; AC-1422 annotation and field colours; AC-1423 pictures only leaves text; AC-1424 mesh gradients; AC-1425 every fixture converts; AC-1430 colour pictures are found; AC-1431 a grey picture takes the colour one's place; AC-1432 a picture left over is named; AC-1433 lossless packing gives back every pixel; AC-1434 a photo becomes a one-channel JPEG any reader decodes.

Browser (`e2e/f13/grayscale.spec.ts`): AC-1440 everything turns grey, text stays text, the file is smaller; AC-1441 the two partial choices.

## Known limits

- A picture drawn only by a font glyph, and a picture larger than 50 megapixels, keeps its colour (the result says so).
- Small pictures written inside page content are converted when they are stored unpacked; packed ones keep their colour (the result says so).
- A picture with a colour-key mask loses the key: the area it hid shows as the picture's own pixels.
- Colours are converted by luminance without colour profiles: a profile-managed print may differ by a shade.
- Rich-text notes (`/RC`) keep the colours written in their styling.
