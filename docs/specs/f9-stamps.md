# F9: Page numbers, Header and footer, Watermark, Bates numbering

Reference pages: `docs/discovery/pages/page-numbers-pdf.md`, `header-footer-pdf.md`, `watermark-pdf.md`, `bates-numbering-pdf.md`.

All four run in the browser; nothing is uploaded. They are settings tools (F25 §4) on the shared pick-pages flow: click pages to change only those, none picked means all.

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

## Bates numbering (`/bates-numbering`)

One running number on every page of every file, counted on from file to file in the order shown; click pages to number only those. Built on the same engine: the job gets where the count starts, the digits and the first file's number (`BatesRun`), and each file starts after the pages of the files before it. Tokens `{bates}` (padded number) and `{doc}` (file number) join the others; they are filled only in this tool.

Options, two groups so the panel fits the first screen at 1280×632: Where (position, distance from the edge, or "Added strip": the page grows at that edge by the line's height and margin, through Resize's margins, so nothing on a full-bleed page is covered or shrunk) and Number (line: number, with page, exhibit, exhibit and page, or your own with tokens; digits 1 to 8; text before; starts at; files from, shown where the line counts files; font and size). The start numbers are not remembered between visits: they belong to one job.

| Check | Reference | Ours |
|---|---|---|
| Upload | Files are uploaded | Nothing leaves the device |
| Files | One per task free | 20 at a time, counted on across them |
| Preview | One sample line | Every page shows its own number before the run |
| Pages | All pages | All, or only the pages clicked |
| Room for the line | Margins on every side | A strip at the line's edge only |
| Limits | 50 pages, 3 tasks an hour free | None |

Not in this version: a colour for the line (always black), and a different line per file.

## Acceptance checks

Engine (`stamp.test.ts`): AC-1100 tokens; AC-1101 roman numerals; AC-1102 numbering counts stamped pages from the first number; AC-1103 watermark text never outgrows its room; AC-1110 a line sits in the margin, aligned by its place; AC-1111 on a turned page the line reads upright along the edge the reader sees; AC-1112 an empty line draws nothing; AC-1113 watermark centred, turned, see-through, or tiled; AC-1114 a picture keeps its shape and stays on the page; AC-1120 numbers land in the footer of picked pages; AC-1121 opacity is written, the page's own text stays; AC-1122 nothing to stamp gives the file back unchanged; AC-1123 a password-opened file is saved without it. Review cases: AC-1115 quarter turn the other way with a visible box off the origin; AC-1116 lines on one edge share its width (alone: all of it; left and right: half each; with a centre line: a third each) and never overlap; AC-1124 a line wider than its box is drawn smaller, measured with its real font, so wide letters stay on the page (the preview does the same); AC-1125 a tiled see-through watermark adds one shared graphics state; a password-opened file leaves no `/Encrypt` pointer behind (fixed for every tool that opens locked files).

Browser (`e2e/f9/stamp.spec.ts`, desktop and phone): AC-1130/1131 numbers on every page, previewed first; AC-1132 format, first number, picked pages; AC-1133 a bad first number keeps the button waiting; AC-1134 position moves the number; AC-1140/1141 header and footer lines with tokens, button waits for text; AC-1142 Hindi and Arabic lines read back as typed; AC-1150/1151 watermark text, picked pages, opacity; AC-1152 repeated across the page; AC-1153 picture watermark; AC-1154 several files come back as a ZIP.

Bates (`stamp.test.ts`, `e2e/f9/stamp.spec.ts`): AC-1160 padding; AC-1161 the line from style and text before, tokens filled only where the run gives them; AC-1162 a file counts on from where its run starts and carries its file number; AC-1163 an added strip grows the stamped pages at that edge; AC-1170/1171 numbers count on from file to file, previewed first, each file comes back numbered; AC-1172 line, digits, text before, start and file number; AC-1173 your own line with tokens, a bad start keeps the button waiting; AC-1174 the added strip in the browser.

Layout: the options panel fits the first screen at 1280×632 and up (`e2e/ui/viewport-fit.spec.ts`); below 1024 px the bar holds the key control and the rest is in More options.

## Known limits

- A file opened with a password is read twice (once to open it, once by the build); very large locked files use more memory than plain ones.
- Characters no font here can write (emoji) print as "?"; tabs, line breaks and zero-width spaces are cleaned first.
- Watermarks are drawn over the page content, not under it.
- Custom colours, custom angles and dragging the watermark by hand are not in this version; the editor does free placement.
- A see-through watermark in a shaped script is drawn in a lighter solid colour.

Screenshots: `/mnt/project-files/designs/f9/`.
