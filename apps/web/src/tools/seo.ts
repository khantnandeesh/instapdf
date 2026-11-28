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
  "edit-pdf": {
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
    description: `Convert a color PDF to grayscale for black and white printing. Text stays sharp and selectable. Free. ${privateNote}`,
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
    title: "Password Protect PDF: Encrypt with AES-256",
    description: `Password protect a PDF with AES-256 encryption and choose who can print, copy or edit it. Free, no sign-up. ${privateNote}`,
    also: ["encrypt pdf", "lock pdf", "add password to pdf", "protect pdf"],
  },
  "unlock-pdf": {
    keyword: "unlock pdf",
    title: "Unlock PDF: Remove PDF Password Online",
    description: `Unlock a PDF: remove the password and restrictions from a file you have the right to open. Free, no sign-up. ${privateNote}`,
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
  "split-pdf": {
    howTo: "How to split a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Choose how to split", text: "Split every page, every few pages, into spreads, or into your own ranges such as 1-4, 5-10." },
      { name: "Check the parts", text: "The pages show each part and every cut. Click the scissors between two pages to add or remove a cut." },
      { name: "Download", text: "Select Split and download the parts. Several parts come back as one ZIP, and each part can be saved on its own." },
    ],
    faq: [
      {
        q: "How do I split a PDF into separate files?",
        a: "Add the PDF, choose Every page, Every N pages, Spreads or Custom ranges, then select Split. Each part becomes its own PDF, and several parts download together as a ZIP.",
      },
      {
        q: "Can I choose exactly where to split?",
        a: "Yes. Type ranges such as 1-4, 5-10 (one file per range), or click the scissors between two pages. You can also rename each part under More options.",
      },
      {
        q: "Does splitting keep bookmarks, links and quality?",
        a: "Pages are copied, not re-rendered, so text, images and fonts stay exactly as they were. Each part keeps the bookmarks that point into it, unless you turn on Remove bookmarks.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Splitting runs in your browser, so your files stay on your device.",
      },
      {
        q: "Can I split a password-protected PDF?",
        a: "Yes. Enter the password when asked. The parts are saved without a password.",
      },
      {
        q: "How large a PDF can I split?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["extract-pdf-pages", "delete-pdf-pages", "merge-pdf", "organize-pdf", "rotate-pdf", "compress-pdf"],
  },
  "pdf-to-jpg": {
    howTo: "How to convert a PDF to JPG",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Choose the image", text: "Pick JPG, PNG or TIFF and a resolution from Small (75 dpi) to Print (300 dpi). Click pages to convert only those." },
      { name: "Download", text: "Select Convert. One page downloads as an image, several as a ZIP with one image per page." },
    ],
    faq: [
      {
        q: "How do I convert a PDF to JPG?",
        a: "Add the PDF, keep JPG selected and choose Convert. Every page becomes a JPG image. To convert a few pages only, click them first.",
      },
      {
        q: "Can I save a PDF as PNG or TIFF instead?",
        a: "Yes. Pick PNG for sharp text and drawings with no compression marks, or TIFF for print and archive work. TIFF can also hold all pages in one file.",
      },
      {
        q: "Which resolution should I choose?",
        a: "Medium (150 dpi) is sharp on screen and keeps files small. Use Large (220 dpi) to zoom in, and Print (300 dpi) for printing. Small (75 dpi) is for previews and email.",
      },
      {
        q: "How are the images named?",
        a: "After the PDF and the page number, such as report-01.jpg, report-02.jpg, so they sort in page order.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The pages are drawn in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a page or size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["jpg-to-pdf", "extract-images", "pdf-to-text", "extract-pdf-pages", "split-pdf", "compress-pdf"],
  },
  "jpg-to-pdf": {
    howTo: "How to convert JPG to PDF",
    steps: [
      { name: "Add your images", text: "Drop JPG, PNG or other images on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Put them in order", text: "Drag the images into page order, and rotate any that are sideways." },
      { name: "Choose the page", text: "Pick a page size such as A4 or Letter, or Fit to image, then a margin and an orientation." },
      { name: "Download", text: "Select Convert to PDF and download one PDF with a page per image." },
    ],
    faq: [
      {
        q: "How do I convert a JPG to PDF?",
        a: "Add the image and select Convert to PDF. To combine several images, add them all, drag them into order and convert: each image becomes one page.",
      },
      {
        q: "Which image types can I convert?",
        a: "JPG, PNG, GIF, BMP, WebP and TIFF. A TIFF with several pages gives one PDF page per page.",
      },
      {
        q: "Will my photos lose quality?",
        a: "No. JPG and PNG images are placed in the PDF as they are, without being compressed again.",
      },
      {
        q: "Can I choose the page size and margins?",
        a: "Yes. Use A4, A3, A5, Letter or Legal, or Fit to image so the page is exactly the size of the picture. Margins can be none, small or large.",
      },
      {
        q: "Are my images uploaded?",
        a: "No. The PDF is made in your browser, so your images stay on your device.",
      },
      {
        q: "Is there a limit?",
        a: "Up to 50 images at a time, up to 100 MB each. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["pdf-to-jpg", "merge-pdf", "organize-pdf", "compress-pdf", "extract-images", "rotate-pdf"],
  },
  "protect-pdf": {
    howTo: "How to password protect a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Choose a password", text: "Type the password people will need to open the file. Optionally switch off printing, copying or editing." },
      { name: "Download", text: "Select Protect PDF and download the encrypted copy. Your original stays as it is." },
    ],
    faq: [
      {
        q: "How do I add a password to a PDF?",
        a: "Add the PDF, type a password and select Protect PDF. The copy you download asks for that password every time it is opened.",
      },
      {
        q: "How strong is the encryption?",
        a: "The file is encrypted with AES-256, the strongest encryption the PDF standard has. Its strength still depends on your password, so prefer a long one.",
      },
      {
        q: "Is my password sent anywhere?",
        a: "No. The file is encrypted in your browser. Neither the PDF nor the password leaves your device, and the password is not saved.",
      },
      {
        q: "Can I stop people printing or copying without a password to open?",
        a: "Yes. Leave the password empty and switch off what people may do. The file opens freely and PDF readers apply the limits. Some programs ignore them, so use a password to open for anything confidential.",
      },
      {
        q: "What if I forget the password?",
        a: "It cannot be recovered, by us or anyone. Keep the original file or store the password somewhere safe.",
      },
      {
        q: "Will the protected PDF open everywhere?",
        a: "Yes, in every current PDF reader, on computers, in browsers and on phones. Very old readers (from before 2008) cannot open AES-256 files.",
      },
    ],
    related: ["unlock-pdf", "merge-pdf", "compress-pdf", "edit-pdf", "split-pdf", "organize-pdf"],
  },
  "unlock-pdf": {
    howTo: "How to remove a password from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Enter the password", text: "If the file needs a password to open, type it once. Files that only limit printing, copying or editing need none." },
      { name: "Download", text: "Select Unlock PDF and download a copy with no password and no restrictions." },
    ],
    faq: [
      {
        q: "How do I remove the password from a PDF?",
        a: "Add the PDF, enter its password when asked and select Unlock PDF. The copy you download opens without a password.",
      },
      {
        q: "Can it open a PDF if I forgot the password?",
        a: "No. You need the password that opens the file. We do not crack or guess passwords.",
      },
      {
        q: "Does it remove printing, copying and editing restrictions?",
        a: "Yes. The unlocked copy has no restrictions. Only unlock files you have the right to change.",
      },
      {
        q: "Is my file or password uploaded?",
        a: "No. The file is unlocked in your browser. Neither the PDF nor the password leaves your device.",
      },
      {
        q: "Does unlocking change the content?",
        a: "No. Pages, text, images, bookmarks and form fields stay as they are. Only the encryption is removed.",
      },
      {
        q: "Is there a page or size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["protect-pdf", "merge-pdf", "edit-pdf", "pdf-to-text", "extract-images", "split-pdf"],
  },
  "extract-images": {
    howTo: "How to extract images from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Pick pages, if you like", text: "Click pages to take the images of only those. With none picked, every page is searched." },
      { name: "Download", text: "Select Extract images. One image downloads as itself, several as a ZIP." },
    ],
    faq: [
      {
        q: "How do I save the pictures from a PDF?",
        a: "Add the PDF and select Extract images. Every picture stored in the file is saved once, named after its page.",
      },
      {
        q: "Do the images lose quality?",
        a: "No. A photo the PDF stores as a JPEG is saved as that same JPEG, untouched. Every other image is saved as a PNG, which loses nothing and keeps transparency.",
      },
      {
        q: "Why were no images found?",
        a: "Text, lines and charts drawn in a PDF are not images. To save a whole page as a picture, use PDF to image.",
      },
      {
        q: "An image appears on every page. Do I get it many times?",
        a: "No. An image a file reuses, such as a logo, is saved once.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The images are read in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a page or size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["pdf-to-jpg", "pdf-to-text", "jpg-to-pdf", "extract-pdf-pages", "compress-pdf", "split-pdf"],
  },
  "pdf-to-text": {
    howTo: "How to extract text from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Extract", text: "Select Extract text. The text of every page is read in order." },
      { name: "Copy or download", text: "Copy the text to the clipboard, or download it as a plain .txt file." },
    ],
    faq: [
      {
        q: "How do I copy all the text out of a PDF?",
        a: "Add the PDF and select Extract text. You can then copy the whole text in one click or download it as a .txt file.",
      },
      {
        q: "Does it keep line breaks and paragraphs?",
        a: "Yes. Lines end where they end on the page, paragraphs are separated by a blank line, and pages follow each other in order.",
      },
      {
        q: "Why is there no text in my PDF?",
        a: "Scanned PDFs are pictures of pages, so there is no text to copy out. They need OCR first, which turns the pictures into text.",
      },
      {
        q: "Does it work with other languages?",
        a: "Yes. The text file is saved as UTF-8, so accents, Hindi, Arabic, Chinese and other scripts come through as they are stored in the PDF.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The text is read in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a page or size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["pdf-to-jpg", "extract-images", "ocr-pdf", "extract-pdf-pages", "split-pdf", "pdf-to-word"],
  },
  "extract-pdf-pages": {
    howTo: "How to extract pages from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Pick the pages", text: "Click the pages to keep, pick Odd or Even, or type ranges such as 1-3, 5, 8-last." },
      { name: "Download", text: "Select Extract and download a new PDF with only those pages, in their original order." },
    ],
    faq: [
      {
        q: "How do I extract pages from a PDF?",
        a: "Add the PDF, click the pages you want or type them, for example 2-5, 9, then select Extract. You get a new PDF with only those pages.",
      },
      {
        q: "Can I select a range of pages quickly?",
        a: "Yes. Click one page and Shift+click another to pick everything between them, or type a range. The words odd, even and last work too.",
      },
      {
        q: "Does extracting pages reduce quality?",
        a: "No. Pages are copied, not re-rendered. Bookmarks that point to a kept page come along, unless you turn on Remove bookmarks.",
      },
      {
        q: "Can I extract pages from several PDFs at once?",
        a: "Yes. The same pages are taken from every file, or you can click pages per file. Each file gives its own PDF, and they download together as a ZIP.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Extracting runs in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a page or size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["split-pdf", "delete-pdf-pages", "organize-pdf", "merge-pdf", "rotate-pdf"],
  },
  "split-pdf-by-bookmarks": {
    howTo: "How to split a PDF by bookmarks",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF that has bookmarks on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Pick the bookmark level", text: "Level 1 gives one file per chapter; a deeper level gives one per section. The pages show where each file starts, and you can move any split." },
      { name: "Download", text: "Select Split and download the files, each named after its bookmark." },
    ],
    faq: [
      {
        q: "How do I split a PDF into chapters?",
        a: "Add the PDF and keep Level 1. A new file starts at every top-level bookmark, so each chapter becomes its own PDF, named after the chapter.",
      },
      {
        q: "Can I split at only some bookmarks?",
        a: "Yes. Type part of a title, such as Chapter or Appendix, and only bookmarks with that text start a new file. You can also click between two pages to add or remove a split.",
      },
      {
        q: "What happens to pages before the first bookmark?",
        a: "They are kept as a file of their own, so no page is lost.",
      },
      {
        q: "What if my PDF has no bookmarks?",
        a: "The page tells you so. Use Split to cut by page ranges, or every few pages, instead.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Splitting runs in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["split-pdf", "extract-pdf-pages", "organize-pdf", "merge-pdf", "delete-pdf-pages", "compress-pdf"],
  },
  "split-pdf-by-size": {
    howTo: "How to split a PDF by file size",
    steps: [
      { name: "Add your PDF", text: "Drop a large PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Set the largest file size", text: "Type the limit in MB or KB, for example 10 MB for an email attachment." },
      { name: "Download", text: "Select Split and download the parts. Each one is under your limit and the pages stay in order." },
    ],
    faq: [
      {
        q: "How do I split a PDF into smaller files for email?",
        a: "Add the PDF, set the largest size your email allows, such as 10 or 20 MB, and select Split. You get the fewest files that each stay under that size.",
      },
      {
        q: "Does splitting by size lower the quality?",
        a: "No. Pages are copied as they are, with the same text, images and fonts. Only the number of pages per file changes.",
      },
      {
        q: "What if a single page is bigger than my limit?",
        a: "That page becomes a file of its own and the result tells you which page it is. Compressing the PDF first can bring it under the limit.",
      },
      {
        q: "Will the parts be the same size?",
        a: "Each part takes as many pages as fit under the limit, so most parts are close to it and the last one is usually smaller.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Splitting runs in your browser, so even very large files stay on your device.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["compress-pdf", "split-pdf", "split-pdf-by-bookmarks", "extract-pdf-pages", "merge-pdf", "delete-pdf-pages"],
  },
  "split-pdf-by-text": {
    howTo: "How to split a PDF by text",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, such as a batch of invoices or statements, or choose it from your device. Nothing is uploaded." },
      { name: "Mark the text that changes", text: "Select Choose text area and drag a box around the text that is different in each document, such as an invoice number or a customer name." },
      { name: "Download", text: "The pages show where each file starts. Select Split and download the files, each named after its text." },
    ],
    faq: [
      {
        q: "How do I split a PDF of invoices into one file per invoice?",
        a: "Add the PDF, select Choose text area and drag a box around the invoice number. A new file starts on every page where that number changes, so each invoice becomes its own PDF.",
      },
      {
        q: "What happens to pages where the box has no text?",
        a: "They stay with the document before them. A second or third page with no number in that spot is kept with its first page.",
      },
      {
        q: "Does it work on scanned PDFs?",
        a: "The pages need real text. A scan is a picture of text, so run OCR on it first; after that the text can be read and the PDF split.",
      },
      {
        q: "Can I change where the files start?",
        a: "Yes. The lines between pages show each split, and you can click between two pages to add or remove one before you download.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The text is read and the PDF is split in your browser, on your device. The file never leaves it.",
      },
    ],
    related: ["split-pdf", "split-pdf-by-bookmarks", "split-pdf-by-size", "extract-pdf-pages", "organize-pdf", "merge-pdf"],
  },
  "crop-pdf": {
    howTo: "How to crop a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Trim the margins or choose an area", text: "Trim margins finds the white edges of every page for you. Choose area lets you drag a box around the part to keep." },
      { name: "Download", text: "The pages show what will be left. Select Crop PDF and download the file." },
    ],
    faq: [
      {
        q: "How do I remove the white margins from a PDF?",
        a: "Add the PDF and keep Trim margins. Every page is measured and the white edges are cut away, so the text fills the page. It helps most on phones and e-readers.",
      },
      {
        q: "Can I crop every page to the same size?",
        a: "Yes. Same crop on every page is on to begin with: one box is used that keeps the content of all pages. Switch it off in More options to trim each page as far as it goes.",
      },
      {
        q: "Is the cropped part deleted from the file?",
        a: "Cropping changes what a page shows and prints. The part outside the box is hidden, not erased, so do not use cropping to hide private details.",
      },
      {
        q: "Does cropping lower the quality?",
        a: "No. Nothing is redrawn: text stays sharp and selectable, and pictures keep their resolution.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The PDF is measured and cropped in your browser, on your device. The file never leaves it.",
      },
    ],
    related: ["resize-pdf", "split-pdf-in-half", "rotate-pdf", "delete-pdf-pages", "organize-pdf", "compress-pdf"],
  },
  "resize-pdf": {
    howTo: "How to resize PDF pages",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Pick a page size or margins", text: "Choose a paper size such as A4 or Letter, or switch to Margins and type how much space to add around each page." },
      { name: "Download", text: "Select Resize and download the file. Click pages first if only some of them should change." },
    ],
    faq: [
      {
        q: "How do I change a PDF from Letter to A4?",
        a: "Add the PDF, keep Page size and pick A4. Each page is scaled to fit the new paper and centred, so nothing is cut off.",
      },
      {
        q: "How do I add margins to a PDF?",
        a: "Switch to Margins and type a size in millimetres or inches. The page grows by that much on every side and the content keeps its size. More options lets you set each side on its own.",
      },
      {
        q: "Does resizing stretch the page?",
        a: "No. The content keeps its proportions. When the new paper has a different shape, the page is centred with space on two sides.",
      },
      {
        q: "What happens to pages that lie on their side?",
        a: "A page that is wider than tall gets the paper on its side too, so a landscape slide stays landscape.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["crop-pdf", "n-up-pdf", "rotate-pdf", "compress-pdf", "organize-pdf", "merge-pdf"],
  },
  "flip-pdf": {
    howTo: "How to flip a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Choose the direction", text: "Left to right mirrors each page like a reflection. Top to bottom turns it over the other way. The pages on screen show the result." },
      { name: "Download", text: "Select Flip and download the mirrored file. Click pages first to flip only those." },
    ],
    faq: [
      {
        q: "How do I mirror a PDF for iron-on transfer printing?",
        a: "Add the PDF, keep Left to right and select Flip. The text reads backwards on paper and the right way round once it is pressed onto fabric.",
      },
      {
        q: "What is the difference between flipping and rotating?",
        a: "Flipping mirrors the page, so text reads backwards. Rotating turns the page in quarter turns and the text stays readable. To turn pages, use Rotate.",
      },
      {
        q: "Can I flip only some pages?",
        a: "Yes. Click the pages to flip; the others stay as they are. With no page picked, every page is flipped.",
      },
      {
        q: "Does flipping lower the quality?",
        a: "No. The page is mirrored as it is, not turned into a picture, so text and drawings stay sharp at any zoom.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The PDF is flipped in your browser, on your device. The file never leaves it.",
      },
    ],
    related: ["rotate-pdf", "crop-pdf", "resize-pdf", "organize-pdf", "n-up-pdf", "merge-pdf"],
  },
  "add-page-numbers": {
    howTo: "How to add page numbers to a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Choose where and how", text: "Pick a corner or the middle of the top or bottom edge, a format such as Page 1 of 9, and the first number. The pages on screen show the numbers." },
      { name: "Download", text: "Select Add page numbers and download the numbered file." },
    ],
    faq: [
      {
        q: "How do I start numbering on the second page?",
        a: "Click the pages that should get a number and leave the cover out. Numbering starts at the first number on the first page you picked.",
      },
      {
        q: "Can I start at a number other than 1?",
        a: "Yes. Set First number to the number the first page should get, for example 5 for a chapter that follows page 4.",
      },
      {
        q: "Which formats can I use?",
        a: "Plain numbers, Page 1, 1 of 9, Page 1 of 9, 1 / 9, a number between dashes, and Roman numerals in capitals or small letters.",
      },
      {
        q: "Will the numbers cover my text?",
        a: "They sit in the margin, at the distance from the edge you choose. If a page has text there too, pick another corner or a smaller distance; the preview shows each page before you download.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The text is added in your browser, on your device. The file never leaves it.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["pdf-header-footer", "watermark-pdf", "organize-pdf", "merge-pdf", "resize-pdf", "edit-pdf"],
  },
  "pdf-header-footer": {
    howTo: "How to add a header and footer to a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Type your lines", text: "Fill in any of the six places: left, centre and right of the top and of the bottom edge. Use {n} for the page number, {total} for the last one, {file} for the file name and {date} for today." },
      { name: "Download", text: "Select Add header and footer and download the file. Click pages first to change only those." },
    ],
    faq: [
      {
        q: "Can I have a header and a footer at the same time?",
        a: "Yes. There are three places along the top and three along the bottom, and you can fill in as many as you need in one go.",
      },
      {
        q: "How do I add the date or the file name?",
        a: "Type {date} or {file} where it should appear. Each is replaced on every page; {n} and {total} give Page {n} of {total}.",
      },
      {
        q: "Can I skip the first page?",
        a: "Yes. Click the pages that should get the lines and leave the others out. With no page picked, every page gets them.",
      },
      {
        q: "Does it work for Hindi, Arabic and other scripts?",
        a: "Yes. Text is written with open fonts that cover many scripts, and joined or right-to-left writing is shaped properly, the same way as in our editor.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The text is added in your browser, on your device. The file never leaves it.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["add-page-numbers", "watermark-pdf", "edit-pdf", "resize-pdf", "merge-pdf", "organize-pdf"],
  },
  "remove-pdf-annotations": {
    howTo: "How to remove annotations from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Choose what goes", text: "Highlights, drawings, notes and stamps are switched on. Switch off what you want to keep, and switch on Links if those should go too." },
      { name: "Download", text: "Select Clean pages and download the clean file. Click pages first to clean only those." },
    ],
    faq: [
      {
        q: "Which annotations can I remove?",
        a: "Highlights, underlines and strikeouts; drawings and shapes; notes, comments and text boxes; stamps and attached files; and links. Each group has its own switch.",
      },
      {
        q: "Will my links be removed?",
        a: "Only if you switch Links on. Links are how readers move around a file, so they stay unless you ask.",
      },
      {
        q: "Are form fields removed?",
        a: "No. Fields you can fill in stay as they are. To lock what is typed in them, use Flatten.",
      },
      {
        q: "Can I clean only some pages?",
        a: "Yes. Click the pages to clean before you run the tool. With none picked, every page is cleaned.",
      },
      {
        q: "Does it change the text or pictures on the page?",
        a: "No. Only what was added on top of the page is taken off. The page itself is not redrawn.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The file is cleaned in your browser, on your device. It never leaves it.",
      },
    ],
    related: ["flatten-pdf", "edit-pdf-metadata", "edit-pdf", "protect-pdf", "merge-pdf", "organize-pdf"],
  },
  "pdf-bookmarks": {
    howTo: "How to add or edit bookmarks in a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Edit the list", text: "Select Edit bookmarks. Type a name and a page for each bookmark. The menu on a row adds a bookmark below or inside it, moves it, nests it or deletes it." },
      { name: "Download", text: "Select Save bookmarks and download the file. Readers show the list beside the pages." },
    ],
    faq: [
      {
        q: "What are PDF bookmarks?",
        a: "They are the clickable contents list a PDF reader shows beside the pages, also called the outline. Each one jumps to a page.",
      },
      {
        q: "Can I nest bookmarks to make chapters and sections?",
        a: "Yes. Choose Add inside on a row to put a bookmark under it, or Move in a level to nest an existing one. Up to twelve levels.",
      },
      {
        q: "Does it keep the bookmarks the file already has?",
        a: "Yes. They are listed when the file opens. The ones you leave alone keep their colour, bold or italic style and the exact place they jump to.",
      },
      {
        q: "Can I remove all bookmarks?",
        a: "Yes. Delete every row and save. A deleted bookmark's name is taken out of the file, not just hidden.",
      },
      {
        q: "Will the file open with the bookmarks showing?",
        a: "A file that gets bookmarks is set to open with the bookmarks panel, unless it already asks for another view.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The bookmarks are read and written in your browser, on your device. The file never leaves it.",
      },
    ],
    related: ["split-pdf-by-bookmarks", "edit-pdf-metadata", "add-page-numbers", "organize-pdf", "merge-pdf", "edit-pdf"],
  },
  "rename-pdf": {
    howTo: "How to rename PDF files by their content",
    steps: [
      { name: "Add your PDFs", text: "Drop your PDFs on the page, or choose them from your device. Up to 20 at a time. Nothing is uploaded." },
      { name: "Mark the text", text: "Select Choose text area and drag a box around the text to use, such as a title or an invoice number. The first file's new name is shown at once." },
      { name: "Download", text: "Select Rename and download the files under their new names, together in one ZIP." },
    ],
    faq: [
      {
        q: "Where is the text read from?",
        a: "From the first page of each file, inside the box you drew. Every file is named after what its own first page has there.",
      },
      {
        q: "Can I keep part of the old name?",
        a: "Yes. In the name pattern, {text} is the text found, {name} the old name and {n} the file's number. For example: {n} - {text}.",
      },
      {
        q: "What if a file has no text there?",
        a: "It keeps its old name, and you are told which files did. Scanned pages have no text to read until they have been through text recognition.",
      },
      {
        q: "What if two files have the same text?",
        a: "The second gets a number after its name, so no file replaces another.",
      },
      {
        q: "Are the files themselves changed?",
        a: "No. Only the names change. The contents stay exactly as they were.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The text is read in your browser, on your device. The files never leave it.",
      },
    ],
    related: ["edit-pdf-metadata", "split-pdf-by-text", "merge-pdf", "organize-pdf", "extract-pdf-pages", "protect-pdf"],
  },
  "flatten-pdf": {
    howTo: "How to flatten a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. You can add several. Nothing is uploaded." },
      { name: "Choose what to flatten", text: "Form fields and annotations together, form fields only, or whole pages as pictures." },
      { name: "Download", text: "Select Flatten PDF and download the file. What was filled in or added is now part of each page." },
    ],
    faq: [
      {
        q: "What does flattening a PDF do?",
        a: "It draws form fields, highlights, notes and stamps into the page itself. They look the same, but can no longer be filled in, moved or deleted.",
      },
      {
        q: "Will the text still be selectable?",
        a: "Yes, unless you choose whole pages as pictures. Then each page becomes one picture and its text can no longer be selected, copied or edited.",
      },
      {
        q: "Does a flattened form keep what I typed?",
        a: "Yes. Each field is drawn with the value it shows. A field that cannot be drawn safely stays fillable, and you are told.",
      },
      {
        q: "Can I undo flattening?",
        a: "No. Keep your original file if you may need to change the form or the notes later.",
      },
      {
        q: "Are links kept?",
        a: "Yes. Links stay clickable. Everything else that sits on top of the page becomes part of it.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The file is flattened in your browser, on your device. It never leaves it.",
      },
    ],
    related: ["remove-pdf-annotations", "protect-pdf", "edit-pdf", "create-fillable-pdf", "merge-pdf", "edit-pdf-metadata"],
  },
  "grayscale-pdf": {
    howTo: "How to convert a PDF to grayscale",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. You can add several. Nothing is uploaded." },
      { name: "Choose what to convert", text: "Everything, only text and drawings, or only pictures." },
      { name: "Download", text: "Select Convert to grayscale and download the file. Every colour is now a shade of grey." },
    ],
    faq: [
      {
        q: "Is the result a real grayscale PDF?",
        a: "Yes. Colours are rewritten as grey values in the file itself, and pictures are saved as grey pictures. A printer needs only black ink for it.",
      },
      {
        q: "Will the text still be selectable and sharp?",
        a: "Yes. Text stays text and drawings stay drawings. Nothing is turned into a picture, so pages print as sharp as before.",
      },
      {
        q: "Does grayscale make a PDF smaller?",
        a: "Often, when the file has photos or scans: a grey picture holds one value per dot where a colour picture holds three or four. Files with only text stay about the same size.",
      },
      {
        q: "Is grayscale the same as black and white?",
        a: "Not quite. Grayscale keeps every shade between black and white, so photos and soft edges still look right. Pure black and white has no shades in between.",
      },
      {
        q: "Are links, bookmarks and form fields kept?",
        a: "Yes. Only colours change. Links, bookmarks, form fields and the text layer of a scan stay as they are.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The file is converted in your browser, on your device. It never leaves it.",
      },
    ],
    related: ["compress-pdf", "flatten-pdf", "pdf-to-jpg", "protect-pdf", "merge-pdf", "edit-pdf"],
  },
  "edit-pdf-metadata": {
    howTo: "How to edit PDF metadata",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Its details are filled in for you. Nothing is uploaded." },
      { name: "Change the details", text: "Edit the title, author, subject and keywords, add fields of your own, or choose Remove all to clear everything." },
      { name: "Download", text: "Select Save metadata and download the file. The pages are not changed." },
    ],
    faq: [
      {
        q: "What is PDF metadata?",
        a: "Details stored inside the file: its title, author, subject, keywords, the program that made it and the dates it was made and changed. Readers show them under Properties.",
      },
      {
        q: "How do I remove all metadata from a PDF?",
        a: "Choose Remove all. The title, author, keywords, dates and the hidden XML copy of the same details are all taken out.",
      },
      {
        q: "Can I add my own fields?",
        a: "Yes. Select Add a field and give it a name and a value, for example a project code.",
      },
      {
        q: "Can I set the same details on several files?",
        a: "Yes. Add up to 20 PDFs and the same details are written to each one.",
      },
      {
        q: "Does editing metadata change the pages?",
        a: "No. Only the details about the file change. Pages, text and pictures stay as they are.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The details are read and written in your browser, on your device. The file never leaves it.",
      },
    ],
    related: ["remove-pdf-annotations", "flatten-pdf", "protect-pdf", "merge-pdf", "edit-pdf", "organize-pdf"],
  },
  "watermark-pdf": {
    howTo: "How to add a watermark to a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Type the text or choose a picture", text: "Type a word such as DRAFT, or pick a logo. Set where it goes, the angle and how strong it is. The pages on screen show the result." },
      { name: "Download", text: "Select Add watermark and download the file. Click pages first to mark only those." },
    ],
    faq: [
      {
        q: "Can I use my logo as a watermark?",
        a: "Yes. Switch to Picture and choose a PNG or JPG. A PNG with a see-through background blends in best. You can set its size and strength.",
      },
      {
        q: "How do I make the watermark lighter?",
        a: "Lower Strength. At 20 to 30 percent the watermark is clear to see while the page under it stays easy to read.",
      },
      {
        q: "Can I repeat the watermark across the page?",
        a: "Yes. Set Position to Repeated and it is laid out in rows that cover the whole page.",
      },
      {
        q: "Can the watermark be removed later?",
        a: "It becomes part of each page, so it does not come off by accident. Keep your original file if you may need a clean copy.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The watermark is added in your browser, on your device. The file never leaves it.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up.",
      },
    ],
    related: ["add-page-numbers", "pdf-header-footer", "protect-pdf", "edit-pdf", "compress-pdf", "merge-pdf"],
  },
  "n-up-pdf": {
    howTo: "How to put several PDF pages on one sheet",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF on the page, or choose it from your device. Nothing is uploaded." },
      { name: "Choose the pages per sheet", text: "Pick 2, 4, 8 or 16. More options sets the order, and whether the paper keeps its size." },
      { name: "Download", text: "Select Arrange pages and download the file, ready to print on fewer sheets." },
    ],
    faq: [
      {
        q: "How do I print two pages per sheet?",
        a: "Add the PDF and keep 2. Each sheet holds two pages side by side. Print the new file as usual, or switch on Keep the paper size to get the same paper with smaller pages.",
      },
      {
        q: "Will the pages become smaller?",
        a: "Not unless you ask. By default the sheet grows, so two A4 pages make one A3 sheet at full size. With Keep the paper size the pages shrink to share one sheet.",
      },
      {
        q: "Can I change the order of the pages on the sheet?",
        a: "Yes. Pages go across, then down. More options can fill each column first, or start from the right for documents that read right to left.",
      },
      {
        q: "Does the text stay sharp?",
        a: "Yes. Pages are placed as they are, not as pictures, so text stays text and prints crisply at any size.",
      },
      {
        q: "Do links still work?",
        a: "Web links keep working on the new sheets. Links that jump to another page, and form fields, are left out, because the pages they belonged to are now parts of a sheet.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["resize-pdf", "merge-pdf", "organize-pdf", "split-pdf-in-half", "compress-pdf", "rotate-pdf"],
  },
  "split-pdf-in-half": {
    howTo: "How to split PDF pages in half",
    steps: [
      { name: "Add your PDF", text: "Drop a PDF with two pages on each sheet, such as a scanned book. Nothing is uploaded." },
      { name: "Choose the cut", text: "Auto cuts wide sheets into left and right pages and tall sheets into top and bottom. Click a cover or a fold-out to keep it whole." },
      { name: "Download", text: "Select Split in half and download a PDF with one page per page." },
    ],
    faq: [
      {
        q: "How do I split an A3 scan into two A4 pages?",
        a: "Add the PDF and select Split in half. Each A3 sheet is cut down the middle into two A4 pages, left page first.",
      },
      {
        q: "Does cutting pages in half reduce quality?",
        a: "No. Nothing is redrawn or recompressed. Each half is the same page shown through a smaller frame, so text stays sharp and searchable.",
      },
      {
        q: "Can I keep the cover as one page?",
        a: "Yes. Click the pages you want cut and leave the cover unpicked. Pages you do not pick stay whole and keep their place.",
      },
      {
        q: "My book reads right to left. Can the right page come first?",
        a: "Yes. Open More options and switch on Right page first.",
      },
      {
        q: "I scanned an unstapled booklet. Can the pages be put back in order?",
        a: "Yes. Switch on Booklet scan in More options. Sheets scanned as 12-1, 2-11, 10-3 and so on come out as pages 1 to 12.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. The pages are cut in your browser, so your scans stay on your device.",
      },
    ],
    related: ["split-pdf", "crop-pdf", "organize-pdf", "rotate-pdf", "extract-pdf-pages", "split-pdf-by-size"],
  },
  "delete-pdf-pages": {
    howTo: "How to delete pages from a PDF",
    steps: [
      { name: "Add your PDF", text: "Drop one or more PDF files on the page, or choose them from your device. Nothing is uploaded." },
      { name: "Mark the pages to delete", text: "Click each page to remove, or type them, for example 2, 5-7, last. Marked pages stay in view, so one more click brings a page back." },
      { name: "Download", text: "Select Delete and download the PDF without those pages." },
    ],
    faq: [
      {
        q: "How do I delete pages from a PDF?",
        a: "Add the PDF, click the pages you want gone (or type them), then select Delete. You download the same PDF without those pages.",
      },
      {
        q: "Can I undo a page I marked by mistake?",
        a: "Yes. Marked pages stay in place, dimmed with a bin badge. Click one again to keep it, or clear all marks at once.",
      },
      {
        q: "Can I delete the last page of several PDFs at once?",
        a: "Yes. Add the files and type last. Each file loses only its own last page, whatever its length.",
      },
      {
        q: "Does deleting pages change the rest of the PDF?",
        a: "No. The other pages are copied as they are, and bookmarks to them keep working. Bookmarks to a deleted page are dropped.",
      },
      {
        q: "Are my files uploaded?",
        a: "No. Deleting pages runs in your browser, so your files stay on your device.",
      },
      {
        q: "Is there a size limit?",
        a: "Up to 20 PDFs at a time, up to 100 MB each and 1,000 pages in total. It is free, with no sign-up and no watermark.",
      },
    ],
    related: ["extract-pdf-pages", "split-pdf", "organize-pdf", "rotate-pdf", "merge-pdf", "compress-pdf"],
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
      { name: "Combine and save", text: "Pick any options, select Combine PDF and download one PDF with your pages in order." },
    ],
    faq: [
      {
        q: "How do I combine pages from different PDFs in any order?",
        a: "Add the files and drag their pages into the order you want. Pages from different files can sit side by side, then Combine PDF saves them as one document.",
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
