# Feature pipeline

The lead orchestrator runs this loop. Exactly one feature is in progress at a time.

```
backlog → 1 Analyze → 2 Research → 3 Design → 4 Build → 5 Test → 6 Review → 7 Stage → 8 Evaluate ─┬─ PASS → 9 Release → next feature
                                                                                                   └─ FAIL → back to 4 with the gap list (max 3 loops, then re-plan in 1)
```

| Step | Agent | Input | Output |
|---|---|---|---|
| 1 Analyze | `site-analyst` | `docs/discovery/pages/<slug>.md` + live Sejda page | `docs/specs/<feature>.md`: behaviors, options, states, errors, limits, acceptance criteria (numbered `AC-n`) |
| 2 Research | `competitor-researcher` | spec | "Improvements" section added to the spec, each item marked adopt or skip |
| 3 Design | `ux-designer` | spec | "UI" section: layout, components, states, a11y notes, mobile |
| 4 Build | `frontend-engineer` / `backend-engineer` | spec | code on branch `feat/<feature>` |
| 5 Test | `qa-engineer` | spec + branch | unit + e2e tests covering every `AC-n`; fixture PDFs in `tests/fixtures/` |
| 6 Review | `code-reviewer` | PR | approve, or request changes (correctness, security, license, budget) |
| 7 Stage | `devops-engineer` | merged `main` | staging deploy URL, smoke test green |
| 8 Evaluate | `parity-evaluator` (independent, never sees code or builder notes) | spec + Sejda URL + staging URL | `docs/evals/<feature>.md` with PASS/FAIL, a score per AC, and the gap list |
| 9 Release | `devops-engineer` | PASS verdict | tag `v*`, prod deploy, backlog updated |

## Conventions

- **Branches:** `feat/<feature>`, `fix/<thing>`, `chore/<thing>`. Never push directly to `main` except for docs from the orchestrator.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
- **PR:** one feature per PR. The body lists the `AC-n` items it covers and links the spec.
- **CI gates (required):** lint, typecheck, unit tests, build, e2e on the preview.
- **Evaluator pass bar:** every P0 AC passes; at least 90% of all ACs pass; Lighthouse performance ≥ 90 on mobile; no critical a11y violations (axe).
