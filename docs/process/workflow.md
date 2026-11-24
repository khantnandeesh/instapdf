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
| 7 Stage | `devops-engineer` | merged `main` | staging deploy URL, smoke test green |
| 8 Evaluate | `parity-evaluator` (independent, never sees code or builder notes) | spec + Sejda URL + staging URL | `docs/evals/<feature>.md` with PASS/FAIL, a score per AC, the micro-comparison table (M1–M11 win/tie/lose with captures of both sites) and the gap list |
| 9 Release | `devops-engineer` | PASS verdict | tag `v*`, prod deploy, backlog updated |

Every tool also passes the [SEO checklist](#seo-checklist-part-of-the-definition-of-done-for-every-tool) before step 8.

## Conventions

- **Branches:** `feat/<feature>`, `fix/<thing>`, `chore/<thing>`. Never push directly to `main` except for docs from the orchestrator.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
- **PR:** one feature per PR. The body lists the `AC-n` items it covers and links the spec.
- **CI gates (required):** lint, typecheck, unit tests, build, e2e on the preview.
- **Evaluator pass bar:** no micro-check (mission.md M1–M11) is a *lose* unless the owner waived it in writing; every P0 AC passes; at least 90% of all ACs pass; Lighthouse performance ≥ 90 on mobile; no critical a11y violations (axe); and, once the Q2 corpus exists, the tool runs over the real-world PDF corpus with zero crashes and its oracle checks green (`qpdf --check`, render diff, text equality).
- **Design:** all UI follows the owner's BerryPDF system (`docs/design/berrypdf.md`): grid paper, one berry action on its lip, leaf-cornered tool cards coloured by berry category, Fredoka, Phosphor Duotone icons, berry motifs (floating berries, berry loader, jam progress; no vine), light only (dark mode pending the designer's definition). Owner overrides (2026-11-23): minimal text (only what a task needs; details go to tooltips or screen-reader text), quiet CSS motion (entrances ≤ 400ms, all off under reduced motion), no vine; sections separate by spacing. Deviations from BerryPDF are listed there with measured contrast.
- **Competitor research:** adopt/skip decisions must not rest on unverified claims.

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
