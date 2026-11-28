# F9: Page numbers, Header and footer, Watermark

Reference pages: `docs/discovery/pages/page-numbers-pdf.md`, `header-footer-pdf.md`, `watermark-pdf.md`. Bates numbering is deferred.

All three run in the browser; nothing is uploaded. They are settings tools (F25 §4) on the shared pick-pages flow: click pages to change only those, none picked means all.

## How it is built (shared first)

- `lib/pdf/stamp.ts` (pure, light): where each stamp goes on a page, as objects of the editor's model. Tokens `{n}`, `{total}`, `{roman}`, `{ROMAN}`, `{file}`, `{date}`.
- `lib/pdf/stamp-run.ts` + job `stamp`: reads the page shapes and hands the objects to the editor's build (`lib/editor/build-runtime.ts`, now shared by the editor's download worker and these tools). Same fonts, same scripts: Hindi, Arabic and other joined or right-to-left text is shaped by the editor's engine.
- `components/page-edit/StampLayer`: the same objects drawn over each page tile, so the preview has the output's geometry.
- `tools/stamp/shared.tsx`: style controls, option groups, preview and run for the three tools.
- Added text can carry an opacity (`TextObj.opacity`). Shaped lines are drawn solid by the engine, so a see-through one gets the colour it would show on white paper.

## Where we beat the reference

| Check | Reference | Ours |
|---|---|---|
| Upload | Files are uploaded | Nothing leaves the device |
| Preview | Sample on one page | Every page shows its own number, line or watermark before the run |
| Header and footer | One line per run | Six places in one run, with file name and date tokens |
| Pages | Typed range | Click pages; numbering counts the picked pages from the first number |
| Limits | 50 pages / 3 tasks an hour free | None |
| Scripts | Three Latin fonts | Open fonts with fallback; Hindi and Arabic shaped |

## Acceptance checks

Engine (`stamp.test.ts`): AC-1100 tokens; AC-1101 roman numerals; AC-1102 numbering counts stamped pages from the first number; AC-1103 watermark text never outgrows its room; AC-1110 a line sits in the margin, aligned by its place; AC-1111 on a turned page the line reads upright along the edge the reader sees; AC-1112 an empty line draws nothing; AC-1113 watermark centred, turned, see-through, or tiled; AC-1114 a picture keeps its shape and stays on the page; AC-1120 numbers land in the footer of picked pages; AC-1121 opacity is written, the page's own text stays; AC-1122 nothing to stamp gives the file back unchanged; AC-1123 a password-opened file is saved without it. Review cases: AC-1115 quarter turn the other way with a visible box off the origin; AC-1116 lines on one edge share its width (alone: all of it; left and right: half each; with a centre line: a third each) and never overlap; AC-1124 a line wider than its box is drawn smaller, measured with its real font, so wide letters stay on the page (the preview does the same); AC-1125 a tiled see-through watermark adds one shared graphics state; a password-opened file leaves no `/Encrypt` pointer behind (fixed for every tool that opens locked files).

Browser (`e2e/f9/stamp.spec.ts`, desktop and phone): AC-1130/1131 numbers on every page, previewed first; AC-1132 format, first number, picked pages; AC-1133 a bad first number keeps the button waiting; AC-1134 position moves the number; AC-1140/1141 header and footer lines with tokens, button waits for text; AC-1142 Hindi and Arabic lines read back as typed; AC-1150/1151 watermark text, picked pages, opacity; AC-1152 repeated across the page; AC-1153 picture watermark; AC-1154 several files come back as a ZIP.

Layout: the options panel fits the first screen at 1280×632 and up (`e2e/ui/viewport-fit.spec.ts`); below 1024 px the bar holds the key control and the rest is in More options.

## Known limits

- A file opened with a password is read twice (once to open it, once by the build); very large locked files use more memory than plain ones.
- Characters no font here can write (emoji) print as "?"; tabs, line breaks and zero-width spaces are cleaned first.
- Watermarks are drawn over the page content, not under it.
- Custom colours, custom angles and dragging the watermark by hand are not in this version; the editor does free placement.
- A see-through watermark in a shaped script is drawn in a lighter solid colour.

Screenshots: `/mnt/project-files/designs/f9/`.
