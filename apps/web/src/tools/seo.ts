/**
 * Search metadata per tool (docs/seo/strategy.md, docs/seo/keyword-plan.md). Our own wording.
 *
 * - `title`: the primary keyword first, ≤ 50 characters; the page title is `${title} | BerryPDF`
 *   (≤ 60, so Google shows it whole).
 * - `description`: 110–155 characters, the primary keyword in the first sentence, then the
 *   reason to pick us. Browser tools say files are not uploaded (true: the CSP blocks it);
 *   server tools say files are deleted after 2 hours (true: the bucket lifecycle).
 * - `keyword`: the head term the page targets; `also`: secondary terms for the content block.
 * - Never claim "no limits": browser tools have size limits. Never use competitor names here.
 *
 * Tool-page content (how-to steps and FAQ) lives in `seoContent` and is required before a tool
 * ships (docs/process/workflow.md, SEO checklist). Facts in it must match the tool's behaviour.
 */
export type ToolSeo = {
  keyword: string;
  title: string;
  description: string;
  also: string[];
};

export type ToolSeoContent = {
  /** Heading of the how-to, e.g. "How to rotate a PDF". */
  howTo: string;
  /** Visible how-to steps (also HowTo structured data). 3–5 short steps. */
  steps: { name: string; text: string }[];
  /** Visible FAQ (also FAQPage structured data). 4–8 real questions people search. */
  faq: { q: string; a: string }[];
  /** Related tool slugs for internal links, most related first (3–6). */
  related: string[];
};

const privateNote = "Runs in your browser, nothing is uploaded.";
const serverNote = "Files are deleted from our servers after 2 hours.";

export const toolSeo: Record<string, ToolSeo> = {
  "merge-pdf": {
    keyword: "merge pdf",
    title: "Merge PDF: Combine PDF Files Free",
    description: `Merge PDF files and images into one document in seconds. Free, no sign-up, no watermark. ${privateNote}`,
    also: ["combine pdf", "join pdf", "pdf merger", "combine pdf files into one"],
  },
  "split-pdf": {
    keyword: "split pdf",
    title: "Split PDF: Separate PDF Pages Online Free",
    description: `Split a PDF into several files by page ranges or every page. Free, no sign-up, no watermark. ${privateNote}`,
    also: ["pdf splitter", "separate pdf pages", "split pdf into multiple files"],
  },
  "extract-pdf-pages": {
    keyword: "extract pages from pdf",
    title: "Extract Pages from PDF Online Free",
    description: `Extract pages from a PDF and save them as a new file. Pick pages visually or by range. Free, no sign-up. ${privateNote}`,
    also: ["extract pdf pages", "save pages of pdf", "pdf page extractor"],
  },
  "delete-pdf-pages": {
    keyword: "delete pages from pdf",
    title: "Delete Pages from PDF Online Free",
    description: `Delete pages from a PDF in a few clicks and keep the rest exactly as they were. Free, no sign-up. ${privateNote}`,
    also: ["remove pages from pdf", "delete pdf pages", "remove page from pdf"],
  },
  "rotate-pdf": {
    keyword: "rotate pdf",
    title: "Rotate PDF: Turn Pages and Save Online Free",
    description: `Rotate PDF pages and save them for good. Turn all, odd, even or single pages with no quality loss. Free. ${privateNote}`,
    also: ["rotate pdf pages", "rotate pdf and save", "turn pdf pages", "rotate pdf online"],
  },
  "organize-pdf": {
    keyword: "organize pdf",
    title: "Organize PDF: Reorder and Sort Pages Free",
    description: `Organize PDF pages: drag to reorder, rotate, duplicate or delete them, then save. Free, no sign-up. ${privateNote}`,
    also: ["rearrange pdf pages", "reorder pdf pages", "sort pdf pages"],
  },
  "combine-reorder-pdf": {
    keyword: "combine and reorder pdf",
    title: "Combine and Reorder PDF Pages Free",
    description: `Combine and reorder pages from several PDFs on one board, in any order you like. Free, no sign-up, no watermark. ${privateNote}`,
    also: ["visually combine pdf", "mix pdf pages", "merge pdf pages in any order"],
  },
  "alternate-mix-pdf": {
    keyword: "alternate pdf pages",
    title: "Alternate and Mix PDF Pages Free",
    description: `Alternate pages from two or more PDFs, such as front and back scans, into one file. Free, no sign-up. ${privateNote}`,
    also: ["interleave pdf", "collate pdf", "merge odd and even pages"],
  },
  "split-pdf-by-bookmarks": {
    keyword: "split pdf by bookmarks",
    title: "Split PDF by Bookmarks or Chapters Free",
    description: `Split a PDF by bookmarks into one file per chapter or section, named after the outline. Free. ${privateNote}`,
    also: ["split pdf by chapters", "split pdf by outline"],
  },
  "split-pdf-by-size": {
    keyword: "split pdf by size",
    title: "Split PDF by File Size Online Free",
    description: `Split a large PDF into parts no bigger than the size you set, ready to email or upload. Free. ${privateNote}`,
    also: ["split large pdf", "split pdf for email", "reduce pdf size by splitting"],
  },
  "split-pdf-by-text": {
    keyword: "split pdf by text",
    title: "Split PDF by Text Content Free",
    description: `Split a PDF whenever chosen text changes on the page, such as an invoice number or a name. Free. ${privateNote}`,
    also: ["split pdf by keyword", "split pdf by content"],
  },
  "split-pdf-in-half": {
    keyword: "split pdf pages in half",
    title: "Split PDF Pages in Half Online Free",
    description: `Split PDF pages in half: cut double-page scans down the middle into single pages. Free, no sign-up. ${privateNote}`,
    also: ["split scanned pages", "cut pdf page in half", "split two page pdf"],
  },
  "crop-pdf": {
    keyword: "crop pdf",
    title: "Crop PDF: Trim Margins Online Free",
    description: `Crop PDF pages to trim white margins or select an area, on one page or all of them. Free, no sign-up. ${privateNote}`,
    also: ["trim pdf margins", "crop pdf pages", "pdf cropper"],
  },
  "resize-pdf": {
    keyword: "resize pdf",
    title: "Resize PDF Pages: A4, Letter and More Free",
    description: `Resize PDF pages to A4, Letter or any size, or add margins around them. Free, no sign-up. ${privateNote}`,
    also: ["change pdf page size", "pdf to a4", "scale pdf"],
  },
  "flip-pdf": {
    keyword: "flip pdf",
    title: "Flip PDF Pages Horizontally or Vertically",
    description: `Flip PDF pages horizontally or vertically to mirror them, on all pages or a few. Free, no sign-up. ${privateNote}`,
    also: ["mirror pdf", "flip pdf horizontally", "mirror pdf pages"],
  },
  "n-up-pdf": {
    keyword: "n-up pdf",
    title: "N-up PDF: Several Pages per Sheet Free",
    description: `Put 2, 4 or more PDF pages on each sheet to save paper when printing. Free, no sign-up. ${privateNote}`,
    also: ["multiple pages per sheet pdf", "2 pages per sheet pdf", "pdf imposition"],
  },
  "pdf-editor": {
    keyword: "pdf editor",
    title: "Free PDF Editor Online: Edit PDF Text",
    description: `Free online PDF editor: change existing text, add text, images, shapes and links, and sign. No watermark. ${privateNote}`,
    also: ["edit pdf", "edit pdf text", "online pdf editor", "add text to pdf", "write on pdf"],
  },
  "sign-pdf": {
    keyword: "sign pdf",
    title: "Sign PDF Online Free: Fill and Sign Forms",
    description: `Sign PDF documents and fill in forms online for free. Draw, type or upload your signature. No sign-up. ${privateNote}`,
    also: ["fill and sign pdf", "electronic signature", "fill pdf form", "esign pdf"],
  },
  "create-fillable-pdf": {
    keyword: "create fillable pdf",
    title: "Create Fillable PDF Forms Online Free",
    description: `Create a fillable PDF form from any PDF: add text fields, checkboxes, dropdowns and signature boxes. ${privateNote}`,
    also: ["pdf form creator", "make pdf fillable", "add form fields to pdf"],
  },
  "watermark-pdf": {
    keyword: "watermark pdf",
    title: "Add Watermark to PDF Online Free",
    description: `Add a text or image watermark to PDF pages and set its position, size and opacity. Free, no sign-up. ${privateNote}`,
    also: ["add watermark to pdf", "pdf stamp", "confidential watermark pdf"],
  },
  "add-page-numbers": {
    keyword: "add page numbers to pdf",
    title: "Add Page Numbers to PDF Online Free",
    description: `Add page numbers to a PDF and choose position, format and starting number. Free, no sign-up, no watermark. ${privateNote}`,
    also: ["number pdf pages", "pdf page numbering", "insert page numbers pdf"],
  },
  "pdf-header-footer": {
    keyword: "add header and footer to pdf",
    title: "Add Header and Footer to PDF Online Free",
    description: `Add a header and footer with text, dates or page numbers to every PDF page. Free, no sign-up. ${privateNote}`,
    also: ["pdf header", "pdf footer", "add text to top of pdf"],
  },
  "bates-numbering": {
    keyword: "bates numbering pdf",
    title: "Bates Numbering for PDF Online Free",
    description: `Bates numbering for one or many PDFs, with your prefix, start number and position. Free. ${privateNote}`,
    also: ["bates stamp pdf", "legal page numbering", "bates numbering online"],
  },
  "edit-pdf-metadata": {
    keyword: "edit pdf metadata",
    title: "Edit PDF Metadata: Title, Author, Keywords",
    description: `Edit PDF metadata such as title, author, subject and keywords, or clear it before sharing. Free. ${privateNote}`,
    also: ["change pdf title", "remove pdf metadata", "pdf properties editor"],
  },
  "pdf-bookmarks": {
    keyword: "add bookmarks to pdf",
    title: "Add and Edit PDF Bookmarks Online Free",
    description: `Add, edit and nest PDF bookmarks to build a clickable table of contents. Free, no sign-up. ${privateNote}`,
    also: ["pdf bookmarks", "edit pdf outline", "pdf table of contents"],
  },
  "rename-pdf": {
    keyword: "rename pdf by content",
    title: "Rename PDF Files by Content Online Free",
    description: `Rename PDF files by their content, using text found inside them such as invoice numbers. Free. ${privateNote}`,
    also: ["bulk rename pdf", "rename pdf files", "auto rename pdf"],
  },
  "remove-pdf-annotations": {
    keyword: "remove annotations from pdf",
    title: "Remove Annotations and Comments from PDF",
    description: `Remove comments, highlights, drawings and other annotations from a PDF in one go. Free, no sign-up. ${privateNote}`,
    also: ["delete pdf comments", "remove highlights from pdf", "remove markup pdf"],
  },
  "flatten-pdf": {
    keyword: "flatten pdf",
    title: "Flatten PDF: Lock Forms and Annotations",
    description: `Flatten a PDF so form fields and annotations become part of the page and can't be changed. Free. ${privateNote}`,
    also: ["flatten pdf form", "make pdf non editable", "flatten pdf online"],
  },
  "compress-pdf": {
    keyword: "compress pdf",
    title: "Compress PDF: Reduce PDF File Size Free",
    description: `Compress PDF files to reduce their size while keeping them sharp. Free, no sign-up, no watermark. ${serverNote}`,
    also: ["reduce pdf size", "shrink pdf", "pdf compressor", "compress pdf to 100kb", "make pdf smaller"],
  },
  "grayscale-pdf": {
    keyword: "grayscale pdf",
    title: "Convert PDF to Grayscale Online Free",
    description: `Convert a color PDF to grayscale or black and white for cheaper printing. Free, no sign-up, no watermark. ${serverNote}`,
    also: ["pdf to black and white", "greyscale pdf", "remove color from pdf"],
  },
  "repair-pdf": {
    keyword: "repair pdf",
    title: "Repair PDF: Fix Damaged PDF Files Free",
    description: `Repair a corrupt or damaged PDF and recover as much of its content as possible. Free, no sign-up. ${serverNote}`,
    also: ["fix corrupted pdf", "recover pdf", "pdf won't open"],
  },
  "protect-pdf": {
    keyword: "password protect pdf",
    title: "Password Protect PDF: Encrypt with AES",
    description: `Password protect a PDF with strong AES encryption and choose who can print, copy or edit it. Free, no sign-up. ${serverNote}`,
    also: ["encrypt pdf", "lock pdf", "add password to pdf", "protect pdf"],
  },
  "unlock-pdf": {
    keyword: "unlock pdf",
    title: "Unlock PDF: Remove PDF Password Online",
    description: `Unlock a PDF: remove the password and restrictions from a file you have the right to open. Free, no sign-up. ${serverNote}`,
    also: ["remove password from pdf", "pdf password remover", "decrypt pdf"],
  },
  "pdf-to-word": {
    keyword: "pdf to word",
    title: "PDF to Word Converter: Editable DOCX Free",
    description: `Convert PDF to Word and get an editable DOCX that keeps your layout, fonts and tables. Free, no sign-up. ${serverNote}`,
    also: ["pdf to docx", "convert pdf to word", "pdf to word converter", "pdf to doc"],
  },
  "pdf-to-excel": {
    keyword: "pdf to excel",
    title: "PDF to Excel Converter: Tables to XLSX",
    description: `Convert PDF tables to Excel XLSX or CSV with rows and columns kept in place. Free, no sign-up. ${serverNote}`,
    also: ["pdf to xlsx", "convert pdf to excel", "pdf table to excel", "pdf to csv"],
  },
  "pdf-to-ppt": {
    keyword: "pdf to ppt",
    title: "PDF to PPT: Convert PDF to PowerPoint Free",
    description: `Convert PDF to PPT: PowerPoint slides you can edit, one slide per page. Free, no sign-up, no watermark. ${serverNote}`,
    also: ["pdf to pptx", "pdf to powerpoint", "convert pdf to slides"],
  },
  "pdf-to-jpg": {
    keyword: "pdf to jpg",
    title: "PDF to JPG: Convert PDF Pages to Images",
    description: `Convert PDF pages to high-quality JPG, PNG or TIFF images, or pick just the pages you need. Free. ${privateNote}`,
    also: ["pdf to image", "pdf to png", "convert pdf to jpg", "pdf to jpeg"],
  },
  "pdf-to-text": {
    keyword: "pdf to text",
    title: "PDF to Text: Extract Text from PDF Free",
    description: `Extract all text from a PDF into a plain TXT file you can copy, search or edit. Free, no sign-up. ${privateNote}`,
    also: ["extract text from pdf", "pdf to txt", "copy text from pdf"],
  },
  "extract-images": {
    keyword: "extract images from pdf",
    title: "Extract Images from PDF Online Free",
    description: `Extract images from a PDF at their original quality and download them as one ZIP. Free. ${privateNote}`,
    also: ["save images from pdf", "pdf image extractor", "get pictures from pdf"],
  },
  "jpg-to-pdf": {
    keyword: "jpg to pdf",
    title: "JPG to PDF: Convert Images to PDF Free",
    description: `Convert JPG, PNG and other images to PDF, in your order, with page size and margins you choose. Free. ${privateNote}`,
    also: ["image to pdf", "png to pdf", "photo to pdf", "convert jpg to pdf", "jpeg to pdf"],
  },
  "word-to-pdf": {
    keyword: "word to pdf",
    title: "Word to PDF Converter: DOCX to PDF Free",
    description: `Convert Word DOC and DOCX files to PDF that look exactly like the original. Free, no sign-up, no watermark. ${serverNote}`,
    also: ["docx to pdf", "doc to pdf", "convert word to pdf"],
  },
  "html-to-pdf": {
    keyword: "html to pdf",
    title: "HTML to PDF: Save Web Pages as PDF Free",
    description: `Convert HTML files or web pages to PDF with links, images and styles kept. Free, no sign-up, no watermark. ${serverNote}`,
    also: ["web page to pdf", "url to pdf", "save website as pdf"],
  },
  "ocr-pdf": {
    keyword: "ocr pdf",
    title: "OCR PDF: Make Scanned PDFs Searchable Free",
    description: `OCR scanned PDFs to make their text searchable and copyable, in many languages. Free, no sign-up, no watermark. Small files stay in your browser.`,
    also: ["searchable pdf", "pdf ocr online", "scanned pdf to text", "image to text pdf"],
  },
  "deskew-pdf": {
    keyword: "deskew pdf",
    title: "Deskew PDF: Straighten Scanned Pages Free",
    description: `Deskew PDF scans: straighten tilted pages automatically so they read and print straight. Free, no sign-up. ${serverNote}`,
    also: ["straighten pdf", "fix skewed scan", "auto rotate scanned pdf"],
  },
  workflows: {
    keyword: "pdf workflow",
    title: "PDF Workflows: Chain PDF Tools in One Go",
    description: `Chain PDF tools into a workflow, such as merge, compress and add page numbers, and run them in one go. Free. ${privateNote}`,
    also: ["batch pdf processing", "automate pdf tasks", "pdf automation"],
  },
};

export const seoContent: Record<string, ToolSeoContent> = {
  "merge-pdf": {
    howTo: "How to merge PDF files",
    steps: [
      { name: "Add your files", text: "Drop PDFs and images on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Put them in order", text: "Drag the files, or switch to Pages to move, rotate, remove or add single pages." },
      { name: "Merge and save", text: "Pick any options, select Merge PDFs and download one combined PDF." },
    ],
    faq: [
      {
        q: "How do I combine PDF files into one?",
        a: "Add the files, put them in the order you want, then select Merge PDFs and download the result. You get one PDF with every page in that order.",
      },
      {
        q: "Can I change the order of pages, not just files?",
        a: "Yes. The Pages view shows every page. Drag pages between files, rotate or remove them, or add blank pages and pages from another file.",
      },
      {
        q: "Can I merge images with PDFs?",
        a: "Yes. JPG, PNG, GIF, BMP, WebP and TIFF images become pages of the merged PDF, each centred on its own page.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Merging runs in your browser, so your files stay on your device.",
      },
      {
        q: "Are bookmarks and form fields kept?",
        a: "Bookmarks are kept by default, and you can also add one per file or remove them. Form fields are kept, with repeated names renamed; you can also share, flatten or remove them.",
      },
      {
        q: "Can I add a table of contents?",
        a: "Yes. Choose a contents page with file names or document titles. It links to the first page of each file.",
      },
      {
        q: "How many files can I merge at once?",
        a: "Up to 50 files at a time, up to 100 MB each, 500 MB and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["split-pdf", "organize-pdf", "combine-reorder-pdf", "compress-pdf", "jpg-to-pdf", "rotate-pdf"],
  },
  "rotate-pdf": {
    howTo: "How to rotate a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Rotate the pages", text: "Turn all, odd or even pages left or right, or use the arrows on a single page." },
      { name: "Save", text: "Select Rotate PDF and download the result. Several files come back as one ZIP." },
    ],
    faq: [
      {
        q: "How do I rotate a PDF and save it permanently?",
        a: "Rotate the pages here, then select Rotate PDF and download the file. The new orientation is saved in the PDF itself, so it opens the same way in every viewer.",
      },
      {
        q: "Does rotating a PDF reduce its quality?",
        a: "No. Only the page orientation setting changes. Text, images and fonts are not re-rendered or recompressed.",
      },
      {
        q: "Can I rotate just one page?",
        a: "Yes. Each page has its own rotate buttons, and you can also turn only the odd or the even pages.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Rotation runs in your browser, so your files stay on your device.",
      },
      {
        q: "Can I rotate a password-protected PDF?",
        a: "Yes. Enter the password when asked and the file is rotated in your browser.",
      },
      {
        q: "How many files can I rotate at once?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["organize-pdf", "delete-pdf-pages", "merge-pdf", "split-pdf", "crop-pdf", "compress-pdf"],
  },
  "organize-pdf": {
    howTo: "How to organize PDF pages",
    steps: [
      { name: "Add your files", text: "Drop one or more PDFs or images on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Arrange the pages", text: "Drag pages into order, rotate, duplicate or remove them, and add blank pages or pages from another file." },
      { name: "Save", text: "Select Save PDF and download one PDF with the pages in the order you set." },
    ],
    faq: [
      {
        q: "How do I rearrange pages in a PDF?",
        a: "Add the PDF and drag each page to its new place. You can also select several pages and move them together, or move a page to a numbered position.",
      },
      {
        q: "Can I reverse the page order?",
        a: "Yes. Sort, then Reverse order turns the whole document around. With pages selected, only those pages swap places, end for end.",
      },
      {
        q: "My scanner made all the fronts, then all the backs. Can I fix the order?",
        a: "Yes. Sort, then Two-sided scan order puts a scan of all fronts followed by all backs in reverse into the right order: front 1, back 1, front 2 and so on.",
      },
      {
        q: "Can I undo a change?",
        a: "Yes. Undo and Redo step back and forward through every change, and Ctrl+Z works too.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Organizing runs in your browser, so your files stay on your device.",
      },
      {
        q: "Are bookmarks kept?",
        a: "Yes. Bookmarks follow their pages when you move them, and the links inside the document keep working.",
      },
      {
        q: "How many pages can I organize?",
        a: "Up to 50 files at a time, up to 100 MB each, 500 MB and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["merge-pdf", "combine-reorder-pdf", "delete-pdf-pages", "rotate-pdf", "alternate-mix-pdf", "split-pdf"],
  },
  "combine-reorder-pdf": {
    howTo: "How to combine and reorder PDF pages",
    steps: [
      { name: "Add your files", text: "Drop PDFs and images on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Reorder the pages", text: "Every page of every file shows at once. Drag pages between files, rotate or remove them." },
      { name: "Combine and save", text: "Pick any options, select Merge PDFs and download one PDF with your pages in order." },
    ],
    faq: [
      {
        q: "How do I combine pages from different PDFs in any order?",
        a: "Add the files and drag their pages into the order you want. Pages from different files can sit side by side, then Merge PDFs saves them as one document.",
      },
      {
        q: "Can I take only some pages from a file?",
        a: "Yes. Remove the pages you don't need, or use Add pages to pick just a few pages from another file.",
      },
      {
        q: "Can I undo a change?",
        a: "Yes. Undo and Redo step back and forward through every change, and Ctrl+Z works too.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Everything runs in your browser, so your files stay on your device.",
      },
      {
        q: "Can I add images too?",
        a: "Yes. JPG, PNG, GIF, BMP, WebP and TIFF images become pages, each on its own page.",
      },
      {
        q: "How many files can I combine?",
        a: "Up to 50 files at a time, up to 100 MB each, 500 MB and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["merge-pdf", "organize-pdf", "alternate-mix-pdf", "split-pdf", "jpg-to-pdf", "rotate-pdf"],
  },
  "alternate-mix-pdf": {
    howTo: "How to alternate pages from two PDFs",
    steps: [
      { name: "Add two or more files", text: "Drop the PDFs or images on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Set each file", text: "Put the files in order, read any of them in reverse, and choose how many pages each gives per turn." },
      { name: "Mix and save", text: "Check the result in the Pages view, select Mix PDFs and download one PDF." },
    ],
    faq: [
      {
        q: "How do I combine odd and even pages into one PDF?",
        a: "Add the file with the odd pages first and the file with the even pages second, then select Mix PDFs. The pages alternate: 1 from the first file, 1 from the second, and so on.",
      },
      {
        q: "My back pages were scanned in reverse. What do I do?",
        a: "Set that file to Reverse. It is then read from its last page to its first, so the pages still come out in order.",
      },
      {
        q: "Can I take more than one page at a time from a file?",
        a: "Yes. Pages per turn sets how many pages each file gives before the next file's turn. When one file runs out, the rest of the other follows at the end.",
      },
      {
        q: "Can I put the same page between every group, like a separator?",
        a: "Yes. A one-page file has a Repeat switch, on by default: its page then comes back every round, but never after the last real page.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Mixing runs in your browser, so your files stay on your device.",
      },
      {
        q: "How many files can I mix?",
        a: "Up to 50 files at a time, up to 100 MB each, 500 MB and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["merge-pdf", "organize-pdf", "combine-reorder-pdf", "split-pdf", "rotate-pdf"],
  },
};

/** Page title for a tool: `${title} | BerryPDF`. */
export const toolPageTitle = (slug: string) => `${toolSeo[slug]?.title ?? slug} | BerryPDF`;
