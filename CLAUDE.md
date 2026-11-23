# InstaPDF — engineering team charter

InstaPDF is a fast, private online PDF toolkit. Sejda (https://www.sejda.com) is the **reference product**: we match what each of its tools does, then improve on it. The whole team is made of Claude Code agents. A lead orchestrator session assigns the work; role agents live in `.claude/agents/`.

## Hard rules

1. **Copy behavior, never assets.** No Sejda text, logos, images, CSS, JS or brand names in our code or UI. Write our own copy.
2. **One feature at a time.** Each feature goes through the pipeline in `docs/process/workflow.md` and must pass the evaluator gate before the next one starts.
3. **Permissive licenses only.** MIT, Apache-2.0, BSD, ISC, MPL. No AGPL or GPL (that rules out Ghostscript, MuPDF/PyMuPDF, iText). Check a dependency's license before adding it.
4. **Browser first.** If a tool can run client-side with pdf-lib / pdf.js, it must; nothing gets uploaded. The server worker is only for what the browser can't do (compress, OCR, Office/HTML conversion, encrypt/unlock).
5. **Budget: ₹1000/month total on GCP.** Everything scales to zero. No always-on VMs, no Cloud SQL, no min-instances > 0. Uploaded files are deleted after 2 hours.
6. **No secrets in git.** GCP credentials come from the environment (`GCP_SA_KEY_JSON`, `GCP_PROJECT_ID`) and GitHub Actions secrets.
7. **Be polite to sejda.com.** At most 1 request/second when crawling. The evaluator runs real tasks on Sejda's free tier: at most 3 per hour.

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js (App Router) + TypeScript (strict) + Tailwind CSS, in `apps/web` |
| PDF in browser | `pdf-lib` (write), `pdfjs-dist` (render), Web Workers for heavy work |
| Worker | Python 3.12 + FastAPI in `services/worker`, deployed on Cloud Run. Uses qpdf/pikepdf, pypdfium2, OCRmyPDF + Tesseract, LibreOffice headless, Chromium |
| Storage | Cloud Storage bucket with a 2-hour delete lifecycle |
| Data | Firestore (free tier) for accounts and usage counters |
| Tests | Vitest (unit), Playwright (e2e and evaluator), pytest (worker) |
| CI/CD | GitHub Actions: PR checks → staging on merge to `main` → prod on tag `v*` |
| Infra | Terraform in `infra/` |

## Commands

- `pnpm install`: install everything
- `pnpm dev`: start the web app on :3000
- `pnpm lint && pnpm typecheck && pnpm test`: the checks CI runs
- `pnpm e2e`: Playwright e2e (always pass `--trace off` unless debugging)

## Where things are

- `docs/discovery/`: Sejda crawl. `pages/<slug>.md` is the spec source for each tool.
- `docs/specs/<feature>.md`: our spec per feature (written by site-analyst + competitor-researcher + ux-designer).
- `docs/evals/<feature>.md`: evaluator verdicts.
- `docs/process/workflow.md`: the pipeline, gates and conventions.
- `docs/process/backlog.md`: ordered feature list and status.

## Definition of done (every feature)

Spec merged → code + tests merged via PR with green CI → deployed to staging → evaluator verdict **PASS** recorded in `docs/evals/` → backlog updated.
