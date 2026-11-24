# InstaPDF — engineering team charter

InstaPDF is a fast, private online PDF toolkit. Sejda (https://www.sejda.com) is the **reference product**: we match what each of its tools does, then beat it on every detail. **Read `docs/process/mission.md` first**: our goal, ways of work and the micro-comparison every tool must win. The whole team is made of Claude Code agents. A lead orchestrator session assigns the work; role agents live in `.claude/agents/`.

## Hard rules

1. **Copy behavior, never assets.** No Sejda text, logos, images, CSS, JS or brand names in our code or UI. Write our own copy.
2. **One feature at a time.** Each feature goes through the pipeline in `docs/process/workflow.md` and must pass the evaluator gate before the next one starts.
3. **Permissive licenses only.** MIT, Apache-2.0, BSD, ISC, MPL (SIL OFL 1.1 for fonts). No AGPL or GPL (that rules out Ghostscript, MuPDF/PyMuPDF, iText, Poppler, pdf2docx, pngquant, unpaper). This applies to test-only and dev tools too. Check a dependency's license before adding it.
4. **Browser first, best result wins.** If a tool can run client-side at the best quality, it must; nothing gets uploaded. A server engine is allowed only where the spec shows side by side that it gives a clearly better result, within rule 5, and that tool's privacy copy must say honestly that files are uploaded and deleted. Client-side includes pdf-lib / pdf.js and permissive WASM builds (qpdf-WASM for protect/unlock/repair/recompression, tesseract.js for small OCR jobs). Compress runs in the browser first with a server fallback. The server worker is only for what the browser genuinely can't do: Office/HTML conversion, large OCR jobs, and compress fallback. The privacy claim must be verifiable: a strict CSP blocks uploads on browser tools.
5. **Budget: ₹1000/month total on GCP.** Everything scales to zero. No always-on VMs, no Cloud SQL, no min-instances > 0. Uploaded files are deleted after 2 hours. The budget is a hard stop, not just an alert: before any server tool ships, reaching it switches server tools off automatically, and server jobs have per-IP and global daily limits.
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
- `docs/process/mission.md`: goal, ways of work, micro-comparison checks.
- `docs/process/workflow.md`: the pipeline, gates and conventions.
- `docs/process/backlog.md`: ordered feature list and status.
- `docs/seo/`: SEO strategy, competitor teardown and keyword plan.

## Definition of done (every feature)

Spec merged → code + tests merged via PR with green CI (including the SEO checklist in `docs/process/workflow.md`) → deployed to staging → evaluator verdict **PASS** (including no lost micro-check) recorded in `docs/evals/` → backlog updated.
