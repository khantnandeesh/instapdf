# Backlog

Status values: `todo` · `in-progress (step n)` · `done` · `deferred`. The orchestrator keeps this file current. Order reflects the owner-approved changes from `docs/consulting/2026-11-23-pdf-expert-memo.md` (2026-11-23): Q items are quality/infra chores.

| # | Feature | Sejda slugs | Status |
|---|---|---|---|
| F0 | Foundation: monorepo, CI, design tokens, app shell, tool registry, GCP infra + deploy pipelines | – | done (staging: https://web-staging-qzq5fa2g7q-uc.a.run.app; owner to set GitHub repo vars + production env/tag ruleset) |
| F1 | Shared upload → options → process → result flow (incl. encrypted-PDF password prompts) | shared-chrome | done — evaluator PASS (docs/evals/f1-shared-flow.md); prod release waits on owner GitHub settings. Follow-ups: G-1 paste listener on `document`, G-2 per-page progress, vehicle tool: Rotate |
| F2 | Home page + tool catalogue + header menu | home | done — evaluator PASS (docs/evals/f2-home.md); re-evaluated PASS 62/62 after #5. Follow-ups: Back/Forward leave guard, footer year at runtime, third-party notices page (F21), aria-controls on closed menu, separator spacing in tool link names |
| F3 | Merge (files + pages view, reorder, options) | merge-pdf | in-progress (step 6: review fixes, PR #7) |
| Q1 | Legal pages (privacy, terms, cookies, third-party notices) + strict CSP that blocks uploads on browser tools | privacy, terms, cookies | done (#9) — owner must fill legal placeholders before the first prod release; caniuse-lite exception approved |
| F16 | PDF editor (top priority, owner 2026-11-23) | pdf-editor | todo — spec `docs/specs/f16-pdf-editor.md` approved: browser-only, PDFium WASM engine; phases E1 core → E2 existing-text line edit → E3 paragraphs, links, forms → E4 redaction, Indic/Arabic, OCR. Next: step 3 (UX design) for E1, then Build |
| F4 | Split by pages / Extract / Delete / Rotate | split-pdf, extract-pdf-pages, delete-pdf-pages, rotate-pdf-pages | todo — next after Merge, built together with F5 on the shared page-list model (Rotate ships in F1) |
| F5 | Organize / Visual combine / Alternate & mix | organize-pdf, visually-combine-reorder-pdf, alternate-mix-pdf | todo — together with F4 |
| F12 | JPG↔PDF, extract images, PDF to text | jpg-to-pdf, pdf-to-jpg, extract-images-from-pdf, extract-text-from-pdf | todo |
| F11 | Protect / Unlock | encrypt-pdf, unlock-pdf | todo — client-side (qpdf-WASM / @cantoo/pdf-lib); tell users when encryption is removed |
| Q2 | Real-world PDF corpus (qpdf/PDFBox/PDFium/pdf.js suites, veraPDF/Isartor, encryption matrix; fetched by hash nightly) + oracles; CI: WebKit project, bundle-size check, lockfile license scan | – | todo |
| Q3 | Budget hard stop (budget Pub/Sub → server tools max instances 0) + per-IP/global daily job limits; static assets behind a CDN | – | todo — before F6 |
| F6 | Compress (server worker + infra) | compress-pdf | todo — client-first compress (image downsampling in a worker) with server fallback; needs Q3 hard stop and the ≤2h cleaner (Cloud Task per job **and** 15-min sweep) before any upload code |
| F7 | Split by outline / size / text / in half | split-pdf-by-* , split-pdf-down-the-middle | todo |
| F8 | Crop / Resize / Flip / N-up | crop-pdf, resize-pdf, flip-pdf, n-up-pdf | todo |
| F9 | Watermark / Page numbers / Header-footer / Bates | watermark-pdf, page-numbers-pdf, header-footer-pdf, bates-numbering-pdf | todo — Bates deferred; rendered-diff tests for Devanagari, Arabic, bidi before shipping |
| F10 | Metadata / Bookmarks / Rename / Remove annotations / Flatten | edit-pdf-metadata, pdf-bookmarks, rename-pdf, delete-pdf-annotations, flatten-pdf | todo |
| F13 | Grayscale / Repair | grayscale-pdf, repair-pdf | todo — repair client-side via qpdf-WASM |
| F15 | OCR / Deskew | ocr-pdf, deskew-pdf | todo — OCR in the browser (tesseract.js) for small jobs; server (OCRmyPDF without Ghostscript) for large |
| F14 | Office + HTML conversions | word-to-pdf, pdf-to-word, pdf-to-excel, pdf-to-ppt, html-to-pdf | todo — Word/HTML→PDF only (LibreOffice / Chromium, SSRF-hardened, no URL input at first); PDF→Word/Excel/PPT deferred (no good permissive engine) |
| F17 | Fill & sign | sign-pdf | todo |
| F21 | Marketing + legal pages | desktop, developers, html-pdf-api, help, blog, press, security, sla, privacy, terms, cookies | todo — privacy, terms, cookies and third-party notices moved to Q1; rest later; desktop/API/teachers pages deferred |
| F19 | Accounts, usage limits, pricing + checkout | login, account, upgrade, teachers | todo — only once server tools have real usage; server-minute pricing, India pricing (UPI), no ads |
| F22 | i18n (30 locales) | – | todo — ~5 locales first (Hindi first) |
| F18 | Form creator | pdf-forms | deferred |
| F20 | Workflows (tool chains) | workflows | deferred |
