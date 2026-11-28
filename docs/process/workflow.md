# Feature pipeline (lean, owner decision 27 Nov 2026)

Read `docs/process/mission.md` first. The goal is the best PDF product, not the best paperwork. On 27 Nov the owner chose a leaner process: less ceremony on low-risk work, and more of the effort on product and UI quality. When in doubt, spend the time on the product.

```
1 Spec (one page + mockup) → 2 Build + tests → 3 Review (by risk) → 4 Stage → 5 Key checks vs Sejda ─┬─ PASS → backlog updated
                                                                                                     └─ FAIL → fix, re-check only what failed
```

| Step | Who | Output |
|---|---|---|
| 1 Spec | `site-analyst` with `ux-designer` | `docs/specs/<feature>.md`, **one page**: what the tool does (behaviours, options, limits, errors), P0 acceptance criteria (`AC-n`), where we beat the reference, and a mockup at 1280 and 390. Competitor research goes in only when it changes a decision. |
| 2 Build + tests | `frontend-engineer` / `backend-engineer`, `qa-engineer` | Code plus automated tests for every P0 AC and every bug fixed. Tests are cheap and catch real breakage; they stay. |
| 3 Review | by [risk tier](#review-by-risk) | Approve or must-fix |
| 4 Stage | merge to `main` deploys staging | Staging URL |
| 5 Key checks | `parity-evaluator` | The short verdict below, in the feature's PR or a short `docs/evals/<feature>.md` |

**One PR per feature.** The spec, the code, the tests, the eval note and the backlog line all go in the same PR, or in at most one follow-up. There are no separate docs, backlog or eval PRs.

### Key checks (step 5)

These replace the full every-AC evaluator run. CI already proves the ACs.

- **Sejda side by side:** the same task on both, at 1280 and 390. Speed, output quality and size, and how the screen uses its space (micro-checks M1–M12). No *lose* unless the owner waived it.
- **Real use:** the tool works end to end on staging with real files. A cloud import counts only with a real pick in the owner's signed-in Chrome.
- **P0 ACs** pass, Lighthouse performance ≥ 90 on mobile, and axe shows no critical violations.
- **Sejda runs:** at most 3 tasks per hour, booked with the lead. Raw evidence goes to `/mnt/project-files/evals-cache/<feature>/`, never into git. A re-check after fixes re-runs only what failed, using the cached reference evidence.

The verdict is a short table: PASS/FAIL, micro-checks, P0 count, Lighthouse, and the gaps.

## Review by risk

Owner decisions, 25 Nov and 27 Nov.

| Tier | When | Review |
|---|---|---|
| **UI** | Layout, styling, copy, icons and motion; docs and process; changes to tests only | **No review round.** Merge on green CI after one screenshot look against `docs/design/berrypdf.md` (below), by the lead or the owner. |
| **Full** | The editor (`tools/editor/`, `lib/editor/`) and the Rust engine (`crates/`); what a tool writes into a PDF or downloads; file parsing, passwords and encryption; privacy (CSP, what leaves the browser) and security; the worker, infra, CI, budgets, licences or a new dependency | `code-reviewer` with the full checklist, re-reviewed after a must-fix |

A PR that mixes both tiers is **full**. The PR body states `Review tier: ui` or `Review tier: full`.

## Screenshot look (UI changes)

Attach **3 key states** (for example empty, loaded and result) at **1280 and 390**. Show more only when the change is about a specific state. Check them against:
- **Space:** the content gets most of the screen, and a page preview fills at least 85% of its box.
- **Quiet chrome:** minimal text and no decoration.
- **Controls:** normal-size controls, an on-theme focus ring, and nothing cut off.
- **Fit:** no sideways scroll, and the main button visible on the first screen.
- **Sejda:** at least as clear as Sejda.

The automated guards in `e2e/ui/` (fit, scroll rules, modals, thumbnail tiles) catch the rest.

## UI polish passes and the owner's digest

- Product time goes to the product. Between features, run regular **UI polish passes** over the existing tools: spacing, motion, empty states, phone ergonomics and copy, each shipped as a UI-tier PR.
- The lead posts **one daily screenshot digest** to the owner: what changed in the product that day, as before and after images.

## Conventions

- **Branches:** `claude/<thread>` or `feat/<feature>`. **Commits:** Conventional Commits.
- **CI gates (required):** lint, typecheck, unit tests, build, budgets and the affected e2e tests. The required check is `web`.
- **Design:** `docs/design/berrypdf.md` (BerryPDF system, owner overrides, rule PT-1 for thumbnails, tool layout standard F25).
- **Rules that stay:** no secrets in git; permissive licences only; browser first with a strict CSP; copy Sejda's behaviour, never its assets; never skip or weaken a test to get green; production tags (`v*`) need the owner's fresh go.

## SEO checklist (part of the definition of done for every tool)

Strategy: `docs/seo/strategy.md`; keywords: `docs/seo/keyword-plan.md`. The automated items run in CI (`src/tools/seo.test.ts`, `e2e/seo/seo.spec.ts`); the evaluator checks the rest.

- [ ] Slug is the primary keyword with hyphens (registry); never renamed after launch without a 308 redirect.
- [ ] `toolSeo` entry: keyword-first title ≤ 60 characters with the brand, description 110–160, unique, true (browser tools may say "nothing is uploaded"; server tools say files are deleted after 2 hours). *(automated)*
- [ ] The page exports `metadata = toolMetadata(tool)` and renders `<ToolSeo tool={tool} />` after the tool, inside `.mp-toolstage` wrapping only the tool. *(automated: canonical, hreflang, OG, robots, one `h1`)*
- [ ] `seoContent` entry: 3–5 how-to steps, 4–8 FAQ answers checked against the tool's real behaviour and limits, 3–6 related tools. *(automated: counts, structured data matches visible text)*
- [ ] `opengraph-image.tsx` in the tool's route folder (one line with `ogImage`); the card looks right.
- [ ] Guide starts below the first screen on desktop and phone; nothing new above the fold. *(automated)*
- [ ] Budgets on a phone: ≤ 170 KB JS, LCP ≤ 2.5 s, CLS ≤ 0.1 *(automated)*; Lighthouse SEO = 100 and performance ≥ 90 mobile *(evaluator)*.
- [ ] Rich Results Test shows WebApplication and BreadcrumbList with no errors, and the Schema.org validator passes the HowTo and FAQPage markup *(evaluator, once on a public URL)*. Google retired the HowTo (Sept 2023) and FAQ (7 May 2026) rich results, so the Rich Results Test no longer reports them.
- [ ] `seo` and `core-web-vitals` skills (`.claude/skills/`) run on the tool page; no open crawl, index, canonical, structured-data or CWV finding.
- [ ] Variant pages from the keyword plan that this tool enables are listed in the backlog.

## CI: what runs where

The planner (`apps/web/scripts/ci/plan.mjs`, job `plan` in `.github/workflows/ci.yml`) decides what each run tests:

| Run | What runs |
|---|---|
| Pull request | Lint, typecheck, unit tests, build and JS budgets, always. Browser tests: only the specs the change can reach (`apps/web/scripts/ci/affected.mjs` follows imports from each spec and the routes its folder visits), plus the page-wide guards (`e2e/ui`, `e2e/seo`, `e2e/q1`, smoke). Anything it can't place, build config, the root layout and what it imports, and CI itself run the full suite. Engine (`crates/`) changes also run the editor specs. Docs-only PRs run no browser tests. To run everything on a PR, start CI on its branch with Run workflow in the Actions tab, or add the label `full-ci` before the next push. |
| Merge to main | Nothing again when a green run of the PR tested this exact tree on the commit main was at, and that commit's own run is green: the staging deploy starts at once. Otherwise (main moved after the PR's last run, or the previous main run is red or still going) the full suite runs first. Runs on main are never cancelled. |
| Nightly (02:30 IST) | The full suite on main, the safety net for the PR selection. The lead checks it. A red nightly run blocks other merges until it is fixed or the failing test has a named owner. No quarantining. |

Browser tests are packed into machines by their measured time (`apps/web/e2e/timings.json`), about 3 minutes of tests each, with 3 Playwright workers (1 for `@serial`; 4 workers made two load-heavy tests time out). The nightly run refreshes them by itself: its `timings` job merges every row's report and saves the result to the Actions cache, and each run's `plan` job restores the latest one over the checked-in file. To update the checked-in copy, run `node apps/web/scripts/ci/timings.mjs <reports>` on a nightly run's `e2e-timings-*` artifacts. A new spec folder needs its routes in `AREAS` in `affected.mjs` (a unit test fails until it has them).

**Merging without a second run:** once review is clean, merge `origin/main` into the branch and push. When that run is green, merge right away. Main then has the same tree the PR tested, so nothing runs again and staging deploys at once. If main moved in between, the merge still works but runs the full suite before staging (about 6 more minutes).
