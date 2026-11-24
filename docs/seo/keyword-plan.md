# Keyword plan and launch content plan

Companion to [strategy.md](strategy.md). Titles and descriptions for every tool are in `apps/web/src/tools/seo.ts` (tested); this file says which searches each page goes after and in what order.

**About the numbers:** we have no paid keyword tool yet, so priority comes from what the market leaders invest in (URLs, translated slugs, dedicated variant pages) plus the well-known head terms of the category. Once the domain is verified, Search Console impressions replace this guesswork; re-rank this list 8 weeks after launch.

## 1. Tool pages, in priority order

Tier A are the category's head terms, each worth a polished page and the first localisations. The backlog order (editor first) is a product decision; this order is for content and localisation effort once a tool works.

| # | Page | Primary | Secondary and long tail | Our angle |
|---|---|---|---|---|
| A1 | `/compress-pdf` | compress pdf | reduce pdf size, shrink pdf, compress pdf to 100kb / 200kb / 50kb / 1mb, compress pdf without losing quality | browser-first, target-size presets (India exam and job forms ask for "under 100 KB") |
| A2 | `/pdf-to-word` | pdf to word | pdf to docx, convert pdf to word editable, pdf to word free no email | free, no daily cap |
| A3 | `/merge-pdf` | merge pdf | combine pdf, join pdf, combine pdf files into one, merge pdf without upload | nothing is uploaded, no file or page cap |
| A4 | `/jpg-to-pdf` | jpg to pdf | image to pdf, photo to pdf, jpg to pdf under 100kb, multiple jpg to one pdf | in browser, size target |
| A5 | `/pdf-editor` | pdf editor | edit pdf, edit pdf text, add text to pdf, write on pdf, free pdf editor no watermark | edits existing text, free, no watermark (Sejda's moat) |
| A6 | `/pdf-to-jpg` | pdf to jpg | pdf to image, pdf to png, pdf to jpg high quality | in browser, DPI choice |
| A7 | `/word-to-pdf` | word to pdf | docx to pdf, doc to pdf | faithful layout |
| A8 | `/split-pdf` | split pdf | separate pdf pages, split pdf into multiple files | in browser |
| A9 | `/sign-pdf` | sign pdf | fill and sign pdf, electronic signature free, fill pdf form | in browser, no account |
| A10 | `/ocr-pdf` | ocr pdf | searchable pdf, scanned pdf to text, Hindi OCR | Indic languages |
| B1 | `/pdf-to-excel` | pdf to excel | pdf to xlsx, bank statement pdf to excel | |
| B2 | `/protect-pdf`, `/unlock-pdf` | password protect pdf, unlock pdf | remove password from pdf, encrypt pdf | AES, in browser |
| B3 | `/rotate-pdf` (live) | rotate pdf | rotate pdf and save, rotate single page | lossless, in browser |
| B4 | `/delete-pdf-pages`, `/extract-pdf-pages`, `/organize-pdf` | delete pages from pdf, extract pages from pdf, rearrange pdf pages | | |
| B5 | `/pdf-to-ppt`, `/html-to-pdf` | pdf to ppt, html to pdf | | |
| B6 | `/watermark-pdf`, `/add-page-numbers`, `/crop-pdf`, `/resize-pdf` | add watermark to pdf, add page numbers to pdf, crop pdf, resize pdf | pdf to a4 | |
| C | the rest | see `seo.ts` | | niche, low competition: rank fast, build site authority |

## 2. Variant landing pages (same engine, own query)

Smallpdf runs dozens of these and PDF24 thousands. Each is a real page (own title, `h1`, preset options, guide), not a duplicate: the tool opens with the variant's preset. Ship each with its parent tool.

- Compress: `compress-pdf-to-100kb`, `-200kb`, `-50kb`, `-1mb`, `reduce-pdf-size-for-email`.
- Image to PDF: `png-to-pdf`, `heic-to-pdf`, `webp-to-pdf`, `tiff-to-pdf`, `jpg-to-pdf-under-100kb`.
- PDF to image: `pdf-to-png`, `pdf-to-tiff`, `pdf-to-webp`.
- Editor family: `add-text-to-pdf`, `pdf-annotator`, `whiteout-pdf`, `add-image-to-pdf`, `highlight-pdf`.
- Sign family: `fill-pdf-form`, `add-signature-to-pdf`.

Rule: a variant goes live only if its preset changes what the tool does; otherwise it would be thin duplicate content.

## 3. Languages

Order (reach × competition): **hi** (Hindi; India is our home market, competitors' Hindi pages are machine-flat), **es**, **pt-BR**, **id**, **fr**, **de**, then **bn, ta, te, mr** (only PDF24 covers Bengali, nobody covers the rest well), then **ar, ru, ja, ko, it, tr, vi, pl**.

Rules: translated slugs chosen with a native speaker from the words people actually type (often English loanwords: many Hindi searches are "pdf merge kaise kare", so the Hindi page targets both Devanagari and Hinglish phrasing); full page translated (metadata, guide, FAQ, UI); a locale is published only when every indexable page has it. `src/lib/seo/i18n.ts` holds the switch.

## 4. Launch content

1. **Comparison pages** (`/compare/<rival>-alternative`, `/compare/berrypdf-vs-<rival>`): Sejda, iLovePDF, Smallpdf, PDF24, Adobe Acrobat online. Facts only, each claim dated and sourced (their free-tier limits, uploads vs in-browser, ads, watermark). Text and screenshots are ours; their names appear only as plain text facts (nominative use), never their logos.
2. **"Free, no limits" pages**: "PDF tools without upload", "PDF editor without watermark", "Sejda free limit" style queries.
3. **Blog / guides** (`/guides/<slug>`), 2 per week from launch, each linking to its tool: how to compress a PDF for a government form; how to merge PDFs on iPhone / Android / Mac / Windows without an app; how to edit a scanned PDF; how to remove a PDF password you know; PDF/A for court and archive filings; signing PDFs legally in India (IT Act). OS-specific "on Mac / on iPhone" variants are high-intent and easy to rank.
4. **Trust pages**: a "How we keep files private" explainer that shows the CSP and how to verify it in DevTools; a public changelog.
5. **Links**: Product Hunt and Hacker News launch, AlternativeTo / Capterra / G2 listings, "free open tools" lists, student and university IT help pages, GitHub README badges for the browser-only privacy claim.

## 5. Measure

Search Console + Bing Webmaster Tools from day one (owner's domain needed). Weekly: impressions and average position per tool page, pages stuck at positions 8–20 get depth first. No third-party analytics script on tool pages (privacy and budget rules): use Cloud Run request logs for traffic.
