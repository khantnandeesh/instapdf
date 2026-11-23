# Backlog

Status values: `todo` · `in-progress (step n)` · `done`. The orchestrator keeps this file current.

| # | Feature | Sejda slugs | Status |
|---|---|---|---|
| F0 | Foundation: monorepo, CI, design tokens, app shell, tool registry, GCP infra + deploy pipelines | – | done (staging: https://web-staging-qzq5fa2g7q-uc.a.run.app; owner to set GitHub repo vars + production env/tag ruleset) |
| F1 | Shared upload → options → process → result flow (incl. encrypted-PDF password prompts) | shared-chrome | in-progress (step 4: build) — spec + UI on `feat/f1-shared-flow`, vehicle tool: Rotate |
| F2 | Home page + tool catalogue + header menu | home | todo |
| F3 | Merge (files + pages view, reorder, options) | merge-pdf | todo |
| F4 | Split by pages / Extract / Delete / Rotate | split-pdf, extract-pdf-pages, delete-pdf-pages, rotate-pdf-pages | todo (Rotate ships in F1; F4 reuses it) |
| F5 | Organize / Visual combine / Alternate & mix | organize-pdf, visually-combine-reorder-pdf, alternate-mix-pdf | todo |
| F6 | Compress (server worker + infra) | compress-pdf | todo — **must ship a scale-to-zero cleaner that deletes job files ≤2h after upload (Scheduler every 15 min or per-upload Cloud Tasks) before any upload code goes live** |
| F7 | Split by outline / size / text / in half | split-pdf-by-* , split-pdf-down-the-middle | todo |
| F8 | Crop / Resize / Flip / N-up | crop-pdf, resize-pdf, flip-pdf, n-up-pdf | todo |
| F9 | Watermark / Page numbers / Header-footer / Bates | watermark-pdf, page-numbers-pdf, header-footer-pdf, bates-numbering-pdf | todo |
| F10 | Metadata / Bookmarks / Rename / Remove annotations / Flatten | edit-pdf-metadata, pdf-bookmarks, rename-pdf, delete-pdf-annotations, flatten-pdf | todo |
| F11 | Protect / Unlock | encrypt-pdf, unlock-pdf | todo |
| F12 | JPG↔PDF, extract images, PDF to text | jpg-to-pdf, pdf-to-jpg, extract-images-from-pdf, extract-text-from-pdf | todo |
| F13 | Grayscale / Repair | grayscale-pdf, repair-pdf | todo |
| F14 | Office + HTML conversions | word-to-pdf, pdf-to-word, pdf-to-excel, pdf-to-ppt, html-to-pdf | todo |
| F15 | OCR / Deskew | ocr-pdf, deskew-pdf | todo |
| F16 | PDF editor | pdf-editor | todo |
| F17 | Fill & sign | sign-pdf | todo |
| F18 | Form creator | pdf-forms | todo |
| F19 | Accounts, usage limits, pricing + checkout | login, account, upgrade, teachers | todo |
| F20 | Workflows (tool chains) | workflows | todo |
| F21 | Marketing + legal pages | desktop, developers, html-pdf-api, help, blog, press, security, sla, privacy, terms, cookies | todo |
| F22 | i18n (30 locales) | – | todo |
