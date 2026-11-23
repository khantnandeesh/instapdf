# External review: PDF-industry expert and senior developer (2026-11-23)

Read-only review of the charter, backlog, specs F1–F3, evals, infra and `apps/web/src/lib/pdf`. Items marked *verify* are the consultant's recollection, not checked. Status of each recommendation is tracked at the end.

## 1. Biggest calls

1. **Make "nothing leaves your device" the product, and push it further than the charter.** CLAUDE.md rule 4 puts compress, OCR, encrypt/unlock and repair on the server; most can run client-side: unlock already works (`rotate.ts` `loadForEdit`), protect via `@cantoo/pdf-lib` (*verify* AES-256 R6), repair/encrypt/object-stream recompression via qpdf compiled to WASM (Apache-2.0), compress = image downsampling in a worker with server fallback, OCR via tesseract.js (Apache-2.0) for the ~10-page free tier. Only Office/HTML conversion truly needs a server.
2. **Make the privacy claim verifiable:** strict CSP (`connect-src 'self'`) and say so on the page.
3. **Parity gates measure UI, not PDF correctness** (see 2 and 5).
4. **Budget is an alert, not a cap:** add a hard stop before F6 (budget Pub/Sub → set worker max instances to 0; daily job counter).

## 2. PDF correctness risks

- Merge drops document-level structure (StructTreeRoot, OCProperties, PageLabels, OutputIntents, Lang): tagged PDFs lose accessibility, PDF/A stops being PDF/A, layers/labels/attachments lost. Carry what can be carried; warn on the rest.
- Form flatten failure is swallowed (`loadSource` empty catch) and typed values can vanish. Fail loudly or keep fields.
- `NeedAppearances true` (`forms.ts`) triggers Acrobat's save prompt; deprecated in PDF 2.0.
- Signatures are invalidated by any rewrite: detect `/ByteRange`/`SigFlags` at intake and warn, in every tool.
- `scalePage` maps indirect box values to 0.
- `merge.ts` uses private `copier.traversedObjects`: add a canary test.
- Memory: caps (100 MB/file, 500 MB, 1,000 pages) are too high for iOS Safari; add WebKit to CI and device-aware caps.
- Text: before F9, rendered-diff tests for Devanagari, Arabic, mixed bidi (pdf-lib does no bidi reordering, *verify*).
- Fixture monoculture: all fixtures made by the same library family; upstream `pdf-lib` should be a devDependency.
- Corpus to add (fetched by hash nightly, not committed): qpdf and PDFBox suites (Apache-2.0), PDFium corpus (BSD), pdf.js test PDFs, veraPDF corpus and Isartor, PDF/UA samples, GovDocs1, an encryption matrix (RC4-40/128, AES-128, AES-256 R5/R6, empty user password, Unicode passwords).
- Oracles per tool: `qpdf --check`, PDFium render pixel diff, text-extraction equality, veraPDF on PDF/A inputs.

## 3. Server architecture (what stays server-side)

- License traps: OCRmyPDF defaults to Ghostscript (use `--output-type pdf` and the pdfium rasterizer, *verify*); pngquant and unpaper are GPL; Poppler is GPL; `pdf2docx` depends on PyMuPDF (AGPL).
- PDF→Word/Excel/PPT has no good permissive engine: defer or label "basic". Word→PDF via LibreOffice is fine.
- Split the worker into light (pikepdf + pypdfium2), OCR (Tesseract) and office (LibreOffice + Chromium) images; concurrency 1, 2 vCPU / 4 GiB, startup CPU boost, separate SA, no public invoker.
- Cost: a 60 s OCR job ≈ ₹0.30; ~160 jobs/day total within budget. Enforce quotas server-side from day one.
- Jobs: signed PUT with `x-goog-content-length-range`; delete input right after processing; delete output by per-job Cloud Task at +2 h **and** keep the 15-minute sweep; download URLs expire within 2 h.
- Abuse: per-IP and global counters, bot challenge on server tools, hard timeouts, page/pixel limits, LibreOffice macros off; HTML→PDF is an SSRF tool (block metadata server and private ranges); defer URL input.
- Hosting: put static assets (fonts, pdf.js chunks) behind a CDN; us-central1 egress and latency hurt Indian users.

## 4. Roadmap

1. F4 + F5 right after Merge, as one feature (shared page-list model).
2. F12 next (JPG↔PDF, PDF→JPG): high search volume, client-side, reuses Merge's image code.
3. F11 before F6, client-side.
4. F6 Compress client-first with server fallback; publish honest before/after sizes.
5. Pull privacy, terms and third-party notices forward from F21 before any prod tag.
6. Defer/cut: F18 form creator, F20 workflows, Bates, teachers, desktop/API pages; F22 to ~5 locales (Hindi first); scope F16 to add text/images/whiteout/annotate.
7. F19 accounts and checkout only once server tools have real usage.

Monetization: browser tools free and unlimited; charge for server minutes (OCR pages, Office conversion, batch) with a small daily free quota, India pricing with UPI and a short pass. No ads.

## 5. Process

- Add a corpus gate to the evaluator bar (zero crashes, oracle checks green).
- Tell users when encryption is removed (`wasEncrypted` is tracked).
- Specs are too big; split a shared page-model spec.
- Don't record adopt/skip decisions on unverified competitor claims.
- Cache Sejda reference outputs per fixture and reuse them.
- CI: add WebKit, a bundle-size check, a lockfile license scan, the nightly corpus job.
- Do one prod release now to exercise the release path.

## Status

| Recommendation | Status |
|---|---|
| Merge: flatten failure, `scalePage` indirect boxes, Lang/PageLabels carry-over, warnings for tagged/PDF/A/layers/attachments/signatures, private-API canary, `pdf-lib` to devDependencies, conditional NeedAppearances | In the F3 fix round (PR #7) |
| Charter rule 4 change, roadmap reorder, budget hard stop, legal pages before prod, corpus gate | Approved by owner 2026-11-23: CLAUDE.md, workflow.md and backlog.md updated (Q1–Q3 added) |
