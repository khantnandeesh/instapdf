# F6: Compress

Reference page: `docs/discovery/pages/compress-pdf.md`.
This version runs in the browser; nothing is uploaded. Settings tool (F25 §4): options in the side panel from 1024 px, quality on the bar below with the rest behind More options.

Screens: `designs/f6-compress/{picker,loaded,result}-{1280,390}.png`, `designs/f6-compress/more-390.png`.

## 1. Compress (`/compress-pdf`)

- Up to 20 files; several come back in one ZIP.
- Pictures are what makes most PDFs heavy. Each picture is decoded in the tab, scaled to the size the page shows it at, and packed again as a JPEG. It takes the old one's place only when it is at least a tenth smaller.
- Options, remembered for the next visit:
  - Picture quality: Low (45), Regular (65, default), Good (80), Best (92).
  - Sharpness: 72 ppi (default), 100, 150, 220, 300, or Keep every pixel. A picture shown on several pages keeps enough pixels for the largest. A picture within a fifth of the target is not scaled.
  - Pictures in grey: off at first. Text and drawings keep their colours.
- Left exactly as they are: text (still selectable and searchable), drawings, fonts, links, bookmarks, fields and metadata; pictures in print colours (CMYK), spot colours and Lab; stencils and one-bit line art; pictures with a colour key; pictures under 3 kB; a picture drawn inside a pattern is packed but never scaled. Soft masks are kept, so see-through edges stay.
- The file is written by the compact writer: nothing unused, repeated objects stored once, old page thumbnails dropped.
- The result says what was saved: "499 KB before, 98% smaller." A ZIP lists each file's before and after.
- Never larger: a file that would not get smaller comes back byte for byte, and the result says it is already as small as this tool can make it.
- A file that opened with a password is saved without one, as in every tool.

Not in this version: the server fallback (it needs the budget hard stop and job limits of Q3 first), packing fonts, and one-bit scan packing (JBIG2).

Where we differ from the reference: it uploads the file, takes one file of up to 50 MB and 3 tasks an hour on its free tier. Ours stays on the device, takes 20 files with no hourly limit, never hands back a larger file, and says how much was saved.

## Acceptance criteria

- AC-1600…1603 (unit): the JPEG writer's tables are complete; a colour picture survives a round trip; higher quality gives a larger, closer picture; grey output is unchanged.
- AC-1610…1612 (unit): which pictures are listed; print colours, stencils, one-bit, colour-keyed, tiny pictures and masks are not.
- AC-1613…1617 (unit): a smaller picture is swapped in and the file shrinks; a picture not clearly smaller, larger in pixels or unknown is refused; a file with nothing to give comes back byte for byte; a matte mask gets its own plain copy; thumbnails are dropped.
- AC-1620…1624 (unit): drawn sizes follow transforms, forms, repeats and patterns; the scale rule; averaging; the saved line never promises more than was saved.
- AC-1630 (e2e): a 300 ppi photo comes back at 72 ppi as a JPEG, under a tenth of the size; the soft-edged picture keeps its mask; the icon is left; text is still text; the result states the saving; no serious axe finding.
- AC-1631 (e2e): Low is smaller than Best; Keep every pixel keeps the pixels; grey pictures are grey.
- AC-1632 (e2e): a file already compressed comes back byte for byte with the "already as small" notice.
- AC-1633 (e2e): two files come back in one ZIP, none larger.
- AC-1634 (e2e): choices are remembered.
- AC-1635 (e2e): no request other than GET is made.
