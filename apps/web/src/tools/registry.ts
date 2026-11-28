/**
 * Single source of truth for every BerryPDF tool.
 * `ref` is the matching Sejda slug, used only by the parity evaluator.
 * `runtime`: "client" = processed in the browser, nothing uploaded; "server" = processing worker.
 */
import { DELETE_ZIP, EXTRACT_ZIP, mergedName, mixedName, organizedName, pdfOutputName, splitZipName, zipName } from "../lib/pdf/naming";
import type { ToolIconName } from "./tool-icon-names";

export type ToolCategory =
  | "organize"
  | "edit"
  | "optimize"
  | "security"
  | "convert-from"
  | "convert-to"
  | "scans"
  | "automate";

/** PDF permissions a tool may need (an owner-restricted file can deny them). */
export type Permission = "print" | "modify" | "copy" | "annotate" | "fillForms" | "assemble";

/**
 * What the shared flow (pick files -> options -> run -> result) reads for a
 * tool. See docs/specs/f1-shared-flow.md, "U-9".
 */
export type ToolFlowConfig = {
  /** Page heading, e.g. "Rotate PDF". */
  title: string;
  /** Accepted file types: MIME types and lower-case extensions with the dot. */
  accept: { mime: string[]; extensions: string[] };
  multiFile: boolean;
  maxFiles: number;
  maxFileBytes: number;
  /** Total size of every file in one task. */
  maxTotalBytes: number;
  /** Total pages across every file in one task. */
  maxTotalPages: number;
  defaultView: "pages" | "files";
  /** A file that cannot be opened is still taken (Repair): it shows as one placeholder page. */
  acceptDamaged?: boolean;
  requiredPermissions: Permission[];
  /** Primary button label, e.g. "Rotate PDF". */
  actionLabel: string;
  /** Progress label, e.g. "Rotating" (shown as "Rotating… 42%"). */
  progressLabel: string;
  optionsDensity: "compact" | "full";
  /**
   * "settings" (F25 §4): a tool whose options are numbered steps (Compress, Protect, Watermark…). From
   * 1024px they live in a side panel beside the stage and the top row holds only the action slot.
   */
  layout?: "settings";
  /**
   * Output file name for these input names (one PDF, or a ZIP for several). Absent when the name
   * depends on the run (F12: the image format, one image or a ZIP), and the job names its own output.
   */
  outputName?: (inputs: string[]) => string;
};

export type Tool = {
  slug: string;
  name: string;
  summary: string;
  category: ToolCategory;
  runtime: "client" | "server";
  ref: string;
  status: "planned" | "beta" | "live";
  /** Phosphor Duotone icon name, unique per tool (see scripts/gen-tool-icons.mjs). */
  icon: ToolIconName;
  /** Extra search words that are not in the name or summary. */
  keywords: string[];
  /** Position in the home page's Popular row (1 = first); absent = not popular. */
  popularRank?: number;
  /** Present once the tool runs on the shared flow. */
  flow?: ToolFlowConfig;
  /**
   * Usable and listed (with its Beta badge), but its page is still noindex: kept out of the sitemap,
   * the hero and the header shortcuts until it ships in full (Edit PDF, owner 27 Nov).
   */
  preview?: true;
};

/** Catalogue groups, in display order. */
export const categories: { id: ToolCategory; label: string }[] = [
  { id: "organize", label: "Organize pages" },
  { id: "edit", label: "Edit & sign" },
  { id: "optimize", label: "Optimize" },
  { id: "security", label: "Security" },
  { id: "convert-from", label: "Convert from PDF" },
  { id: "convert-to", label: "Convert to PDF" },
  { id: "scans", label: "Scans" },
  { id: "automate", label: "Automate" },
];

/** The hero's call to action goes here once this tool is usable (spec F2 §3a). */
export const featured = "edit-pdf";

/** Popular row, in its fixed order (spec F2 §3b). */
const popular = [
  "rotate-pdf",
  "edit-pdf",
  "compress-pdf",
  "delete-pdf-pages",
  "merge-pdf",
  "split-pdf",
  "crop-pdf",
  "sign-pdf",
  "pdf-to-word",
  "extract-pdf-pages",
];

/** Search aliases: words people type that are not in the name or summary. */
const keywordsBySlug: Record<string, string[]> = {
  "merge-pdf": ["combine", "join", "append"],
  "extract-pdf-pages": ["select", "pick pages"],
  "delete-pdf-pages": ["remove pages"],
  "rotate-pdf": ["turn", "orientation", "landscape"],
  "organize-pdf": ["reorder", "sort", "arrange"],
  "combine-reorder-pdf": ["merge"],
  "alternate-mix-pdf": ["interleave", "collate"],
  "split-pdf-by-bookmarks": ["outline", "chapters"],
  "split-pdf-by-size": ["file size", "email"],
  "split-pdf-by-text": ["invoices", "statements", "content"],
  "split-pdf-in-half": ["booklet", "two up"],
  "crop-pdf": ["margins", "trim"],
  "resize-pdf": ["page size", "a4", "letter", "scale"],
  "flip-pdf": ["mirror"],
  "n-up-pdf": ["pages per sheet", "imposition"],
  "edit-pdf": ["text", "annotate", "whiteout", "edit"],
  "sign-pdf": ["sign", "signature", "form", "esign"],
  "create-fillable-pdf": ["fillable", "form fields"],
  "watermark-pdf": ["stamp", "logo", "confidential"],
  "add-page-numbers": ["paginate", "numbering"],
  "pdf-header-footer": ["label"],
  "bates-numbering": ["legal", "stamp"],
  "edit-pdf-metadata": ["properties", "title", "author"],
  "pdf-bookmarks": ["outline", "toc", "table of contents"],
  "rename-pdf": ["file name"],
  "remove-pdf-annotations": ["comments", "highlights"],
  "flatten-pdf": ["form fields"],
  "compress-pdf": ["shrink", "reduce", "smaller", "optimize"],
  "grayscale-pdf": ["black and white", "greyscale", "monochrome"],
  "repair-pdf": ["fix", "broken", "corrupt"],
  "protect-pdf": ["encrypt", "password", "lock"],
  "unlock-pdf": ["decrypt", "remove password"],
  "pdf-to-word": ["docx", "doc"],
  "pdf-to-excel": ["xlsx", "spreadsheet", "table"],
  "pdf-to-ppt": ["ppt", "pptx", "slides"],
  "pdf-to-jpg": ["png", "jpeg", "tiff", "picture"],
  "pdf-to-text": ["txt", "extract text"],
  "extract-images": ["pictures", "photos"],
  "jpg-to-pdf": ["jpeg", "png", "photo", "picture"],
  "word-to-pdf": ["docx", "doc"],
  "html-to-pdf": ["html", "url", "website"],
  "ocr-pdf": ["recognize text", "searchable"],
  "deskew-pdf": ["straighten", "tilted"],
  "workflows": ["batch", "automate", "chain"],
};

const MB = 1024 * 1024;
const PDF_ONLY = { mime: ["application/pdf"], extensions: [".pdf"] };
/** PDF plus images (spec F3 §0). TIFF is in: UTIF.js (MIT) was verified as the decoder (§8a decision 9). */
const PDF_AND_IMAGES = {
  mime: ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff"],
  extensions: [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff"],
};

/** Pictures only (Image to PDF, spec F12 §3). */
const IMAGES_ONLY = { mime: PDF_AND_IMAGES.mime.slice(1), extensions: PDF_AND_IMAGES.extensions.slice(1) };

/** Browser-tool defaults from the F1 spec (no free-tier gate for browser tools). */
const clientPdfFlow = (
  slug: string,
  labels: Pick<ToolFlowConfig, "title" | "actionLabel" | "progressLabel">,
  overrides: Partial<ToolFlowConfig> = {},
): ToolFlowConfig => ({
  accept: PDF_ONLY,
  multiFile: true,
  maxFiles: 20,
  maxFileBytes: 100 * MB,
  maxTotalBytes: 500 * MB,
  maxTotalPages: 1000,
  defaultView: "pages",
  requiredPermissions: [],
  optionsDensity: "compact",
  outputName: (inputs) => (inputs.length === 1 ? pdfOutputName(inputs[0]) : zipName(slug)),
  ...labels,
  ...overrides,
});

/** Usable tools with a page of their own instead of the shared flow, by slug. */
const ownPages: Record<string, { status: Tool["status"]; preview?: true }> = {
  "edit-pdf": { status: "beta", preview: true },
};

/** Tools that run on the shared flow, by slug. */
const flows: Record<string, { status: Tool["status"]; flow: ToolFlowConfig }> = {
  "rotate-pdf": {
    status: "beta",
    flow: clientPdfFlow("rotate-pdf", { title: "Rotate PDF", actionLabel: "Rotate PDF", progressLabel: "Rotating" }),
  },
  "merge-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "merge-pdf",
      { title: "Merge PDF", actionLabel: "Merge PDFs", progressLabel: "Merging" },
      {
        accept: PDF_AND_IMAGES,
        maxFiles: 50,
        defaultView: "files",
        optionsDensity: "full",
        // Always one PDF, named after the first file in the output (spec F3 §6).
        outputName: (inputs) => mergedName(inputs[0]),
      },
    ),
  },
  // F5 page tools (spec F4/F5 §0d): PDFs and images, 50 files, the F1 size and page caps.
  "organize-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "organize-pdf",
      // "Save PDF": the output is one edited copy (spec P-11 #10).
      { title: "Organize PDF", actionLabel: "Save PDF", progressLabel: "Saving" },
      { accept: PDF_AND_IMAGES, maxFiles: 50, defaultView: "pages", outputName: (inputs) => organizedName(inputs[0]) },
    ),
  },
  "combine-reorder-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "combine-reorder-pdf",
      { title: "Combine & reorder PDF pages", actionLabel: "Combine PDF", progressLabel: "Combining" },
      { accept: PDF_AND_IMAGES, maxFiles: 50, defaultView: "pages", optionsDensity: "full", outputName: (inputs) => mergedName(inputs[0]) },
    ),
  },
  "alternate-mix-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "alternate-mix-pdf",
      { title: "Alternate & mix PDF", actionLabel: "Mix PDFs", progressLabel: "Mixing" },
      { accept: PDF_AND_IMAGES, maxFiles: 50, defaultView: "files", outputName: (inputs) => mixedName(inputs[0]) },
    ),
  },
  // F4 page tools (spec F4/F5 §0d, §6): PDF only, 20 files, pages view. Split's options fold into one
  // bar row (UI P-3), so it uses the compact dock too; its parts list lives in More options.
  "split-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "split-pdf",
      { title: "Split PDF", actionLabel: "Split PDF", progressLabel: "Splitting" },
      // A single part downloads as that PDF (named by the plan); several as `<base>-split.zip` or `berrypdf-split.zip`.
      { outputName: splitZipName },
    ),
  },
  // F7 (spec f7-split-variants.md): Split's workspace with the parts worked out from the bookmarks.
  "split-pdf-by-bookmarks": {
    status: "beta",
    flow: clientPdfFlow(
      "split-pdf-by-bookmarks",
      { title: "Split PDF by bookmarks", actionLabel: "Split PDF", progressLabel: "Splitting" },
      { outputName: splitZipName },
    ),
  },
  "split-pdf-by-size": {
    status: "beta",
    flow: clientPdfFlow(
      "split-pdf-by-size",
      { title: "Split PDF by size", actionLabel: "Split PDF", progressLabel: "Splitting" },
      { outputName: splitZipName },
    ),
  },
  // Split's workspace again, with the parts worked out from the text inside one area of the page.
  "split-pdf-by-text": {
    status: "beta",
    flow: clientPdfFlow(
      "split-pdf-by-text",
      { title: "Split PDF by text", actionLabel: "Split PDF", progressLabel: "Splitting" },
      { outputName: splitZipName },
    ),
  },
  "split-pdf-in-half": {
    status: "beta",
    flow: clientPdfFlow("split-pdf-in-half", { title: "Split PDF pages in half", actionLabel: "Split in half", progressLabel: "Splitting" }),
  },
  // F8 (spec f8-page-shape.md): Flip and Resize on the pick-pages flow; Crop and N-up on whole files.
  "crop-pdf": { status: "beta", flow: clientPdfFlow("crop-pdf", { title: "Crop PDF", actionLabel: "Crop PDF", progressLabel: "Cropping" }) },
  "resize-pdf": { status: "beta", flow: clientPdfFlow("resize-pdf", { title: "Resize PDF", actionLabel: "Resize PDF", progressLabel: "Resizing" }) },
  "flip-pdf": { status: "beta", flow: clientPdfFlow("flip-pdf", { title: "Flip PDF", actionLabel: "Flip PDF", progressLabel: "Flipping" }) },
  "n-up-pdf": { status: "beta", flow: clientPdfFlow("n-up-pdf", { title: "N-up PDF", actionLabel: "Arrange pages", progressLabel: "Arranging" }) },
  // F9. Stamping tools: settings tools (F25 §4), drawn by the editor's build.
  "add-page-numbers": { status: "beta", flow: clientPdfFlow("add-page-numbers", { title: "Add page numbers", actionLabel: "Add page numbers", progressLabel: "Numbering" }, { layout: "settings" }) },
  "pdf-header-footer": { status: "beta", flow: clientPdfFlow("pdf-header-footer", { title: "Header and footer", actionLabel: "Add header and footer", progressLabel: "Adding" }, { layout: "settings" }) },
  "watermark-pdf": { status: "beta", flow: clientPdfFlow("watermark-pdf", { title: "Watermark PDF", actionLabel: "Add watermark", progressLabel: "Watermarking" }, { layout: "settings" }) },
  // F10. Document tools: settings tools (F25 §4).
  "remove-pdf-annotations": { status: "beta", flow: clientPdfFlow("remove-pdf-annotations", { title: "Clear annotations", actionLabel: "Clear annotations", progressLabel: "Removing" }, { layout: "settings" }) },
  "flatten-pdf": { status: "beta", flow: clientPdfFlow("flatten-pdf", { title: "Flatten PDF", actionLabel: "Flatten PDF", progressLabel: "Flattening" }, { layout: "settings" }) },
  "grayscale-pdf": { status: "beta", flow: clientPdfFlow("grayscale-pdf", { title: "Grayscale PDF", actionLabel: "Convert to grayscale", progressLabel: "Converting" }, { layout: "settings" }) },
  "repair-pdf": { status: "beta", flow: clientPdfFlow("repair-pdf", { title: "Repair PDF", actionLabel: "Repair PDF", progressLabel: "Repairing" }, { defaultView: "files", acceptDamaged: true }) },
  "pdf-bookmarks": { status: "beta", flow: clientPdfFlow("pdf-bookmarks", { title: "Edit PDF bookmarks", actionLabel: "Save bookmarks", progressLabel: "Saving" }, { layout: "settings", multiFile: false, maxFiles: 1 }) },
  "rename-pdf": { status: "beta", flow: clientPdfFlow("rename-pdf", { title: "Rename PDF by content", actionLabel: "Rename", progressLabel: "Renaming" }, { layout: "settings" }) },
  "edit-pdf-metadata": { status: "beta", flow: clientPdfFlow("edit-pdf-metadata", { title: "Edit PDF metadata", actionLabel: "Save metadata", progressLabel: "Saving" }, { layout: "settings" }) },
  "extract-pdf-pages": {
    status: "beta",
    flow: clientPdfFlow(
      "extract-pdf-pages",
      { title: "Extract PDF pages", actionLabel: "Extract pages", progressLabel: "Extracting" },
      { outputName: (inputs) => (inputs.length === 1 ? pdfOutputName(inputs[0]) : EXTRACT_ZIP) },
    ),
  },
  "delete-pdf-pages": {
    status: "beta",
    flow: clientPdfFlow(
      "delete-pdf-pages",
      { title: "Delete PDF pages", actionLabel: "Delete pages", progressLabel: "Deleting" },
      { outputName: (inputs) => (inputs.length === 1 ? pdfOutputName(inputs[0]) : DELETE_ZIP) },
    ),
  },
  // F12 (spec f12-image-text-tools.md): the job names its output (lib/pdf/page-images, page-text; Image to PDF
  // uses the first image's name), so these flows carry no outputName.
  "pdf-to-jpg": {
    status: "beta",
    flow: clientPdfFlow(
      "pdf-to-jpg",
      { title: "PDF to JPG", actionLabel: "Convert to JPG", progressLabel: "Converting" },
      { outputName: undefined },
    ),
  },
  // F11. Protect is the first settings tool (F25 §4): its options live in the side panel.
  "protect-pdf": {
    status: "beta",
    flow: clientPdfFlow("protect-pdf", { title: "Protect PDF", actionLabel: "Protect PDF", progressLabel: "Protecting" }, { layout: "settings" }),
  },
  "unlock-pdf": {
    status: "beta",
    flow: clientPdfFlow("unlock-pdf", { title: "Unlock PDF", actionLabel: "Unlock PDF", progressLabel: "Unlocking" }),
  },
  "extract-images": {
    status: "beta",
    flow: clientPdfFlow(
      "extract-images",
      { title: "Extract images", actionLabel: "Extract images", progressLabel: "Extracting" },
      { requiredPermissions: ["copy"], outputName: undefined },
    ),
  },
  // Image to PDF: Organize's workspace for pictures only; the PDF is named after the first image.
  "jpg-to-pdf": {
    status: "beta",
    flow: clientPdfFlow(
      "jpg-to-pdf",
      { title: "JPG to PDF", actionLabel: "Convert to PDF", progressLabel: "Converting" },
      { accept: IMAGES_ONLY, maxFiles: 50, defaultView: "pages", optionsDensity: "full", outputName: undefined },
    ),
  },
  // PDF to text: one .txt per PDF, read in the browser; "copy" must be allowed by the file's permissions.
  "pdf-to-text": {
    status: "beta",
    flow: clientPdfFlow(
      "pdf-to-text",
      { title: "PDF to text", actionLabel: "Extract text", progressLabel: "Reading" },
      { requiredPermissions: ["copy"], outputName: undefined },
    ),
  },
};

const t = (
  slug: string,
  name: string,
  summary: string,
  category: ToolCategory,
  runtime: Tool["runtime"],
  icon: ToolIconName,
  ref = slug,
): Tool => {
  const rank = popular.indexOf(slug);
  return {
    slug,
    name,
    summary,
    category,
    runtime,
    ref,
    icon,
    keywords: keywordsBySlug[slug] ?? [],
    ...(rank >= 0 ? { popularRank: rank + 1 } : {}),
    ...(flows[slug] ?? ownPages[slug] ?? { status: "planned" }),
  };
};

export const tools: Tool[] = [
  t("merge-pdf", "Merge", "Join PDFs and images into a single document", "organize", "client", "arrows-merge"),
  t("split-pdf", "Split", "Break a PDF into parts by page ranges", "organize", "client", "arrows-split"),
  t("extract-pdf-pages", "Extract pages", "Keep only the pages you pick", "organize", "client", "export", "extract-pdf-pages"),
  t("delete-pdf-pages", "Delete pages", "Remove unwanted pages", "organize", "client", "file-minus", "delete-pdf-pages"),
  t("rotate-pdf", "Rotate", "Turn pages and save the rotation", "organize", "client", "arrow-clockwise", "rotate-pdf-pages"),
  t("organize-pdf", "Organize", "Reorder, duplicate and remove pages visually", "organize", "client", "squares-four"),
  t("combine-reorder-pdf", "Combine & reorder", "Mix pages from several files in any order", "organize", "client", "cards", "visually-combine-reorder-pdf"),
  t("alternate-mix-pdf", "Alternate & mix", "Interleave pages from two or more files", "organize", "client", "shuffle", "alternate-mix-pdf"),
  t("split-pdf-by-bookmarks", "Split by bookmarks", "One file per chapter, using the outline", "organize", "client", "bookmark-simple", "split-pdf-by-outline"),
  t("split-pdf-by-size", "Split by size", "Parts no bigger than a target size", "organize", "client", "ruler", "split-pdf-by-size"),
  t("split-pdf-by-text", "Split by text", "Start a new file when page text changes", "organize", "client", "text-columns", "split-pdf-by-text"),
  t("split-pdf-in-half", "Split in half", "Cut two-page scans into single pages", "organize", "client", "columns", "split-pdf-down-the-middle"),
  t("crop-pdf", "Crop", "Trim margins or set a new page box", "edit", "client", "crop"),
  t("resize-pdf", "Resize", "Change page size or add margins", "edit", "client", "arrows-out"),
  t("flip-pdf", "Flip", "Mirror pages horizontally or vertically", "edit", "client", "flip-horizontal"),
  t("n-up-pdf", "N-up", "Print several pages per sheet", "edit", "client", "grid-four", "n-up-pdf"),
  t("edit-pdf", "Edit PDF", "Add and change text, images, shapes and links", "edit", "client", "pencil-simple-line"),
  t("sign-pdf", "Fill & sign", "Fill in forms and add your signature", "edit", "client", "signature", "sign-pdf"),
  t("create-fillable-pdf", "Create forms", "Make any PDF fillable", "edit", "client", "textbox", "pdf-forms"),
  t("watermark-pdf", "Watermark", "Stamp text or an image on pages", "edit", "client", "stamp"),
  t("add-page-numbers", "Page numbers", "Number your pages", "edit", "client", "list-numbers", "page-numbers-pdf"),
  t("pdf-header-footer", "Header & footer", "Add labels to the top or bottom of pages", "edit", "client", "rows", "header-footer-pdf"),
  t("bates-numbering", "Bates numbering", "Stamp legal Bates numbers across many files", "edit", "client", "hash", "bates-numbering-pdf"),
  t("edit-pdf-metadata", "Edit metadata", "Change title, author, keywords and more", "edit", "client", "tag", "edit-pdf-metadata"),
  t("pdf-bookmarks", "Bookmarks", "Create or edit the document outline", "edit", "client", "bookmarks", "pdf-bookmarks"),
  t("rename-pdf", "Rename by content", "Name files using text found inside them", "edit", "client", "text-aa"),
  t("remove-pdf-annotations", "Clear annotations", "Remove highlights, comments and markup", "edit", "client", "eraser", "delete-pdf-annotations"),
  t("flatten-pdf", "Flatten", "Lock form fields and annotations into the page", "edit", "client", "stack-simple"),
  t("compress-pdf", "Compress", "Make your PDF smaller", "optimize", "server", "arrows-in"),
  t("grayscale-pdf", "Grayscale", "Convert colors to shades of gray", "optimize", "client", "circle-half"),
  t("repair-pdf", "Repair", "Recover content from a damaged file", "optimize", "client", "wrench"),
  t("protect-pdf", "Protect", "Add a password and permissions", "security", "client", "lock", "encrypt-pdf"),
  t("unlock-pdf", "Unlock", "Remove passwords and restrictions", "security", "client", "lock-open", "unlock-pdf"),
  t("pdf-to-word", "PDF to Word", "Editable .docx from your PDF", "convert-from", "server", "file-doc"),
  t("pdf-to-excel", "PDF to Excel", "Pull tables into .xlsx or CSV", "convert-from", "server", "file-xls"),
  t("pdf-to-ppt", "PDF to PowerPoint", "Slides from your PDF pages", "convert-from", "server", "file-ppt"),
  t("pdf-to-jpg", "PDF to image", "Pages as JPG, PNG or TIFF", "convert-from", "client", "image", "pdf-to-jpg"),
  t("pdf-to-text", "PDF to text", "Copy out all the text", "convert-from", "client", "file-txt", "extract-text-from-pdf"),
  t("extract-images", "Extract images", "Save every embedded image", "convert-from", "client", "images", "extract-images-from-pdf"),
  t("jpg-to-pdf", "Image to PDF", "Turn JPG, PNG and other images into a PDF", "convert-to", "client", "file-image", "jpg-to-pdf"),
  t("word-to-pdf", "Word to PDF", "Convert .docx documents", "convert-to", "server", "file-pdf"),
  t("html-to-pdf", "Web page to PDF", "Capture URLs or HTML as PDF", "convert-to", "server", "globe"),
  t("ocr-pdf", "OCR", "Make scanned PDFs searchable", "scans", "server", "scan"),
  t("deskew-pdf", "Deskew", "Straighten tilted scans", "scans", "server", "angle"),
  t("workflows", "Workflows", "Chain tools and run them in one go", "automate", "client", "flow-arrow"),
];

export const toolBySlug = (slug: string) => tools.find((x) => x.slug === slug);

/** "Usable" = the tool page works (status beta or live). */
export const isUsable = (tool: Pick<Tool, "status">) => tool.status !== "planned";

/** Popular tools: usable first, then planned, each part in the fixed popular order. */
export function popularTools(list: readonly Tool[] = tools): Tool[] {
  const ranked = list.filter((x) => x.popularRank !== undefined).sort((a, b) => a.popularRank! - b.popularRank!);
  return [...ranked.filter(isUsable), ...ranked.filter((x) => !isUsable(x))];
}

/** Header shortcuts: up to `max` usable tools (no previews), popular order first, then registry order. */
export function shortcutTools(max = 5, list: readonly Tool[] = tools): Tool[] {
  const usable = list.filter((x) => isUsable(x) && !x.preview);
  const ranked = usable.filter((x) => x.popularRank !== undefined).sort((a, b) => a.popularRank! - b.popularRank!);
  return [...ranked, ...usable.filter((x) => x.popularRank === undefined)].slice(0, max);
}

/** A tool that is known to run on the shared flow. */
export type FlowTool = Tool & { flow: ToolFlowConfig };

export function flowTool(slug: string): FlowTool {
  const tool = toolBySlug(slug);
  if (!tool?.flow) throw new Error(`Tool ${slug} does not run on the shared flow`);
  return tool as FlowTool;
}

/**
 * Tools that can continue from an output of this MIME type: browser tools that
 * are not planned and accept it (spec U-9).
 */
export function continueTargets(outputType: string): FlowTool[] {
  return tools.filter(
    (t): t is FlowTool => t.runtime === "client" && t.status !== "planned" && !!t.flow && t.flow.accept.mime.includes(outputType),
  );
}
