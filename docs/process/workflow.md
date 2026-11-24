# Feature pipeline

Read `docs/process/mission.md` first: BerryPDF aims to be the industry standard and to beat the reference on every detail.

The lead orchestrator runs this loop. Exactly one feature is in progress at a time.

```
backlog → 1 Analyze → 2 Research → 3 Design → 4 Build → 5 Test → 6 Review → 7 Stage → 8 Evaluate ─┬─ PASS → 9 Release → next feature
                                                                                                   └─ FAIL → back to 4 with the gap list (max 3 loops, then re-plan in 1)
```

| Step | Agent | Input | Output |
|---|---|---|---|
| 1 Analyze | `site-analyst` | `docs/discovery/pages/<slug>.md` + live Sejda page | `docs/specs/<feature>.md`: behaviors, options, states, errors, limits, acceptance criteria (numbered `AC-n`) |
| 2 Research | `competitor-researcher` | spec | "Improvements" section added to the spec, each item marked adopt or skip; Sejda's premium-only features listed and planned free where cost allows; where server vs browser quality differs, side-by-side evidence |
| 3 Design | `ux-designer` | spec | "UI" section: layout, components, states, a11y notes, mobile |
| 4 Build | `frontend-engineer` / `backend-engineer` | spec | code on branch `feat/<feature>` |
| 5 Test | `qa-engineer` | spec + branch | unit + e2e tests covering every `AC-n`; fixture PDFs in `tests/fixtures/` |
| 6 Review | `code-reviewer` | PR | approve, or request changes (correctness, security, license, budget) |
| 6b Visual review | `ux-designer` (not the builder) | PR screenshots | approve, or request changes against the [visual-quality checklist](#visual-quality-review-step-6b); required for any PR that changes UI |
| 7 Stage | `devops-engineer` | merged `main` | staging deploy URL, smoke test green |
| 8 Evaluate | `parity-evaluator` (independent, never sees code or builder notes) | spec + Sejda URL + staging URL | `docs/evals/<feature>.md` with PASS/FAIL, a score per AC, the micro-comparison table (M1–M12 win/tie/lose with captures of both sites) and the gap list |
| 9 Release | `devops-engineer` | PASS verdict | tag `v*`, prod deploy, backlog updated |

### Reference (Sejda) runs: once per feature

Step 8 needs the reference side only once per feature. The first evaluation runs the real Sejda tasks (at most 3 per hour, project-wide, booked with the lead) and keeps the evidence:

- **Raw evidence** (Sejda's output files, screenshots, recordings, network logs) goes to `/mnt/project-files/evals-cache/<feature>/`, never into git: rule 1 in `CLAUDE.md` keeps Sejda assets out of the repo.
- **In git**, `docs/evals/cache/<feature>/manifest.json` holds only our own text: the observations per check, timings, SHA-256 hashes of the outputs and the capture date.

After a fix round (FAIL → 4 → 7 → 8), the re-evaluation re-runs **all of BerryPDF's side** on the new staging build (every AC and every micro-check, M1 to M12, at every size) against the cached Sejda evidence, and uses no Sejda tasks. The cache is good for 30 days. After that, or when the owner flags a Sejda change, or when a check needs reference behaviour the cache doesn't hold (a new AC, a fixture Sejda never saw), the next evaluation refreshes just those checks, with slots booked through the lead, and the eval says which check needed it. The pass bar is unchanged: re-evaluations compare against the same Sejda evidence, so no gate gets weaker. The owner's rule to compare Sejda in the browser when they give feedback still applies; reuse cached captures there when they already show the exact thing.

Steps 6b and 8 judge what the screen looks like, not only whether each `AC-n` passes: a screen can meet every AC and still waste the space it has (the Merge page preview passed the UX and evaluator gates with a small page in a mostly empty modal, a decorative wave and oversized buttons).

Every tool also passes the [SEO checklist](#seo-checklist-part-of-the-definition-of-done-for-every-tool) before step 8.

## Conventions

- **Branches:** `feat/<feature>`, `fix/<thing>`, `chore/<thing>`. Never push directly to `main` except for docs from the orchestrator.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
- **PR:** one feature per PR. The body lists the `AC-n` items it covers and links the spec.
- **CI gates (required):** lint, typecheck, unit tests, build, e2e. The required check is `web`. See [CI](#ci-what-runs-where) for what runs where.
- **Evaluator pass bar:** no micro-check (mission.md M1–M12) is a *lose* unless the owner waived it in writing; every P0 AC passes; at least 90% of all ACs pass; Lighthouse performance ≥ 90 on mobile; no critical a11y violations (axe); and, once the Q2 corpus exists, the tool runs over the real-world PDF corpus with zero crashes and its oracle checks green (`qpdf --check`, render diff, text equality).
- **Design:** all UI follows the owner's BerryPDF system (`docs/design/berrypdf.md`): grid paper, one berry action on its lip, leaf-cornered tool cards coloured by berry category, Fredoka, Phosphor Duotone icons, berry motifs (floating berries, berry loader, jam progress; no vine), light only (dark mode pending the designer's definition). Owner overrides (2026-11-23): minimal text (only what a task needs; details go to tooltips or screen-reader text), quiet CSS motion (entrances ≤ 400ms, all off under reduced motion), no vine; sections separate by spacing. Deviations from BerryPDF are listed there with measured contrast.
- **Competitor research:** adopt/skip decisions must not rest on unverified claims.

## Visual-quality review (step 6b)

The builder attaches screenshots to the PR at **1280x720 and 390x844** (device scale factor 2) of every screen and state the PR touches: empty, loaded, each dialog, sheet and preview, result. Someone other than the builder reviews them against `docs/design/berrypdf.md` and ticks this checklist in the PR; any unticked item blocks the merge. The evaluator (step 8) repeats it on staging and records it in `docs/evals/<feature>.md` next to the AC scores.

- [ ] **Space**: the content (pages, preview, form) gets most of the screen; no large empty areas inside a card, panel or dialog; a page preview fills ≥ 85% of the height (desktop) / ≥ 90% of the width (phone).
- [ ] **Chrome**: titles, counters and toolbars are small and quiet; nothing above the content but title, counter and close; no file name as a second heading.
- [ ] **No decoration**: no waves, bands, badges, vines or other ornaments (owner overrides); sections separate by spacing.
- [ ] **Controls**: buttons are a normal size (≤ 48px tall, as wide as their label in dialogs), icon buttons 34–44px; nothing chunky or full-width on desktop.
- [ ] **Focus**: on-theme `:focus-visible` ring after Tab; none after a mouse click.
- [ ] **Contrast and edges**: white pages and cards read against their background (edge or shadow).
- [ ] **Phone**: controls in reach of the thumb, nothing cut off, no sideways scroll.
- [ ] **Compared with Sejda** at the same two sizes: ours is at least as clear and uses the space at least as well.

Automated where possible (`e2e/ui/modals.spec.ts`, `viewport-fit.spec.ts`, `scroll-rules.spec.ts`); the screenshot review catches what the guards can't measure.

## SEO checklist (part of the definition of done for every tool)

Strategy: `docs/seo/strategy.md`; keywords: `docs/seo/keyword-plan.md`. The automated items run in CI (`src/tools/seo.test.ts`, `e2e/seo/seo.spec.ts`); the evaluator checks the rest.

- [ ] Slug is the primary keyword with hyphens (registry); never renamed after launch without a 308 redirect.
- [ ] `toolSeo` entry: keyword-first title ≤ 60 characters with the brand, description 110–160, unique, true (browser tools may say "nothing is uploaded"; server tools say files are deleted after 2 hours). *(automated)*
- [ ] The page exports `metadata = toolMetadata(tool)` and renders `<ToolSeo tool={tool} />` after the tool, inside `.mp-toolstage` wrapping only the tool. *(automated: canonical, hreflang, OG, robots, one `h1`)*
- [ ] `seoContent` entry: 3–5 how-to steps, 4–8 FAQ answers checked against the tool's real behaviour and limits, 3–6 related tools. *(automated: counts, structured data matches visible text)*
- [ ] `opengraph-image.tsx` in the tool's route folder (one line with `ogImage`); the card looks right.
- [ ] Guide starts below the first screen on desktop and phone; nothing new above the fold. *(automated)*
- [ ] Budgets on a phone: ≤ 170 KB JS, LCP ≤ 2.5 s, CLS ≤ 0.1 *(automated)*; Lighthouse SEO = 100 and performance ≥ 90 mobile *(evaluator)*.
- [ ] Rich Results Test shows WebApplication, BreadcrumbList, HowTo and FAQPage with no errors *(evaluator, once on a public URL)*.
- [ ] Variant pages from the keyword plan that this tool enables are listed in the backlog.

## CI: what runs where

The planner (`apps/web/scripts/ci/plan.mjs`, job `plan` in `.github/workflows/ci.yml`) decides what each run tests:

| Run | What runs |
|---|---|
| Pull request | Lint, typecheck, unit tests, build and JS budgets, always. Browser tests: only the specs the change can reach (`apps/web/scripts/ci/affected.mjs` follows imports from each spec and the routes its folder visits), plus the page-wide guards (`e2e/ui`, `e2e/seo`, `e2e/q1`, smoke). Anything it can't place, build config, the root layout and what it imports, and CI itself run the full suite. Engine (`crates/`) changes also run the editor specs. Docs-only PRs run no browser tests. Add the label `full-ci` to run everything. |
| Merge to main | Nothing again when the PR was up to date with main (its head has the same tree as the merge) and its CI was green: the staging deploy starts at once. Otherwise the full suite runs first. |
| Nightly (02:30 IST) | The full suite on main, the safety net for the PR selection. The lead checks it. A red nightly run blocks other merges until it is fixed or the failing test has a named owner. No quarantining. |

Browser tests are packed into machines by their measured time (`apps/web/e2e/timings.json`), about 3 minutes of tests each, with 3 Playwright workers (1 for `@serial`; 4 workers made two load-heavy tests time out). Refresh the timings from a nightly run's `e2e-timings-*` artifacts with `node apps/web/scripts/ci/timings.mjs <reports>`. A new spec folder needs its routes in `AREAS` in `affected.mjs` (a unit test fails until it has them).

**Merging without a second run:** once review is clean, merge `origin/main` into the branch and push. When that run is green, merge right away. Main then has the same tree the PR tested, so nothing runs again and staging deploys at once. If main moved in between, the merge still works but runs the full suite before staging (about 6 more minutes).
