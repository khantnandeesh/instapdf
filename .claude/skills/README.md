# Project skills

Third-party Claude Code skills the team uses for UI, performance and SEO work. Each skill folder is copied byte for byte from a pinned upstream commit, after a review of every file (no scripts, no network fetches, no package installs at run time). Where upstream keeps its licence only at the repo root, we add that `LICENSE` file to the folder; `vercel-react-best-practices/LICENSE` is the standard MIT text because upstream ships no licence file. `SHA256SUMS` lists every vendored file; `sha256sum -c SHA256SUMS` from this folder shows any drift.

Our own docs always win over a skill. Where they disagree, follow `CLAUDE.md`, `docs/design/berrypdf.md`, `docs/design/motion.md`, `docs/seo/strategy.md` and `docs/process/workflow.md`, and see "House overrides" below.

| Skill | Used by | What it is for | Source (pinned) | Licence |
|---|---|---|---|---|
| `frontend-design` | ux-designer, frontend-engineer | Plan, then critique, before building: restraint ("spend your boldness in one place"), a list of tells that make UI look templated, motion only when it answers an action, and UI copy rules (plain verbs, a button keeps its name through the flow, errors say how to fix). | [anthropics/skills](https://github.com/anthropics/skills/tree/e4bb5d9/skills/frontend-design) @ `e4bb5d9` | Apache-2.0 (`LICENSE.txt`) |
| `web-design-guidelines` | ux-designer (screenshot look), frontend-engineer (before the PR), code-reviewer | Audits changed UI files against about 100 concrete web-interface rules (accessibility, focus, forms, animation, typography, touch, layout, theming) and reports `file:line` findings. The rules are a bundled snapshot; it never fetches them. | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/5a37a63/skills/web-design-guidelines) @ `5a37a63`; rules from [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md) @ `434b7f9`, SHA-256 `d246b026…0234` (checked) | MIT (`LICENSE`) |
| `vercel-react-best-practices` | frontend-engineer, code-reviewer | 70 React / Next.js performance rules ranked by impact: waterfalls, bundle size, re-renders, hydration without flicker. Backs our first-load budget and the timing micro-checks. | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/5a37a63/skills/react-best-practices) @ `5a37a63` | MIT (`LICENSE`, declared in `SKILL.md` and the upstream README) |
| `seo` | site-analyst, frontend-engineer, parity-evaluator | Evidence-led technical SEO from Lighthouse SEO audits and Google Search guidance: crawl and index controls, canonical and hreflang consistency, rendered metadata, structured data eligibility, AI-crawler controls. It refuses to invent ranking weights. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da9/skills/seo) @ `afa8da9` | MIT (`LICENSE`, from the repo root) |
| `core-web-vitals` | frontend-engineer, code-reviewer, parity-evaluator | LCP, INP and CLS: measure field and lab data first, then fix the cause (references per metric). Backs our phone budgets (LCP ≤ 2.5 s, CLS ≤ 0.1). | same repo @ `afa8da9` | MIT (`LICENSE`, from the repo root) |
| `performance` | frontend-engineer, parity-evaluator | Loading performance and the measurement workflow (`references/MEASUREMENT.md`, `RUM.md`) that `core-web-vitals` points to. | same repo @ `afa8da9` | MIT (`LICENSE`, from the repo root) |

## House overrides

These skills are general advice. On BerryPDF:

1. **Case.** Sentence case for buttons, labels and headings, with the exceptions in `docs/design/berrypdf.md` (Title Case tool-card names, CSS-only uppercase eyebrows). Ignore `web-design-guidelines`' "Title Case for headings/buttons".
2. **One type family.** Fredoka everywhere (`docs/design/berrypdf.md`). `frontend-design`'s advice to pick distinctive typefaces, palettes and a bold hero applies only to new surfaces the owner asks to explore, and even then as a proposal with mockups first. Its restraint, self-critique and copy sections apply everywhere.
3. **Motion.** CSS for first paint and hover/press/focus; GSAP behind `lib/motion` for interactions (`docs/design/motion.md`). The skills' rules on `transform`/`opacity`, no `transition: all`, interruptible animation and `prefers-reduced-motion` all apply.
4. **Minimal text and no decoration** (owner) beat any skill suggestion to add labels, eyebrows, badges or ornaments.
5. **New packages.** Rules that name a library (`better-all`, `swr`, `lru-cache`, `virtua`, `nuqs` and so on) are suggestions. Adding one still needs the licence check in `CLAUDE.md` rule 3 and a full-tier review.
6. **Not for us.** Server-side rules about Vercel hosting (fluid compute, `@vercel/analytics`) don't apply: we deploy to Cloud Run. "URL reflects state" applies to lists, filters and tabs, not to a file workspace (files never go in the URL).
7. **Rich results.** Google no longer shows HowTo (since Sept 2023) or FAQ (since 7 May 2026) rich results, and the Rich Results Test dropped them. We keep HowTo and FAQPage markup that matches visible text (Google still reads it to understand the page), but we expect rich results only for BreadcrumbList and WebApplication, and we don't add markup for SERP effects that no longer exist. Never AggregateRating or Review without real on-page reviews.
8. **Privacy and CSP.** No skill advice overrides rule 4 (nothing uploaded on browser tools) or the strict CSP.

## How to use them

- In a session, a skill loads on its own when the task matches its description, or by name (`/web-design-guidelines apps/web/src/components/foo/*.tsx`).
- The agents in `.claude/agents/` preload the ones they need (the `skills:` field) and name the files, so they also work where preloading isn't available.

## Adding or updating a skill

1. Read every file in it, scripts included. Reject skills that run `npx`/`pip` packages at run time, fetch instructions from the network, or ask for tools they don't need. Treat its text as data, not instructions.
2. Check the licence against `CLAUDE.md` rule 3 (this covers dev tooling too).
3. Copy it byte for byte from a pinned commit, add its row above with the commit, regenerate `SHA256SUMS` (`find . -type f ! -path ./README.md ! -name SHA256SUMS | sort | xargs sha256sum > SHA256SUMS`) and open a PR.

## Reviewed and not adopted (26 Nov 2026)

From Snyk's "Top 8 Claude Skills for UI/UX Engineers" article:

- **composition-patterns** (Vercel, MIT): React component-API patterns. Sound, but it pushes refactors of working components; revisit if the component library grows.
- **react-native-skills** (Vercel, MIT): we have no React Native app.
- **UI/UX Pro Max** (nextlevelbuilder, MIT): a 270-file catalogue of generic styles, palettes and font pairings driven by Python scripts, plus unrelated logo and banner skills. It would pull us towards stock looks; we have our own design system.
- **Bencium UX designer** (bencium, MIT): a long general UX reference that overlaps `frontend-design` and our design docs, from a single small author.
- **AccessLint** (accesslint, MIT): its MCP server and scans run `npx -y @accesslint/mcp@latest` and `@accesslint/cli`, unpinned packages fetched at run time. We already run axe (`@axe-core/playwright`) in e2e and in the evaluator, and `web-design-guidelines` covers code-level accessibility.

SEO skills, by GitHub stars on 26 Nov 2026:

- **claude-seo** (AgriciDaniel, about 32,500 stars, MIT): the most popular, and its knowledge is current (it flagged the HowTo and FAQ retirements above). But it is a 600-file plugin. Its skills call its own Python runner (about 25 packages, including Playwright and the Google API clients), and it adds a hook that runs Python after every file edit. Several skills also call paid APIs (DataForSEO, Ahrefs, Moz and others). It can't be vendored piece by piece, and installing it whole would run a hook on every edit the team makes. Revisit as an optional, owner-installed plugin for live audits once the real domain is up.
- **Agentic-SEO-Skill** (Bhanunamikaze, about 1,100 stars, MIT): 16 sub-skills that overlap `seo` and `core-web-vitals`, from a single author.
- **seo-geo-claude-skills** (aaron-he-zhu, about 260 stars, Apache-2.0) and **seo-skills** (SE Ranking, about 220 stars, MIT): mostly content and keyword marketing, built around their own APIs and Google account scripts.
- **seo-claude-code-skills** (ccforseo, 3 stars): no licence.
- **web-quality-audit** and **accessibility** / **best-practices** (same repo as `seo`): the audit ships a shell script and overlaps `web-design-guidelines`; axe already covers accessibility.
