# Discovery: sejda.com (reference product for InstaPDF)

Crawled 2026-11-23, 59 pages + homepage, all HTTP 200.

- `raw/` holds the original HTML (reference only; never ship any of it).
- `pages/<slug>.md` holds the extracted spec for each page: title, meta description, headings, form field names, and page-specific text.
- `shared-chrome.md` holds the text every page shares: navigation, limit messages, upload widget, footer.

> Rule for every agent: copy **behavior**, not **assets**. No Sejda text, logo, images, CSS or JS goes into InstaPDF.

## What Sejda is

A freemium online PDF toolkit (Sejda BV, Amsterdam). It has 48 web tools, a desktop app, an HTML→PDF API, workflows (tool chains), and Google Workspace / Dropbox / Google Drive / OneDrive integrations. The site is available in 30 languages. It is a plain server-rendered site with one bundled JS file and no SPA framework.

## Shared behavior (every tool page)

- **Upload:** local file, drag and drop, Dropbox, Google Drive, OneDrive, or a web address (URL). Some tools can also start from a blank document.
- **Encrypted PDFs:** a modal asks for the user password. A second modal asks for the owner password when the file's permissions are limited.
- **Pages view vs files view:** page thumbnails. Click, shift-click and ctrl-click select pages; "Add pages" picks pages from another file.
- **Options:** "More options" opens extra settings. The primary button runs the task. The result screen offers Download, Save to Dropbox, and "continue in another tool".
- **Privacy:** "Files stay private. Automatically deleted after 2 hours." Session expiry triggers a re-upload prompt.
- **Recent tools** list and a full tool menu in the header.

### Free-tier limits (from shared-chrome)

| Limit | Free |
|---|---|
| Tasks | 3 per hour (then a countdown timer) |
| Files | 30 per hour; 1 file per task on some tools |
| Size | 50 MB per file, 5 MB per image |
| Pages | 50 per task; 20 per conversion (some tools 50) |
| OCR | 10 pages |
| HTML→PDF | 20 links per task (paid: 100) |
| Rename | 5 files |
| Workflows | 1 |

### Pricing (from /upgrade)

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | No signup; limits above |
| Web Week Pass | $5 per user | one-time, 7 days |
| Web Monthly | $7 per user per month | recurring |
| Desktop+Web Annual | $63 per user per year | includes desktop |

All paid plans include unlimited documents, OCR up to 100 pages, batch processing, up to 21 minutes of processing per task, 500 MB per file, and email support. Teams get a 20% volume discount at 10 users. Signup is email + verification code, or Google.

## Page inventory → InstaPDF build plan

`C` = can run in the browser (pdf-lib / pdf.js, no upload). `S` = needs the server worker.

| # | Group | Sejda slug | Run | Priority |
|---|---|---|---|---|
| 1 | Core | home, shared upload/result flow, tool menu | – | P0 |
| 2 | Pages | merge-pdf, organize-pdf, visually-combine-reorder-pdf, alternate-mix-pdf | C | P0 |
| 3 | Pages | split-pdf, extract-pdf-pages, delete-pdf-pages, rotate-pdf-pages | C | P0 |
| 4 | Pages | split-pdf-by-outline, split-pdf-by-size, split-pdf-by-text, split-pdf-down-the-middle | C/S | P1 |
| 5 | Pages | crop-pdf, resize-pdf, flip-pdf, n-up-pdf | C | P1 |
| 6 | Stamp | watermark-pdf, page-numbers-pdf, header-footer-pdf, bates-numbering-pdf | C | P1 |
| 7 | Meta | edit-pdf-metadata, pdf-bookmarks, rename-pdf, delete-pdf-annotations, flatten-pdf | C | P1 |
| 8 | Optimize | compress-pdf, grayscale-pdf, repair-pdf | S | P0 (compress) / P1 |
| 9 | Security | encrypt-pdf, unlock-pdf | S (qpdf) | P1 |
| 10 | Convert | jpg-to-pdf, pdf-to-jpg, extract-images-from-pdf, extract-text-from-pdf | C | P1 |
| 11 | Convert | word-to-pdf, pdf-to-word, pdf-to-excel, pdf-to-ppt, html-to-pdf | S | P2 |
| 12 | Scans | ocr-pdf, deskew-pdf | S | P2 |
| 13 | Editor | pdf-editor, sign-pdf (fill & sign), pdf-forms (form creator) | C | P2 (largest feature) |
| 14 | Automate | workflows | C/S | P3 |
| 15 | Business | login/account, upgrade (pricing + checkout), teachers | S | P2 |
| 16 | Marketing | desktop, developers, html-pdf-api, press, blog, help | – | P3 |
| 17 | Legal | privacy, terms, cookies, security, sla | – | P3 (our own text) |
| 18 | i18n | 30 locales | – | P4 |

## Improvements to beat Sejda (fed to the Competitor Researcher)

- Browser-side processing for the C tools: instant results, no upload, no hourly cap needed for those tools.
- A modern responsive UI; Sejda's mobile experience is weak.
- A unified "chain the next tool" flow on the result screen.
- PWA / offline support for the C tools.
- Competitors to study: iLovePDF, Smallpdf, PDF24, Adobe Acrobat online, PDFgear, Stirling-PDF.
