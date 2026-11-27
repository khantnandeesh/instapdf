# F25: Tool layout standard (picker, top row, one progress, one result)

Status: spec draft, written by the UX designer (step 3) on 2026-11-26 from the owner's final decisions of 26 Nov. It is not reviewed yet.
ACs: AC-600 to AC-659.
Review tier: **full**. It touches the editor (`tools/editor/`) and what the tools download. **One PR.**

Design evidence (internal, outside git): `/mnt/project-files/designs/tool-layout-standard/`.
- Boards: `06-your-picks-combined.png` (the picks put together), `01b-file-picker-card.png`, `05-progress-and-result.png`, `04-edit-pdf.png`, `00-today-vs-sejda.png`.
- Mockup source: `mockups/mock.html`, views `emptyB`, `C`, `CP`, `E1` and `result`. Renders are in `mockups/*.png`.
- Today's build, every tool at 1280 and 390: `today/`.

Where the boards differ, board 06 and the decisions below win. Two places where board 05 is older:
- board 05's "Browser tool working" frames show the pill in a floating bottom bar;
- board 05's result frame has a centred head.

## 0. Why, and what changes

The owner asked for every tool page to be standardised. A code audit found these differences:

**Empty state.**
- Every ToolFlow tool uses ToolIntro + DropCard + FilePicker (`components/tool-flow/ToolFlow.tsx:934-969`), in two variants:
  - `emptyLayout="side"`: the drop card plus a 360px options panel with a disabled primary. Used by Rotate, Delete, Extract, Split, Merge and Combine.
  - `emptyLayout="bar"`: the drop card plus an empty bottom bar. Used by Organize and Alternate.
- The editor has its own landing (`tools/editor/EditorTool.tsx:207-240`):
  - its own `h1` and padding;
  - a hand copy of the DropCard markup;
  - a "Blank page" button;
  - a picker label that changes to "Opening…".

**Loaded layout.**
- ToolFlow tools fold their options into a fixed bottom bar from 1024px (`ControlDock layout="bar"`).
- The editor is a fixed full-screen focus mode (`editor.css:9-12`) that hides the navbar.

**Progress.** Page tools show two indicators at once:
- the jam bar in the primary's place (`ControlDock.tsx:248-256`);
- a 96px berry loader card over the pages (`ToolFlow.tsx:1074-1087`).

The editor shows a spinner inside Download (`Chrome.tsx:303`) and then a toast with a middle-dot string (`EditorShell.tsx:818`).

**Cancel.** There is none. `run()` creates an AbortController, and `runInWorker` terminates the worker on abort (`lib/pdf/worker-client.ts:53-56`), but no control triggers it. `buildInWorker` (the editor's download) takes no signal at all.

**Result.** ResultCard replaces the work area. It has a 200–240px preview tray and Download beside it. The editor has no result surface beyond the toast.

### Design intent (frontend-design plan and critique)

- **Boldness goes in one place: the action slot.** The button the user presses is where progress plays and where the result's next step appears. Everything else stays quiet: grid paper, white surfaces and PT-1 tiles, as today.
- **Cut:**
  - the empty options panel and the empty bar;
  - the berry overlay;
  - the in-button spinner;
  - the toast;
  - the small result tray;
  - the editor's focus mode;
  - a second Download.
- **Checked against the tells:**
  - no new card kit (the picker card already exists);
  - no eyebrows;
  - no scattered entrances (the T-catalogue keeps one swap per state);
  - no decoration added.
- **Copy:**
  - A button keeps its name through the flow: "Delete pages" → "Deleting… 42%" → "Done" → the result's "Download".
  - In the editor: "Download" → "Downloading… 60%" → "Downloaded".
  - Errors say what to do.

### Competitor note (Sejda)

Sejda uses one upload block on every tool. Once a file is in, it shows a one-row toolbar above the pages and puts the action in a full-width bar fixed to the bottom of the window (`berrypdf.md` → "Fit the first screen" → Why, and `00-today-vs-sejda.png`).

We match the single upload block. We differ on the action: it sits **top right, next to the title**, in the same spot on every tool and every state, including progress and errors. We copy no Sejda text, layout styling or assets.

## 1. Page types

| Type | Tools | Empty | Loaded ≥ 1024 | Loaded < 1024 |
|---|---|---|---|---|
| Page tools | Rotate, Delete, Extract, Split, Organize | picker card (§2) | top row with options inline (§3) | `h1` row + bottom dock |
| Multi-file tools | Merge, Combine & reorder, Alternate & mix | picker card | top row (§3) | `h1` row + bottom dock |
| Settings tools (future) | Compress, Protect, Unlock, Convert, OCR | picker card | top row + right options panel (§4) | `h1` row + bottom dock |
| Editor | Edit PDF (beta) | picker card + "Start with a blank page" | navbar + editor bar + strip + canvas (+ properties) (§5) | navbar + editor bar + canvas + today's tool dock |

## 2. Empty state: the picker card (decision 1)

### Layout

One component, `DropCard`, renders it on every tool. The editor uses it too. Its markup is unchanged: today's leaf-cornered white card, centred over the grid paper, with `Floaties set="empty"` and the blossom sticker.

The head is the centred `h1` (`ToolIntro`, 76px from 1024px). The editor's head also carries its "Beta" badge, through a `mark` prop on ToolIntro.

The area below the head is `--ip-work-h` tall from 1024px, and `100dvh − header − head − 16px` (at least 300px) below that. The card is centred in it, both ways.

What is **not** there:
- no options panel;
- no ControlDock (`[data-ip-dock]` is absent);
- no editor chrome.

The whole page is the drop target (DropOverlay, as today), and Ctrl/Cmd+V pastes a file.

### Card contents, top to bottom (minimal text)

| Line | Copy | Notes |
|---|---|---|
| Picker (berry, `lg`) + cloud caret | "Choose PDF" (one file) · "Choose files" (several files or images) · "Choose Word file" (and so on per file type, from the registry `accept`) | The F23 split button: Drive, Dropbox, OneDrive as today. Its label never changes while a file opens. |
| Hint | "or drop a PDF here" (one) · "or drop them here" (several) | muted 15px |
| Editor only | "Start with a blank page" | `Button variant="plain"` (blueberry tool ink), file icon. Its `title` is "A blank A4 page (Letter in the US and Canada)". |
| Limits | "PDF. Up to 20 files, 100 MB each." | `LimitsNote`. The full limits stay in the tooltip and in sr-only text. |
| Privacy | browser tools: "Your files stay on this device." · server tools: "Uploaded securely, deleted after 2 hours." | `PrivacyNote` reads `tool.runtime` |

### Opening a file

The picker keeps its label: "Opening…" is removed.

- **ToolFlow tools:** they go straight to the loaded layout with skeleton tiles (T4), as today's `loading` state does.
- **Editor:** the editor layout (§5) mounts at once. The strip and canvas show paper-tinted page placeholders (motion.md E1) while pdf.js opens the file, and Download is disabled until the first page is drawn.
- **Failures:**
  - A file that fails to open returns to the card, and the reason goes in NoticeStack.
  - A locked file opens the PasswordDialog over the placeholders.

### ACs

- **AC-600.**
  - Every tool route listed in the registry shows exactly one `[data-testid=drop-card]` in the empty state, the editor included.
  - The empty state has no `[data-ip-dock]`, no options panel and no editor chrome (`.ed-top`, `.ed-rail`, the strip, the dock).
  - Checked at 1280x632, 1366x657, 390x664 and 320x568.
- **AC-601.**
  - The picker's accessible name matches the copy above for the tool's file type and file count.
  - It is the first focusable control after the header's links.
  - It is fully inside the viewport, and not covered, at every viewport in the `berrypdf.md` checklist.
- **AC-602.**
  - The card holds, in this order: the picker with its cloud caret, the hint, the limits line and the privacy line.
  - The editor adds "Start with a blank page" after the hint, and nothing else differs.
  - With `NEXT_PUBLIC_CLOUD_SOURCES` off, the caret and the cloud row are absent and the card's height doesn't change by more than the row.
- **AC-603.** The privacy line reads "Your files stay on this device." for `runtime: "client"` tools and "Uploaded securely, deleted after 2 hours." for `runtime: "server"` tools. Unit test on `PrivacyNote`.
- **AC-604.**
  - Dropping a file anywhere on the page, or pasting one with Ctrl/Cmd+V while focus is not in a text field, loads it.
  - Tested on Delete, Merge and Edit PDF.
- **AC-605.**
  - The picker label never changes after a pick.
  - The editor shows its layout with page placeholders within one frame of the pick and enables Download only after the first page is drawn.
  - No element anywhere has the text "Opening…".
- **AC-606.** The editor's landing is built from `ToolIntro` and `DropCard`. `EditorTool.tsx` no longer contains its own `mp-empty` or `mp-dropcard` markup (unit grep test).
- **AC-607.** The Floaties stop within 5s (WCAG 2.2.2), are `aria-hidden`, and are hidden under forced colours. This is unchanged and asserted on the editor too.

## 3. Loaded layout C: page and multi-file tools (decision 2)

### Structure from 1024px

```
┌ navbar (72, sticky) ─────────────────────────────────────────────────────────┐
├ top row (64, sticky under the navbar) ───────────────────────────────────────┤
│ h1 │ options inline … [More options]  [Undo│Redo]   │ status   [ Primary ] │
│                                                      └──── action slot ────┘ │
├ stage (cream panel, --ip-stage-h) ───────────────────────────────────────────┤
│ tools row (64): view tabs · tool menus · size slider …………… Add files ▾       │
│ pages (data-ip-scroll="pages", PT-1 tiles, unchanged)                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**The top row** (`ToolRow`, new, in `components/tool-flow`):
- 64px tall. Its content spans the main column (`max-w-[1280px]`, so 1216px wide at 1280 **and** at 1366).
- `position: sticky; top: var(--ip-header-h)`.
- Its ground is the page's grid paper (`--ip-bg` with the grid at `background-attachment: fixed`, so the lines line up). It looks the same pinned or not: no shadow, border or box appears when it sticks (`berrypdf.md` → "Sticky surfaces").
- **h1:** the tool title, 24/28 Fredoka 600, `ink-black`, left, one line, never truncated. It is the same `h1` element as the empty state's centred head and switches on the frame the pages arrive, without animation (T5).
- **Options:** the tool's compact one-row form (the existing `dock-bar:` forms), after a 1px sand divider. A tool with no row options (Organize, Alternate & mix) renders no divider and no empty options box.
- **More options:** a `soft` button with an icon and the label "More options". It sits after the inline options and is present only when the tool has folded options (§3.4). It opens one popover (§3.3).
- **Undo│Redo:** where the tool has them (Organize, Merge, Combine), before the action slot.
- **Action slot** (`ActionSlot`, new, shared with the editor): right-aligned. It reserves a fixed box, **340px wide from 1280 and 300px from 1024 to 1279, 48px tall**. At rest it holds the status line (right-aligned, muted 14/18, one line, tooltip if it truncates) and the berry primary, 48px. In the other states it holds the progress pill, the error or the done tick (§6). The box never changes size, so nothing shifts.

**The stage:**
- The F1 cream panel, starting 8px under the row.
- Height `--ip-stage-h = max(320px, 100dvh − header − 64px − 16px)`.
- It holds the existing tools row and the pages scroller (`data-ip-scroll="pages"`, PT-1 tiles unchanged).
- The bottom bar is gone from 1024px, so `--ip-dock-actual` is no longer measured there. `berrypdf.md` rule 3's desktop exception goes, and the first loaded paint can't jump.

**Page scroll.** At ≥ 1024 the page scrolls only to reach the tool guide (`ToolSeo`) below the stage. The row stays pinned, so the primary stays in view.

### 3.1 Below 1024px (phones and tablet portrait)

- **The row keeps only the `h1`** (22/26 from 360px, 21/25 below 360; centred like the mockup; it may wrap to two lines). It is not sticky.
- Options, More options, Undo│Redo, the status and the primary go to the **bottom dock** exactly as today (`ControlDock layout="bar"`, F4/F5 P-3 rows). The dock clears the content through `--ip-dock-actual`, as today.
- Below 1024, `data-ip-dock` has the value `bar`; from 1024 the same element has `row`.
- There is one ControlDock element (no duplicates). DOM order is h1, options, status, primary, then the stage. On phones the fixed dock is therefore reached before the pages, as a toolbar would be.

| Width | Row | Dock |
|---|---|---|
| 320 | `h1` (21px, may wrap) | today's F4/F5 dock: the compact options row, then the primary (Undo│Redo beside it on Organize) |
| 390 | `h1` (22px) | same |
| 768 | `h1` | same (tablet portrait) |
| 1024–1279 | `h1` · options (tight forms, §3.4) · More options (44px icon button, tooltip "More options") · Undo│Redo (icons) · 300px slot | none |
| ≥ 1280 | `h1` · options (full forms) · More options (icon + label) · Undo│Redo (icons) · 340px slot | none |

### 3.2 Height budget (first screen)

| Viewport | Header | Row | Stage (tools row + pages) | Pages visible below the tools row | Today (bar layout) |
|---|---|---|---|---|---|
| 1280x632 | 72 | 64 | 480 | 416 | 332 |
| 1366x657 | 72 | 64 | 505 | 441 | 367 |
| 1536x730 | 72 | 64 | 578 | 514 | 440 |
| 1024x768 | 72 | 64 | 616 | 552 | 478 |
| 390x664 | 64 | ~52 | page scroll | 664 − 64 − 52 − 64 − dock (130 on F4, 78 on Organize) ≈ 354 / 406 | same minus the head |
| 320x568 | 64 | ~48 | page scroll | about 262 (one row of 117px pages) | – |

The primary is the row's bottom-right button, from 1024px. At 1366x657 its box runs from 80 to 128 (8px row padding), so it is on screen from the first loaded paint and stays there through every scroll.

### 3.3 More options popover

- **From 1024px:**
  - A non-modal popover anchored under its button and right-aligned to it. 360px wide, white, `rounded-panel`, `shadow-menu`.
  - Its body is `data-ip-scroll="overlay"`, capped at `100dvh − row bottom − 16px`. It is never a second scroller in the page.
  - Focus goes to the first control. Escape, a click outside or the button again closes it, and focus returns to the button.
  - Motion is S12/S13 popover timings (fade + y 4, 140ms `--ease-out`; exit 120ms `--ease-in`).
- **Below 1024px:** today's options sheet (`options-sheet`, S13).
- **Content:** the tool's `renderMore` plus whatever §3.4 folds at the current width. It reuses the `dock-side:` forms (numbered steps).

### 3.4 Per tool: what sits in the row and what folds (F4/F5 and Rotate move with no second redesign)

All widths are estimates from the mockup, to verify in the build.
- 1280x632 and 1366x657 have the **same row width** (the main column is 1216px at both), so one column covers both.
- Room for options at ≥ 1280 = 1216 − h1 − 340 (slot) − about 65 (gaps, divider).
- The forms are today's `dock-bar:` forms. Only their widths change, through the `dock-bar:` variant, which now matches `data-ip-dock="row"` and `"bar"`.

| Tool (h1 ≈ width) | Row at 1280x632 and 1366x657 | Behind More options at ≥ 1280 | Row change at 1024–1279 |
|---|---|---|---|
| Rotate (130) | "Apply to" All pages · Odd pages · Even pages pills (F1's form) · Rotate left │ Rotate right · Reset | none (no More options button) | pills icon + short label (All · Odd · Even) |
| Delete (210) | "Pages" range field (240) · Clear (shown when marked; its width reserved) | Remove bookmarks | field 190; More options icon-only |
| Extract (220) | Odd · Even · Custom pills · range field (220) | Remove bookmarks · File names | field 140; More options icon-only |
| Split (120) | mode pills Every page · Every N · Spreads · Custom · second slot: Every N stepper (130) **or** Custom range field (180) | Parts list (rename) · Remove bookmarks · File names | mode becomes a native Select "Split" (150); field 190 |
| Organize (160) | (no options) · Undo│Redo icons (labels dropped in the 27 Nov UI polish: one standard control on every tool) | none | Undo│Redo icons |
| Merge (125) | Contents page None · Names · Titles · Undo│Redo icons | Bookmarks · Page layout (footer, same width, padding) · Form fields · First file is a cover | Contents page folds; More options icon-only |
| Combine & reorder (350) | Undo│Redo icons | all Merge options (Contents page, Bookmarks, Page layout, Form fields, cover) | More options icon-only |
| Alternate & mix (245) | (none: settings live on each file card) | none | none |

The stage tools rows (view tabs, Select/Sort/Remove menus, size slider, Add ▾) are unchanged. That includes F4/F5 P-3's width table and the 640–1023 fixes. Merge's view tabs stay in the stage tools row, not in the top row as the mockup draws them (open question 2).

### ACs

- **AC-610.**
  - With a file loaded at ≥ 1024, `[data-ip-dock]` has `data-ip-dock="row"` and lives in the top row.
  - The `h1`, the options, the status (`dock-status`) and the primary (`primary-action`) all share one 64px row whose top is the header's bottom.
  - Checked at 1024x768, 1280x632, 1366x657 and 1920x969.
- **AC-611.**
  - The row stays pinned under the header after the page is scrolled to its end (the tool guide), at 1280x632 and 1366x657.
  - `primary-action` stays fully in view and not covered.
  - The row's computed `box-shadow` and `border` are the same pinned and at rest.
- **AC-612.**
  - Below 1024 the row holds only the `h1` (no focusable descendant).
  - `data-ip-dock="bar"`, and the dock is fixed to the bottom with today's F4/F5 P-3 content.
  - Checked at 320x568, 390x664 and 768x1024.
- **AC-613.**
  - From 1024 the stage's height equals `100dvh − header − 64 − 16` within 1px, and the pages area spans the main column's width.
  - No bottom bar is rendered at ≥ 1024, and `--ip-dock-actual` is not written at ≥ 1024.
- **AC-614.** For each tool, the row at 1280x632 and 1366x657 holds exactly the controls in §3.4's row column, and the More options popover holds the folded ones. At 1024x768 the "1024–1279" column applies. Checked by testid per tool.
- **AC-615.**
  - The row never wraps and never scrolls sideways (`scrollWidth === clientWidth`) for every tool at 1024, 1279, 1280, 1366 and 1920, in the ready state with the longest status the tool can show.
  - The `h1` is one line and not truncated.
- **AC-616.**
  - More options opens a popover (≥ 1024) or the sheet (< 1024).
  - Its body is the only scroller inside it (`data-ip-scroll="overlay"`) and it fits the viewport.
  - Escape and an outside click close it, and focus returns to the trigger.
  - Covered in `scroll-rules.spec.ts` and `modals.spec.ts`.
- **AC-617.**
  - Keyboard order at ≥ 1024: options (DOM order), More options, Undo, Redo, primary, then the stage tools row, then the pages.
  - The `h1` has `tabindex="-1"` (it takes programmatic focus only).
  - Visible focus: 3px `focus` ring.
- **AC-618.** The PT-1 tile metrics in `thumb-tiles.spec.ts` (page ≥ 90% of the tile, ≤ 8px edge, no control on a page below 1024) pass unchanged.
- **AC-619.** Every `dock-bar:` form renders unchanged in `data-ip-dock="row"` and `"bar"`. Unit test on the variant selector in `globals.css`: one selector covers both.

## 4. Settings tools: top row + side panel (decision 3)

This is for future tools: Compress, Protect, Unlock, Convert and OCR. It is specified now so they inherit it.

- **The row** is the same as §3 but has **no inline options**: `h1` · (space) · action slot (status, primary) top right. The primary is **never** in the panel.
- **The panel** sits to the right of the stage, 360px (`--ip-dock-w`), as tall as the stage. It is white, leaf-cornered and `shadow-card`, and holds the numbered option steps (`mp-step`, `dock-side:` forms). The stage takes the remaining width.
- The panel never scrolls inside itself. If its steps are taller than the stage, it grows and the page scrolls, while the sticky row keeps the primary in view.
- While working, the panel dims like the pages (§6).
- **Below 1024:** the `h1` row and the bottom dock (compact form + More options sheet + primary), as §3.1.
- **Empty state:** the picker card only (§2). This overrides owner rule 4's "options visible on arrival" for settings tools, by decision 1.

### ACs

- **AC-620.**
  - A tool registered with `layout: "settings"` renders the panel at ≥ 1024 with `data-ip-options="side"`.
  - The primary is in the top row's slot and nowhere inside the panel.
  - The slot's box (x, y, width, height) is identical to a page tool's at the same viewport.
- **AC-621.** The panel has no inner scroller. With steps taller than the stage, the page scrolls and `primary-action` stays in view (`viewport-fit.spec.ts` with a fixture settings tool).
- **AC-622.** Below 1024 the panel is not rendered. The dock holds the compact form, More options and the primary.
- **AC-623.** Until a settings tool ships, a test-only fixture tool (Compress options, client stub) exercises AC-620 to AC-622. It is excluded from the registry, the sitemap and production builds.

## 5. Editor E1 (decision 4)

### Layout from 1024px (`04-edit-pdf.png` E1, `06-editor-E1-*.png`)

```
┌ navbar (72, sticky) ───────────────────────────────────────────────────────────┐
├ editor bar (56) ───────────────────────────────────────────────────────────────┤
│ Edit PDF [Beta] │ report.pdf ▾      ⌕ T Aa ✎ ▦ ◉ 🔒 (tools, centred)   ↶ ↷  [Download] │
├ strip (132) ┬ canvas (pages scroller) ─────────────────────────┬ properties (280, on selection) ┤
```

- **Focus mode is removed.**
  - `.ed-shell` is no longer `position: fixed; inset: 0`. The editor sits in the page under the sticky navbar and fills `100dvh − header`, and the rest of the page is no longer inert.
  - The site footer is not rendered while a document is open, so the page itself does not scroll.
- **Editor bar** (`ed-top`, 56px, white, sand hairline at the bottom):
  - `h1` "Edit PDF" 20px + Beta badge, then the file-name menu (today's `file-menu`);
  - the tools, centred: today's ToolRail buttons move here, and overflow goes to today's "More tools";
  - Undo│Redo;
  - **Download in the action slot**: `ActionSlot`, 220px reserved box, no status line.
  - The berry mark is not repeated: the navbar carries it.
- **Left:** the page strip, 132px, the existing SidePanel thumbnails, `data-ip-scroll="rail"`, always shown at ≥ 1024. ToolRail is removed.
- **Right:** the properties panel (280px).
  - It shows only while an object is selected, or a tool with options is active (open question 3). Today's top-slot `ToolOptions` and the selection controls move into it.
  - Opening it narrows the canvas column. The page keeps its zoom, and the canvas adjusts its scroll so the selected object does not move on screen.
- **Phones (< 1024):** the navbar, then the editor bar (`h1`, file menu, Download in its slot), then the canvas, then today's bottom tool dock and context strip, unchanged.
- **Leaving the editor:** with edits not yet downloaded, a navbar link opens today's "Close without downloading?" dialog (in-app links), and `beforeunload` covers the rest.

### ACs

- **AC-624.** With a document open, the site header (`banner`) is visible and usable at 1280x632 and 390x664. No ancestor of the editor is `position: fixed`, and `main` has no `inert`.
- **AC-625.**
  - At ≥ 1024 the editor bar shows, left to right: `h1` "Edit PDF" with the Beta badge, the file menu, the tool buttons, Undo, Redo and Download.
  - `.ed-rail` is absent.
  - Below 1024 the bar shows the `h1`, the file menu and Download, and today's `ed-dock` stays.
- **AC-626.** The page strip is visible at ≥ 1024 on open, at every width from 1024 (the 1600px default and the `PANEL_KEY` toggle go). It is the only `rail` region, and it sits beside the canvas, never inside it.
- **AC-627.**
  - The properties panel is absent with nothing selected and the select tool active.
  - Selecting an object shows it within one frame, and the selected object's screen position changes by ≤ 1px.
  - Deselecting hides it.
- **AC-628.** At 1280x632 the canvas is at least `632 − 72 − 56` = 504px tall. At 390x664 the canvas is at least 664 − 64 − 56 − the dock tall.
- **AC-629.** Clicking a navbar link with edits not downloaded opens the leave dialog. "Download anyway" downloads and then navigates; Cancel stays. A link clicked with no pending edits navigates at once.
- **AC-630.** The editor's 1280x632 first-load JS budget (`editor-js-budget.spec.ts`) does not grow by more than 2 kB gzip.
- **AC-631.** The existing editor e2e suites (`e2e/f16`, `e2e/f24`) pass, after only selector updates for the removed rail, the moved options and the removed toast (listed in §9).

## 6. One progress pattern: the action pill (decision 5)

### The pill

`ProgressPill`, inside `ActionSlot`, takes the slot's whole box:
- the row slot, 340 or 300 × 48 from 1024;
- the full-width dock row below 1024;
- the editor's 220px slot.

```
[◠ spinner 20]  Deleting… 42%                    [Cancel]
                small second line (server phases)
░░░░░░░░░░░░░ the fill rises through the pill, 3px berry edge ░░░
```

**Contents:**
- A 20px ring spinner: `brand` arc on a `brand-tint` track, rotating 900ms linear.
- The label `<progressLabel>… <n>%`: 16px 600 ink, tabular numbers, from the registry `progressLabel` ("Deleting", "Merging", "Mixing"…).
- Cancel: a quiet text button (no ground; a 10% berry tint on hover), muted 15px text, 40px tall, 44px hit area.
- The fill (`ProgressBar`, owner polish 2026-11-27): the pill keeps the primary's corners with a pale berry edge; a pale berry fill (14% `brand`) with a 3px `brand` bottom edge rises through the whole pill behind the text, `transform: scaleX()` from the left, so the button itself fills up.

**Morph.** On click, the slot's rest content (status + primary) fades out over 120ms (`--motion-micro`, `--ease-in`, inert at once) and the pill fades in over 120ms (`--ease-out`). The slot box never changes size.
- The pill shows on the click, with no 300ms delay: the button itself is what changes. This closes T11's deferred part.
- Once shown, the pill stays at least 400ms (`MIN_PROCESSING_MS`).

**While working:**
- The options and the pages (and the settings panel) go to opacity 0.45 over 120ms and become `inert`.
- The navbar stays live, and leaving mid-job opens LeaveGuard.
- The jam fill tweens 200ms `--ease-out` per update and never runs backwards.

**Server phases, same pill.** Each phase is set by the job API.

| Phase (`data-progress`) | Lead | Label | Second line (muted 13px) | Bar |
|---|---|---|---|---|
| `upload` | spinner | "Uploading… 42%" | "Keep this tab open." | determinate |
| `queue` | "#25" (26px 700 `brand`, tabular) in place of the spinner | "in line" | "About 2 min. Keep this tab open." Shown only when the server returns an estimate; otherwise "Keep this tab open." | indeterminate glide: a 22% segment, `translateX` loop 1.6s linear |
| `work` | spinner | "Converting… 60%" (tool verb) | – | determinate, or glide when the server sends no fraction |
| `done` | leaf tick (pops 200ms `--ease-pop`) | "Done" | – | hidden |

The browser tools use only `work`, then `done`.

**Done.** The tick holds for 400ms, then the result swap (§7, T12) starts. `data-state` stays `processing` until the result commits, then turns `done`.

**Cancel.** Cancel really stops the work:
- **ToolFlow:** it calls `abort.current.abort()`. `runInWorker` rejects and terminates the worker; the next run spawns a fresh one.
- **Editor download:** `buildInWorker` gains `{ signal }`. On abort it rejects and calls `disposeBuild()`, then `warmBuild()` on idle.
- **Server jobs:** it calls `DELETE /jobs/{id}`, which removes the job from the queue, stops the worker task and deletes the upload. The client stops polling at once.
- **Server phases are a UI contract only in this PR** (PM, 26 Nov). No job API exists yet. The pill's upload, queue, work and error phases and Cancel's `DELETE` are built against a typed client interface and tested with Playwright route mocks. `DELETE /jobs/{id}` (dequeue, stop, delete the upload) is a **requirement on the backend** for the first server tool, not code in this PR.

**After Cancel:**
- The slot returns to its rest content, pages un-dim and focus returns to the primary.
- The live region says "Cancelled".
- NoticeStack shows "Cancelled. Your file is unchanged." (browser) or "Cancelled. Your upload was deleted." (server, once `DELETE` returns 2xx).
- If `DELETE` fails, the notice reads "Cancelled. Your upload will be deleted within 2 hours." That is honest under CLAUDE.md rule 5.

Cancel is hidden during `done`.

**Errors.** The slot's box holds the error:
- a 20px danger icon and a short line in `danger` 15px 500, for example "This PDF is damaged.";
- a fix action when one exists, a `line` button with the fixing tool's name (for example "Repair PDF"), shown only when that tool is `ready` in the registry and it hands the file over;
- "Try again" (berry) in the primary's place.
- "Start over" is not added to the slot, which has no room. It stays reachable from the pages tools row (its existing ✕ / Remove all).
- Longer text (the full reason and its fix) goes to NoticeStack (danger), never into the row.
- Copy says how to fix. Examples:
  - "This PDF is damaged. Repair it, then try again."
  - "Server tools are paused until tomorrow. Browser tools still work."
  - "You've reached today's limit for this tool. Try again tomorrow."
- `data-state="error"`. Focus moves to "Try again" (`process-error` keeps its testid).

**Screen readers.**
- The pill is a `role="group"` labelled by the tool action ("Delete pages progress"). It holds a `role="progressbar"`:
  - with `aria-valuenow` and `aria-valuetext="42%"` when determinate;
  - with `aria-valuetext` "25th in line, about 2 minutes" in the queue;
  - with only `aria-label` when indeterminate.
- The pill takes focus on start (`tabindex="-1"`, as today); Tab reaches Cancel; Escape on the pill cancels.
- The polite live region (`LiveRegion`) announces:
  - the start ("Deleting pages");
  - each phase change;
  - progress at most every 10s and only at the 25 / 50 / 75% marks;
  - the queue position at most every 30s, plus when it reaches 1;
  - "Done", errors (assertive) and "Cancelled".
- The throttle is a pure function, `throttleAnnouncement`.

**Reduced motion:**
- the spinner does not rotate: it pulses opacity 0.4 ↔ 1 over 1.6s (deviation 7, F1 U-4);
- the glide stops and shows a static 30% segment;
- the fill jumps to each value;
- the morph and the dim are instant;
- the tick does not pop.

**Removed:**
- the berry loader overlay (`ToolFlow.tsx:1074-1087`, `processing-loader`);
- `Button busy` on the editor's Download (`Chrome.tsx:303`); `busy` stays only for small inline actions such as the password dialog's Unlock;
- the editor's "Downloaded · … · 0 B uploaded" toast;
- the "Opening…" label;
- ProcessError's notice and its two large buttons in the dock (`ControlDock.tsx:258-275`).

### ACs

- **AC-632.**
  - On a primary click, `[data-testid=processing]` appears inside `ActionSlot`.
  - The slot's bounding box before the click, during the job, in error and in done is identical within 0.5px.
  - Layout Shift entries during the run total 0.
  - Checked at 1366x657 and 390x664 on Delete, Merge and Edit PDF.
- **AC-633.**
  - During `processing`, the options container, the pages area and (on settings tools) the panel have `inert` and computed opacity 0.45.
  - The navbar is not inert.
  - No element with `data-testid="processing-loader"` or class `mp-loading` exists.
- **AC-634.** The label reads `<progressLabel>… <n>%`. The jam fill's `transform` is a `scaleX` matching n/100 within 0.01 and never decreases during a run.
- **AC-635.**
  - Cancel during a browser job:
    - the slot returns to rest within 300ms and `data-state` becomes `ready`;
    - no download starts;
    - the processing worker is terminated (the test hook `window.__ipWorkers` counts live `Worker`s and is present only in test builds);
    - a second run completes normally.
  - Uses a slow fixture: a 300-page PDF on Split, Every page.
  - Unit: `runInWorker` with a fake Worker calls `terminate()` on abort.
- **AC-636.**
  - Cancel during the editor's download:
    - no `download` event fires;
    - edits and undo history are unchanged;
    - the build worker is disposed;
    - the next Download succeeds.
  - Unit: `buildInWorker` rejects with `AbortError` and calls `terminate()` on abort.
- **AC-637.**
  - Server phases, using a Playwright route mock of the job API: upload 0→100%, queue 25→3→1, then work, then done.
  - `data-progress` steps through `upload`, `queue`, `work`, `done`.
  - The queue lead shows "#25". "About 2 min" appears only when the mock sends an estimate, and the second line is otherwise "Keep this tab open.".
  - Cancel in the queue sends one `DELETE /jobs/{id}` and shows "Cancelled. Your upload was deleted.". With a 500 response it shows "Cancelled. Your upload will be deleted within 2 hours.".
- **AC-638.**
  - Errors: a damaged-file fixture on Delete puts the danger line and "Try again" in the slot, with focus on "Try again", and `data-state="error"`.
  - "Repair PDF" shows only when a `repair-pdf` tool is `ready` (mocked registry in a unit test).
  - The full message is in NoticeStack.
  - The slot box is unchanged (AC-632).
- **AC-639.** The done tick shows "Done" for at least 400ms before `data-state` becomes `done`. Total time from the job finishing to `result` visible ≤ 900ms (400 tick + 120 exit + 320 enter + slack).
- **AC-640.**
  - Accessibility:
    - the progressbar has the right `aria-valuenow` / `aria-valuetext` per phase;
    - focus is on the pill when a run starts;
    - Escape on the pill cancels.
  - Unit test `throttleAnnouncement`: at most one progress message per 10s and only at 25/50/75; queue at most one per 30s plus position 1; phase changes always.
- **AC-641.**
  - Reduced motion (`emulateMedia({ reducedMotion: "reduce" })`): the spinner's computed animation is the opacity pulse, not rotation, and the glide is not running.
  - No other animation on the page is running 5s after start (motion.md guard 7).
- **AC-642.** Contrast, measured on the build:
  - pill label ink on white ≥ 12:1;
  - second line muted on white 5.45:1;
  - Cancel muted on band 4.97:1;
  - "#25" brand on white 4.78:1;
  - danger line 7.89:1;
  - the jam fill on brand-tint ≥ 3:1 (non-text).
  - The axe gate passes in every pill state.
- **AC-643.** Under forced colours, the pill keeps a 1px `ButtonText` border and the jam fill draws in `Highlight`.

## 7. One result pattern (decision 6)

### Page, multi-file and settings tools

The stage becomes the result. It is T12: the work area fades out 120ms `--ease-in` (inert at once), and the result enters over 320ms `--ease-out` (y +8, scale 0.98, fade), with the tick popping 200ms `--ease-pop`, 80ms in.

The top row stays, holding the `h1` and the action slot. Its options are hidden. From 1024 the slot holds **Download** (berry) with the **Save to Drive** split beside it, in the exact box where the primary and the pill were (owner, 26 Nov: "standardisation"; the button you pressed becomes the button you download with).

**From 1024, inside the stage panel:**
- **Left:** the output preview, **at least 85% of the stage's height**, at the page's aspect. It is drawn at the device pixel ratio (≤ 3) with a hairline edge. It replaces the 200–240px `mp-tray`; `.mp-tray` is retired.
- **Right:** an info column, max 420px, vertically centred:
  1. leaf tick + "Your PDF is ready" ("Your files are ready" for a ZIP), 22px 600;
  2. the name (17px 600, `result-name`) and meta: "5 pages, 21 KB. 3 pages deleted.";
  3. (from 1024 Download and Save to Drive are in the row's slot, not here; below 1024 they are in the dock);
  4. the privacy line, as `PrivacyNote context="result"`: browser tools "Done on this device. Never uploaded."; server tools "Deleted from our server in 2 hours.";
  5. "Keep going with this file" + chips (today's continue targets);
  6. "Back to editing" (renamed from "Back to options") and "Start over", quiet.
- **ZIP outputs (Split, several inputs on Extract or Delete):**
  - the preview shows the first part's first page with a quiet "1 / n files" counter;
  - the F4/F5 P-13 entry list (up to 4 rows, then "Show all n") sits between items 2 and 3;
  - the continue chips stay hidden for a ZIP (F1 AC-43 adapted).

**Below 1024:**
- The preview fills the stage's width up to `55dvh` tall.
- The info column stacks under it, without items 3 and 4's buttons.
- **Download + "Drive"** sit in the bottom dock, in the primary's place: Download is flex and berry, Drive is a 48px `line` button.

### Editor

The document stays open.
- Download runs the pill in its slot: "Downloading… 60%" with Cancel.
- When done, the file downloads and the slot shows the berry button with a white tick and the label **"Downloaded"** for 2.4s, then "Download" again (T13, label variant). It stays enabled.
- A small card (`role="region"`, `aria-label="Download"`) opens under the slot, right-aligned, 320px:
  - "report.pdf, 32 KB";
  - muted "Done on this device.";
  - when the output lost its password, the existing `no-password-note` line;
  - when required form fields are empty, "2 required fields are empty.";
  - Keep going chips (Compress, Sign, Merge), which hand the downloaded bytes over like ResultCard's continue targets;
  - a × close.
- The card closes on ×, on Escape, or on the next edit. It never takes focus: focus stays on Download, and the live region says "Downloaded report.pdf".
- Errors use §6's error form in the slot: "Couldn't make the PDF. Your edits are safe." + "Try again".

### ACs

- **AC-644.** After a run on Delete at 1366x657:
  - `[data-testid=result]` fills the stage;
  - the preview canvas is ≥ 85% of the stage's height;
  - "Your PDF is ready", the name, the meta, Download, Save to Drive (flag on), the privacy line, the chips, "Back to editing" and "Start over" are all inside the viewport without scrolling.
- **AC-645.** Below 1024 (390x664 and 320x568):
  - Download is in the bottom dock at the primary's former box, fully visible and not covered, and it has focus after the swap;
  - no second Download exists in the stage;
  - the preview is as wide as the stage (within 2px) and ≤ 55dvh tall.
- **AC-646.** From 1024, exactly one Download control (`save-main`) exists in the result. It sits in the top row's action slot, in the primary's former box (same rect within 1px), with Save to Drive beside it when the flag is on, and it has focus after the swap. The row shows no options.
- **AC-647.** Download is clickable on the result's first frame (motion.md rule 2): a click within 50ms of `data-state="done"` downloads.
- **AC-648.** "Back to editing" restores the loaded layout with options, selection and marks intact, and focuses the `h1`. "Start over" returns to the picker card (§2) and focuses the picker.
- **AC-649.** ZIP: Split with 3 parts shows "Your files are ready", "1 / 3 files", the entry list and per-entry downloads (F4/F5 AC unchanged), and no continue chips.
- **AC-650.** Editor download:
  - the slot runs the pill, then shows "Downloaded" with a tick for 2.4s (± 200ms), then "Download";
  - the card shows the name and size, the privacy line, the notes that apply and three chips;
  - Escape and the next edit close it;
  - no `.ed-toast` with "Downloaded" text appears;
  - `no-password-note` keeps its testid and text.
- **AC-651.** Editor Keep going: the "Compress" chip opens `/compress-pdf` (or the tool's coming-soon page while it is planned) with the downloaded file handed over (ready tools) or not (planned tools). The editor's leave guard does not fire, because the edits were downloaded.

## 8. States and attributes: today → new (keep the e2e hooks stable)

| ToolFlow state (`[data-testid=tool-flow][data-state]`) | Today | New | Attribute / testid changes |
|---|---|---|---|
| `empty` | drop card + side panel or empty bar; disabled primary | picker card only | `data-state="empty"` kept. `[data-ip-dock]`, `primary-action` and `dock-status` are **absent** (today present). `drop-card` kept. `tool-intro` kept (centred head). |
| `loading` | skeleton cards, bar | top row (options disabled, status "Reading files…", primary disabled) + skeleton tiles | `data-ip-dock="row"` (≥ 1024) or `"bar"` (< 1024). Today it is `"bar"` at every width once loaded. |
| `password` | dialog over the work area | same | none |
| `ready` | pages + bottom bar | pages + top row (≥ 1024) or dock (< 1024) | `data-ip-dock` as above. `primary-action`, `dock-status`, `dock-options`, `options-button` (the More options trigger) and `pages-scroll` kept. `options-sheet` kept below 1024; new `options-popover` at ≥ 1024. |
| `processing` | jam bar in the dock + berry overlay | pill in the slot | `data-state="processing"` and the `processing` testid (now the pill) kept. New `data-progress="upload/queue/work/done"` on the pill. `processing-loader` removed. |
| `error` | notice + two buttons in the dock | danger line + fix + "Try again" in the slot; notice in NoticeStack | `data-state="error"` and `process-error` kept. |
| `done` | ResultCard replacing the work area | the stage becomes the result | `data-state="done"`, `result`, `result-name`, `save-main` kept. |
| (new) cancelled | – | back to `ready`, notice | no new state value. Announced "Cancelled". |

| Editor (`[data-testid=editor][data-state]`) | Today | New |
|---|---|---|
| `empty` | own landing | `DropCard` (same `drop-card` testid) |
| `opening` | "Opening…" on the picker | editor layout with placeholders. `data-state="opening"` kept. |
| `open` | fixed focus mode, rail, toast | E1 layout. `editor-shell` kept (no longer fixed). `.ed-top` kept as the editor bar. `.ed-rail` removed. New `editor-strip` (`rail`) and `editor-props`. |

- **AC-652.** `e2e/support/flow.ts` helpers (`primary`, the waits on `data-state` `ready`, `done` and `empty`) work unchanged. A grep test confirms no testid in the "kept" cells above was renamed in `src/`.
- **AC-653.** `ControlDock` accepts `layout: "row" | "bar" | "side"`, and `emptyLayout` is removed from `ToolFlow` (Organize and Alternate drop the prop). Typecheck proves no caller passes it.

## 9. Design-doc and test changes (same PR)

### `docs/design/berrypdf.md`

- **Owner overrides 1** ("Processing keeps the jam bar … and the berry loader"): the berry loader leaves processing. The jam bar lives in the action pill.
- **Owner overrides 3** (motion): "the drop card and the result panel pop in with the small overshoot": the result follows T12 (no overshoot).
- **Owner overrides 4 / "Fit the first screen":**
  - Rule 1: at ≥ 1024 the primary is in the top row, sticky under the header. In the empty state the primary is the picker.
  - Rule 2: the budget is header + head 76 (empty) or row 64 (loaded) + `--ip-stage-h` + 16.
  - Rule 3: drop the desktop `--ip-dock-actual` exception.
  - Rule 5: the options run in the row plus the More options popover.
  - Rule 6: rewrite it ("options fold into the top row", not the bottom bar).
  - Rule 7: the picker card is centred in `--ip-work-h`, and there is no panel.
  - Rule 9: phones are unchanged.
  - Rule 10: the editor is E1.
  - The checklist sentence: "once loaded, the options are in the bottom bar" becomes "in the top row (≥ 1024) or the dock (< 1024)".
- **Components → Working mode (Rotate):** rewrite it for layout C. Remove the empty side panel, the "folding into the bottom bar", the berry loader and the "one centred Panel" result.
- **Components → the dock bar** text in Working mode and in Fit rule 6: the bar exists only below 1024.
- **Motifs → Feedback:** drop the berry loader from processing. It stays a brand asset with no current use on tool pages.
- **Scrolling:**
  - Rule 2 `pages`: "so its tools row and the top row stay put";
  - `rail`: the editor's page strip;
  - `overlay`: add the More options popover.
- **Sticky surfaces:** add the top row (grid-paper ground, no stuck-only box).
- **Page tiles:** `.mp-tray` is retired from the result as well.
- **Deviations:** none new.

### `docs/design/motion.md`

- §4 rule 5: the only loops are the pill's spinner and glide while work runs, plus the busy pulse. Not the berry loader.
- T5: the options appear in the top row; the `h1` moves from the centred head to the row's left on the frame the pages arrive, without animation.
- T11: replaced by §6's pill (morph 120 + 120ms, show at once, ≥ 400ms, fill 200ms `--ease-out`, glide 1.6s, done tick 200ms `--ease-pop` held 400ms). Delete the deferred "300ms wait".
- T12: the stage swap and the larger preview; "Back to options" becomes "Back to editing".
- T13: the editor variant's label changes to "Downloaded" for 2.4s.
- E1: the editor opens in the page, not as an overlay fade.
- E6: the tools are in the editor bar, not a rail.
- E8: the download toast is gone.
- §6 Sejda table, Progress and Result rows: update.

### Other specs to note (no edits in this PR beyond the two design docs)

- F1 U-3/U-6 (layout, states);
- F4/F5 P-3 (empty side panel, bar rows, ResultCard well);
- F16 U-E2 (focus mode).

Each gets a one-line "superseded by F25 §n" note when this merges.

### Tests to add

- `e2e/ui/tool-layout.spec.ts`: AC-600–602, 605, 610–615 and 644–646 for every registry tool at the checklist viewports. It saves the §10 screenshots.
- `e2e/ui/cancel.spec.ts`: AC-635 and 636.
- `e2e/ui/progress-pill.spec.ts`: AC-632–634, 637–641 (job API route mock, reduced motion).
- `e2e/f16/editor-layout.spec.ts`: AC-624–629 and 650–651.
- Unit:
  - `throttleAnnouncement`;
  - `ProgressPill` phases and ARIA;
  - `runInWorker` and `buildInWorker` abort → `terminate`;
  - `PrivacyNote` runtime copy;
  - the `dock-bar:` variant selector;
  - the grep tests in AC-606 and AC-652.

### Tests to update

- `e2e/ui/viewport-fit.spec.ts`:
  - empty: assert the picker instead of `primary-action`, `dock-status` and the panel scroll;
  - loaded ≥ 1024: expect `data-ip-dock="row"` and options in the row or `options-button`, and drop the bottom-bar checks;
  - result: Download in the dock below 1024.
- `e2e/ui/scroll-rules.spec.ts`: there is no empty panel; add the popover, the editor strip and the canvas; the settings fixture.
- `e2e/ui/motion.spec.ts`: test 10 ("Back to options" → "Back to editing"); assert there is no berry overlay; the progress focus trail stays `processing`.
- `e2e/ui/thumb-tiles.spec.ts`: no change expected (AC-618). Re-run.
- `e2e/ui/modals.spec.ts`: add the popover.
- `e2e/ui/result-scroll.spec.ts`: the new result fits.
- Picker labels ("Choose PDF file", "Choose PDF files", "Open PDF", "Blank page"): `e2e/f1/intake`, `access`, `result`; `e2e/f3/support`, `pages`, `edge`, `output-ui`, `eval-gaps`; `e2e/f5/organize`, `fidelity`; `e2e/f23/pick`, `editor`, `flag-off`; `e2e/f16/editor-beta`, `editor-e1`.
- `e2e/f16/editor-e1.spec.ts:335` (`.ed-rail`) and the tests that read the download toast.
- `e2e/f1/rotate.spec.ts:161` (processing state read) keeps working; verify.

- **AC-654.** CI runs every test listed above. `pnpm lint && pnpm typecheck && pnpm test` and `pnpm e2e --trace off` are green.
- **AC-655.** `berrypdf.md` and `motion.md` carry the changes listed in §9 in the same PR. The design-doc lint (links, headings) passes.

## 10. Screenshots (required in the PR)

The mockups exist at 1280 and 390 (`mockups/02-picker-B2-*`, `03-layout-C-*`, `04-layout-C-merge-1280`, `06-editor-E1-*`, `07-progress-A-*`, `08-result-*`, `09-editor-*`, `10-C-*`, `11-CP-*`).

The builder captures **build** screenshots at **1280x632, 1366x657, 390x664 and 320x568** for every state below (the visual gate is 1280/390/320; at 320 check the 2-line `h1` plus the dock). They go in `docs/specs/assets/f25/` and in the PR body:
- empty;
- loading;
- ready;
- More options open;
- working;
- uploading, queue and error (route mock);
- done;
- result;
- cancelled.

The tools are Delete, Split, Merge, Alternate, the settings fixture and Edit PDF (empty, open, selection, downloading, downloaded).

- **AC-656.** All of the screenshots above exist. Each one shows the primary (or Download) fully on screen.

## 11. Rollout

- **One PR, full review tier:** ToolFlow, ControlDock, ActionSlot/ProgressPill, ResultCard, DropCard, the editor shell and chrome, the two design docs, and the tests.
- **No feature flag:** the layout is site-wide, and a half-migrated site would itself break the standard.
- **AC-657.** No route keeps the old layout: `emptyLayout`, `ProcessingBar`'s dock usage, `processing-loader` and the editor's `position: fixed` shell are gone (grep test).
- **AC-658.** Lighthouse CLS on `/delete-pdf-pages` and `/edit-pdf`, through load → pick → run → result, stays at 0.00 (the existing CWV check, extended to these flows).
- **AC-659.** The evaluator's micro-comparison (mission.md) is re-run on Delete, Merge and Edit PDF after deploy to staging, with no lost check, **and the editor's E1 P0 ACs are re-checked on /edit-pdf**. The verdict is recorded in `docs/evals/f25-tool-layout-standard.md`.
- **Editor guard (PM, 26 Nov).** Un-fixing the editor shell touches the top-priority editor. In this PR the whole editor e2e suite stays green with no test weakened, and `editor-js-budget` and the first-load budgets hold.

## 12. Questions, resolved in the thread (26 Nov)

The PM agreed the spec on 26 Nov (Q1 to Q4 as resolved below, Q5 changed). Resolved by the thread with the owner's standardisation rule; the owner can override any of them at the screenshot review.


1. **Result, ≥ 1024: where does Download sit?**
   - Decision 6 puts Download and Save to Drive in the result's info column.
   - Board 06's caption says "Download in the same top-right spot".
   - **Resolved:** Download and Save to Drive take the row's action slot from 1024 (the primary's spot), matching board 06 and the owner's standardisation rule. The info column keeps the preview, name, meta, privacy line, chips, Back to editing and Start over. There is still only one Download.
2. **Merge's Files│Pages tabs:** the mockup puts them in the top row. This spec keeps them in the stage tools row, where every tool has its view tabs today and `thumb-tiles.spec.ts` measures them. Moving them is a small follow-up if wanted.
3. **Editor properties panel:** decision 4 says "only when something is selected". This spec also opens it for an active tool with options (text, draw, shapes before placing), because those options lived in today's top slot. The alternative is a popover under the tool button.
4. **Editor progress verb:** the mockup reads "Saving… 60%". This spec uses "Downloading… 60%", so the button keeps its name ("Download" → "Downloading" → "Downloaded") and it isn't confused with the device autosave chip's "Saving…".
5. **"Start over" on error:** the slot has no room for it. **Resolved (PM):** the NoticeStack error notice carries a "Start over" action (the pages tools row keeps Remove all / ✕ too).

## 13. Eval run 1 follow-ups (27 Nov, build notes)

Changes made in the build for `docs/evals/f25-tool-layout-standard.md` run 1 (G-1 to G-16). Where they refine a section above, this list is the current behaviour.

- **G-1, editor navbar (behind a switch).** At rest both bars show (navbar 72, editor bar 56). From 1024px wide and 601px tall, scrolling the pages down slides the navbar up out of view, and the editor bar, page strip, properties card and hints move up with it. The navbar comes back only on a deliberate move (eval run 2, R2-1: a small scroll up used to bring it back, dropping the pages to 78–80%): a scroll back into the top 48px, a long scroll up (one run up of at least the canvas's height or 400px, whichever is more; any move down starts the count again from there), the pointer resting in the top 8px for 350ms (a pointer passing through on its way to the editor bar's buttons doesn't bring it), or focus entering it. A small scroll up, to reread a line, leaves it away and the pages their ≥ 88%. It never hides while its All tools menu is open or while keyboard focus (`:focus-visible`) is in it; focus a click left there doesn't keep it. The canvas's `scroll-padding-top` equals the bars on screen, and go to page, reveal and "centre of what's visible" measure from the real visible top (`visibleTop`, `navHiddenAt` in nav-autohide.ts), so a page lands right under the editor bar with the navbar away. The page strip's box ends at the window's bottom at rest and with the navbar away; it grows as the navbar starts to leave and shrinks only after it is back (`data-ed-box`), so while it slides the box only runs past the clipped bottom: no gap, and its scroll bar and drag auto-scroll zone are on screen at rest. Only transforms move, so nothing is a layout shift. With reduced motion it moves without a transition. Phones keep the navbar. `NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE=0` builds it off (`src/tools/editor/nav-autohide.ts`). The canvas runs up behind the navbar, which covers it at rest.
- **G-8.** The parts a loaded tool needs, pdf.js's chunk among them, are fetched on intent (pointer, key, focus or drag), with the files, or after 4s. pdf.js's two workers are warmed on a real sign of intent only, never on the 4s timer, and not with Data Saver on or on 2g (`lib/pdf/pdfjs-warm-intent.ts`): with the files the pick creates them itself, and a warm fetch racing that would download them twice.
- **G-1, page header row.** The page number and page actions (F16 AC-55) float over the page's top edge instead of a reserved 32px row, and pages are 12px apart from 1024. The actions show, and take the pointer, only while the pointer is in the page's top 48px band (`.ed-slot[data-head]`) or focus is in them, and the pointer only with Select or Edit text; lower on the page, what is under them is the page's. The band follows the pages as they scroll under a still pointer. With a drawing tool armed they stay reachable by Tab. The current page keeps its number chip.
- **G-5, opening.** The opening frame shows the editor's layout with paper-tinted placeholders (strip thumbnails and the first page at fit width, in A4 or Letter by locale) and no spinner. A locked file's password dialog opens over that frame. Download and the Save as caret stay disabled until the first page is painted. The opening frame's bar lines up with the editor's (16px from 1024; the narrow bar's 8px, 18px title and no Beta below 640), so the h1 and file name don't move when the editor takes over (R2-7). A Ctrl+S pressed before is kept ("Download starts in a moment") and runs on that paint, or after 8s if no page ever settles, when Download is given back anyway. While the password dialog waits, the frame is not busy and nothing says "Opening…".
- **G-9, properties card.** It stays a floating card, and it never covers the selection. It first moves to the canvas's left. When both sides would cover the selection, it sits below the selection or ends above it, with a shorter max height. It is placed again as the selection moves and as the pages scroll or zoom. Moves are transforms, and they are instant, so the card never passes over the selection on its way.
- **R2-3, Download on a phone.** Below 1024 the editor bar's Download is 132px from 360 and its icon (48px) below, so the bar fits 320. While it runs, the pill lies over Undo│Redo too (216px from the bar's right; they are off while it runs), with Cancel as a 40px × named Cancel, so "Downloading…" shows whole at 390 and 320. Below 360 it also lies over the file menu, which is hidden from Tab meanwhile. Nothing in the bar moves.
- **G-10.** With a drawing tool still armed and its new object selected, the tool's kind switch (Shape, Mark, Pen or marker) stays above the selection's controls.
- **G-3.** Download sits in the primary's exact box on every build. Save to Drive is a 48px `line` icon button beside it, named "Save to …". After a pick from a cloud, one press saves there, and a 28px caret joined to the icon ("Save to another cloud", `save-caret`) lists the other clouds. With no cloud pick, the icon is "Save to…" and opens the menu. `save-main` is Download, and `save-cloud` is the cloud icon.
- **G-6, §3.4 rows.** The rows now follow §3.4:
  - Merge's row carries Contents page (None · Names · Titles) from 1280; at 1024–1279 it lives in More options.
  - Split's mode is a native Select "Split" at 1024–1279.
  - More options shows its label from 1280. To make room, the range fields take §3.4's widths at 1280–1439 (Delete 240, Extract 220, Split 180) and 300 from 1440, where the row is wider (G-14).
  - Undo│Redo are icons at 1024–1279 on Organize, and at every width on Merge and Combine.
  - Rotate keeps F1's form (PM, 27 Nov): "Apply to" All pages · Odd pages · Even pages, then Rotate left │ Rotate right and Reset. The §3.4 line now says so. At 1024–1279 the pills show their short labels (All · Odd · Even) in the row, since three whole long labels don't fit there; from 1280 they show the long ones. Checked at 1024, 1280 and 1366 (tool-layout.spec AC-614 G-6).
- **G-14.** From 1440px, once a file is in, the top row and the stage widen past the 1280 column, up to 1856px with 32px gutters. The tool guide keeps the column. AC-613's "spans the main column's width" applies below 1440.
- **G-13.** While the work runs, the pages hold still: they are not re-rendered on each progress tick, and the dimmed area hides the tile buttons through CSS. The pill paints before the work starts. The pages area dims and goes inert one frame after the pill's first paint (the options at once): making hundreds of tiles inert restyles each of them, which must not hold the pill. From the click until then, the pages area swallows pointer input in the capture phase, so a tile click in that frame never changes the job that started. On Cancel the primary comes back on the click and the pages wake a frame later (990-page Split: the primary paints 86–116ms after the click instead of 650–720ms).
- **Dialog Escape (f16 AC-237).** The shared `Dialog` listens for Escape (`cancel`) in a layout effect, before the one that opens it, and also reports a native close it didn't ask for. A dialog that opens on mount (the lazy Sign dialog) therefore hears Escape on its first frame.
