# F7: Split by bookmarks, by size, in half (by text to follow)

Routes: `/split-pdf-by-bookmarks`, `/split-pdf-by-size`, `/split-pdf-in-half`. All run in the browser;
nothing is uploaded (rule 4). Reference pages:
`docs/discovery/pages/{split-pdf-by-outline,split-pdf-by-size,split-pdf-down-the-middle,split-pdf-by-text}.md`.

Built from the shared components: Split's own workspace (`SplitTool` with a `variant`), the shared
pick-pages flow (`PickPagesFlow`), `ToolFlow`, `Select`, `NumberStepper`, `SegmentedControl`,
`MoreOptions`, and a new shared `ui/TextInput`. The one-off guard's baseline did not grow.

## 1. Where we beat the reference

| | Reference | BerryPDF |
|---|---|---|
| Privacy | Files are uploaded | Done on the device |
| By bookmarks | A level field and a text filter; the result is seen after the run | The pages show every split live; any split can be moved by hand; files are named after their bookmark; pages before the first bookmark are kept |
| By size | Parts by size | The fewest parts that fit; a page too big on its own is named in the result; a file already under the limit stays one file with its name |
| In half | Cut every page, exclude by typing pages | Click the pages to cut (none picked = all); halves share the page's content, so the file does not double; right-to-left and booklet order |
| Limits | Daily task, page and size limits | None |

## 2. Split by bookmarks

Split's workspace in Custom mode. Row: Bookmark level (`Level 1 · 3 bookmarks`, one option per level the
files have) and Title contains (optional; in More options on a phone). Engine `lib/pdf/split-outline.ts`:
pdf.js reads the outline; a part starts at each page a bookmark of that level opens. The marks between
pages stay live. A part that starts at a bookmark is named after it (`titleAsName`); a typed name wins.

## 3. Split by size

Row: Largest file size (stepper) and MB / KB. Engine `lib/pdf/split-size.ts`, in the worker: greedy over
consecutive pages, each part's end found by doubling then halving steps with real saved sizes (2% and
2 KB of headroom for what the written files add). Then written like any other split.

## 4. Split in half

The pick-pages flow. Row: Auto / Left / right / Top / bottom. More options: Right page first; Booklet
scan (reorder pages). Engine `lib/pdf/split-half.ts`: each cut page appears twice with half its crop box
(the page's own rotation decides which half is "left" or "top"); nothing is redrawn. Unpicked pages
stay whole, in place.

## 5. Acceptance criteria

- AC-900 By bookmarks: a new file starts at each bookmark of the chosen level; the cut lines show it before the run.
- AC-901 Each file is named after the bookmark that starts it.
- AC-902 A deeper level splits at that level's bookmarks; pages before the first one form a file.
- AC-903 The title filter keeps only bookmarks whose title contains the text (any case).
- AC-904 A mark can be added or removed by hand after the bookmarks placed them.
- AC-905 A file with no bookmarks says so and the button waits.
- AC-910 By size: every part is at most the limit; AC-911 pages stay in order and none is lost; parts are filled greedily.
- AC-912 A file already under the limit stays one file, keeps its name, and the result says so.
- AC-913 A limit that is not a whole number of at least 20 KB keeps the button waiting.
- AC-914 A page larger than the limit alone becomes its own file and is named in the result.
- AC-920 In half: each cut sheet becomes its first half then its second. AC-921 Right page first swaps them.
- AC-922 Unpicked pages stay whole and in place. AC-923 Booklet scans come out in reading order.
- AC-924 The halves share content: the output does not double in size. AC-925 Top / bottom cuts across.
- AC-926 All three pages pass the every-tool guards (first-screen fit, one scroller, budgets).
- AC-927 Split in half keeps bookmarks (each opens the first half of its old page), form fields and tags. AC-928 A link or note goes to the half that shows it. AC-929 A crop box larger than the page is cut where the page is.
- AC-930 Split by size checks the written files: a part over the limit is re-split; a part that cannot fit is named in a note.

Tests: `src/lib/pdf/{split-outline,split-size,split-half}.test.ts`, `e2e/f7/split-variants.spec.ts`.
Screenshots: `designs/f7/`. Not yet built: Split by text (area on the page), a draggable cut line for In half.
