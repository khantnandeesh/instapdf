# Mission and ways of work

Owner's words (2026-11-23): "If anyone has to use a PDF, they use BerryPDF. That's the industry standard. That's what we have to prove." Every agent on the team reads this before starting work.

## What we are building

1. **The industry standard.** BerryPDF is the first place anyone goes for any PDF task. Parity with Sejda (the reference product) is the floor, not the goal.
2. **Premium for free.** What Sejda keeps behind its paid tier (bigger files, more tasks per hour, batch work, the advanced editor and its options), we offer free whenever our costs allow it. Where a hard cost limit applies (server tools, see the budget rule in `CLAUDE.md`), the limit must still be more generous than Sejda's free tier.
3. **Beat every detail.** We win on every step a user sees: how the upload starts, the progress shown, how fast the first page appears, rendering sharpness, how the options feel, the result, the output file, and how errors are explained. One lost micro-check is a defect, not a footnote.
4. **The best result wins.** We pick the engine that produces the best output. Browser first, because it's faster, private and costs nothing. When a server engine gives a clearly better result, the spec proves it (side-by-side outputs) and it may run on the server, within the budget hard stop. That tool's privacy copy must then say honestly that files are uploaded and deleted.
5. **Minimal, beautiful, alive UI.** Only the words a user needs, tasteful motion, and the BerryPDF look (`docs/design/berrypdf.md`).

## Server tools: free forever, with a queue

Owner's model (2026-11-23) for anything that runs on our servers:

- **Free stays free, always.** No paywall on a server tool.
- **A fixed, capped pool of workers** keeps us inside the ₹1000/month budget (Cloud Run max instances, per-IP and global daily limits, and the budget hard stop from rule 5).
- **When the pool is busy, the user joins a queue** and sees their live position and an honest estimate (for example "You're #25 in line, about 2 minutes"). They can leave the tab open or cancel. Nobody gets a silent failure or a vague "server busy".
- **Paid later, if ever:** a premium lane may get priority or dedicated workers. The free lane never gets worse because of it.
- The queue lives in the design of the server worker and the hard stop (backlog Q3 and F6), and in any feature that uses the server (for example the editor, if a server engine wins on quality).

## How we work

- **Research before building.** Every feature starts with the crawl of the reference page, a live run of the reference tool, and a competitor survey (Sejda, iLovePDF, Smallpdf, PDF24, Adobe, PDFgear, Stirling and others as relevant). A claim needs evidence: a screenshot, a network log, an output file or a link.
- **Study how they do it, then do it better.** We may read the reference's public docs, observe its network traffic and output files, and read open-source engines to understand their approach. Sejda's SDK is AGPL: **read to learn, never copy** its code, text or assets (CLAUDE.md rules 1 and 3). Our engine choices stay permissive-licensed, and we are free to pick a better language or engine (for example PDFium WASM or Rust) where it helps.
- **Measure, don't guess.** Every evaluation includes the micro-comparison (below) with timings and captures from both sites.
- **No shortcuts.** We never skip, weaken or quarantine a test to get green, never mark a criterion as passed without running it, and never hide a known gap: it goes in the gap list. If something can't be done well yet, we say so and plan it.
- **Full sincerity.** We treat every user's file as precious: no crashes, no silent data loss, and the output is checked (page count, text, rendering diff) before we call a tool done.

## Micro-comparison (part of step 8, every tool)

The parity evaluator runs the same tasks with the same fixtures on Sejda and on BerryPDF staging, at desktop (1280px) and phone (375px) widths, and records each of these checks as **win / tie / lose**, with screenshots (or a short video) of both sites at each step and the measured numbers:

| # | Check | What is measured |
|---|---|---|
| M1 | Landing | time to interactive; how clear the first action is; the amount of text before the action |
| M2 | Upload start | ways in (click, drop, paste, URL, cloud); what happens immediately after choosing a file |
| M3 | Upload and loading progress | is progress shown and is it truthful; time until the first page thumbnail appears |
| M4 | Document display | thumbnail sharpness at 1x and 2x, page order and rotation shown correctly, scrolling smoothness with 60+ pages |
| M5 | Interaction | the clicks/keystrokes needed for the core task; drag, select, undo; keyboard and touch support |
| M6 | Options | the options offered vs Sejda's free and premium tiers; sensible defaults |
| M7 | Processing | the time from "Apply" to the download being ready (median of 3 runs where Sejda's rate limit allows), progress feedback |
| M8 | Output fidelity | page count, sizes, rotation, text extraction equality, a rendered diff against the source, file size, `qpdf --check` |
| M9 | Errors and limits | encrypted, corrupt, huge and wrong-type files: the message shown and the recovery path offered |
| M10 | Privacy and cost | whether the file is uploaded (network log), the account or paywall prompts shown, the free-tier limits hit |
| M11 | Look and motion | visual polish, motion, how minimal the text is (owner's UI goals) |
| M12 | First screen fit | at real browser viewports (1366x657, 1280x632, 1536x730, 1920x969, 390x664): is the whole working UI and the primary action visible without scrolling, on load, after a file loads, and on the result screen; does the primary action stay in view while scrolling a long document. Any primary action below the fold is a lose |

**Pass rule:** a tool can't PASS while any micro-check is a **lose**, unless the owner waives that check in writing (recorded in `docs/evals/<feature>.md`). Ties are allowed. Where Sejda paywalls something we offer free, that check counts as a win.

Sejda politeness still applies: at most 3 real tasks per hour, with outputs and captures cached in `docs/evals/cache/<feature>/` and reused.
