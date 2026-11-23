/**
 * Single source of truth for every BerryPDF tool.
 * `ref` is the matching Sejda slug, used only by the parity evaluator.
 * `runtime`: "client" = processed in the browser, nothing uploaded; "server" = processing worker.
 */
import { mergedName, pdfOutputName, zipName } from "../lib/pdf/naming";
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
  requiredPermissions: Permission[];
  /** Primary button label, e.g. "Rotate PDF". */
  actionLabel: string;
  /** Progress label, e.g. "Rotating" (shown as "Rotating… 42%"). */
  progressLabel: string;
  optionsDensity: "compact" | "full";
  /** Output file name for these input names (one PDF, or a ZIP for several). */
  outputName: (inputs: string[]) => string;
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
export const featured = "pdf-editor";

/** Popular row, in its fixed order (spec F2 §3b). */
const popular = [
  "rotate-pdf",
  "pdf-editor",
  "compress-pdf",
  "delete-pages",
  "merge-pdf",
  "split-pdf",
  "crop-pdf",
  "fill-sign",
  "pdf-to-word",
  "extract-pages",
];

/** Search aliases: words people type that are not in the name or summary. */
const keywordsBySlug: Record<string, string[]> = {
  "merge-pdf": ["combine", "join", "append"],
  "extract-pages": ["select", "pick pages"],
  "delete-pages": ["remove pages"],
  "rotate-pdf": ["turn", "orientation", "landscape"],
  "organize-pdf": ["reorder", "sort", "arrange"],
  "combine-reorder": ["merge"],
  "alternate-mix": ["interleave", "collate"],
  "split-by-bookmarks": ["outline", "chapters"],
  "split-by-size": ["file size", "email"],
  "split-in-half": ["booklet", "two up"],
  "crop-pdf": ["margins", "trim"],
  "resize-pdf": ["page size", "a4", "letter", "scale"],
  "flip-pdf": ["mirror"],
  "n-up": ["pages per sheet", "imposition"],
  "pdf-editor": ["text", "annotate", "whiteout", "edit"],
  "fill-sign": ["sign", "signature", "form", "esign"],
  "create-forms": ["fillable", "form fields"],
  "watermark-pdf": ["stamp", "logo", "confidential"],
  "page-numbers": ["paginate", "numbering"],
  "header-footer": ["label"],
  "bates-numbering": ["legal", "stamp"],
  "edit-metadata": ["properties", "title", "author"],
  "bookmarks": ["outline", "toc", "table of contents"],
  "rename-pdf": ["file name"],
  "remove-annotations": ["comments", "highlights"],
  "flatten-pdf": ["form fields"],
  "compress-pdf": ["shrink", "reduce", "smaller", "optimize"],
  "grayscale-pdf": ["black and white", "greyscale", "monochrome"],
  "repair-pdf": ["fix", "broken", "corrupt"],
  "protect-pdf": ["encrypt", "password", "lock"],
  "unlock-pdf": ["decrypt", "remove password"],
  "pdf-to-word": ["docx", "doc"],
  "pdf-to-excel": ["xlsx", "spreadsheet", "table"],
  "pdf-to-ppt": ["ppt", "pptx", "slides"],
  "pdf-to-image": ["png", "jpeg", "tiff", "picture"],
  "pdf-to-text": ["txt", "extract text"],
  "extract-images": ["pictures", "photos"],
  "image-to-pdf": ["jpeg", "png", "photo", "picture"],
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
    ...(flows[slug] ?? { status: "planned" }),
  };
};

export const tools: Tool[] = [
  t("merge-pdf", "Merge", "Join PDFs and images into a single document", "organize", "client", "arrows-merge"),
  t("split-pdf", "Split", "Break a PDF into parts by page ranges", "organize", "client", "arrows-split"),
  t("extract-pages", "Extract pages", "Keep only the pages you pick", "organize", "client", "export", "extract-pdf-pages"),
  t("delete-pages", "Delete pages", "Remove unwanted pages", "organize", "client", "file-minus", "delete-pdf-pages"),
  t("rotate-pdf", "Rotate", "Turn pages and save the rotation", "organize", "client", "arrow-clockwise", "rotate-pdf-pages"),
  t("organize-pdf", "Organize", "Reorder, duplicate and remove pages visually", "organize", "client", "squares-four"),
  t("combine-reorder", "Combine & reorder", "Mix pages from several files in any order", "organize", "client", "cards", "visually-combine-reorder-pdf"),
  t("alternate-mix", "Alternate & mix", "Interleave pages from two or more files", "organize", "client", "shuffle", "alternate-mix-pdf"),
  t("split-by-bookmarks", "Split by bookmarks", "One file per chapter, using the outline", "organize", "client", "bookmark-simple", "split-pdf-by-outline"),
  t("split-by-size", "Split by size", "Parts no bigger than a target size", "organize", "client", "ruler", "split-pdf-by-size"),
  t("split-by-text", "Split by text", "Start a new file when page text changes", "organize", "client", "text-columns", "split-pdf-by-text"),
  t("split-in-half", "Split in half", "Cut two-page scans into single pages", "organize", "client", "columns", "split-pdf-down-the-middle"),
  t("crop-pdf", "Crop", "Trim margins or set a new page box", "edit", "client", "crop"),
  t("resize-pdf", "Resize", "Change page size or add margins", "edit", "client", "arrows-out"),
  t("flip-pdf", "Flip", "Mirror pages horizontally or vertically", "edit", "client", "flip-horizontal"),
  t("n-up", "N-up", "Print several pages per sheet", "edit", "client", "grid-four", "n-up-pdf"),
  t("pdf-editor", "Edit PDF", "Add and change text, images, shapes and links", "edit", "client", "pencil-simple-line"),
  t("fill-sign", "Fill & sign", "Fill in forms and add your signature", "edit", "client", "signature", "sign-pdf"),
  t("create-forms", "Create forms", "Make any PDF fillable", "edit", "client", "textbox", "pdf-forms"),
  t("watermark-pdf", "Watermark", "Stamp text or an image on pages", "edit", "client", "stamp"),
  t("page-numbers", "Page numbers", "Number your pages", "edit", "client", "list-numbers", "page-numbers-pdf"),
  t("header-footer", "Header & footer", "Add labels to the top or bottom of pages", "edit", "client", "rows", "header-footer-pdf"),
  t("bates-numbering", "Bates numbering", "Stamp legal Bates numbers across many files", "edit", "client", "hash", "bates-numbering-pdf"),
  t("edit-metadata", "Edit metadata", "Change title, author, keywords and more", "edit", "client", "tag", "edit-pdf-metadata"),
  t("bookmarks", "Bookmarks", "Create or edit the document outline", "edit", "client", "bookmarks", "pdf-bookmarks"),
  t("rename-pdf", "Rename by content", "Name files using text found inside them", "edit", "client", "text-aa"),
  t("remove-annotations", "Remove annotations", "Strip highlights, comments and markup", "edit", "client", "eraser", "delete-pdf-annotations"),
  t("flatten-pdf", "Flatten", "Lock form fields and annotations into the page", "edit", "client", "stack-simple"),
  t("compress-pdf", "Compress", "Make your PDF smaller", "optimize", "server", "arrows-in"),
  t("grayscale-pdf", "Grayscale", "Convert colors to shades of gray", "optimize", "server", "circle-half"),
  t("repair-pdf", "Repair", "Recover content from a damaged file", "optimize", "server", "wrench"),
  t("protect-pdf", "Protect", "Add a password and permissions", "security", "server", "lock", "encrypt-pdf"),
  t("unlock-pdf", "Unlock", "Remove passwords and restrictions", "security", "server", "lock-open"),
  t("pdf-to-word", "PDF to Word", "Editable .docx from your PDF", "convert-from", "server", "file-doc"),
  t("pdf-to-excel", "PDF to Excel", "Pull tables into .xlsx or CSV", "convert-from", "server", "file-xls"),
  t("pdf-to-ppt", "PDF to PowerPoint", "Slides from your PDF pages", "convert-from", "server", "file-ppt"),
  t("pdf-to-image", "PDF to image", "Pages as JPG, PNG or TIFF", "convert-from", "client", "image", "pdf-to-jpg"),
  t("pdf-to-text", "PDF to text", "Copy out all the text", "convert-from", "client", "file-txt", "extract-text-from-pdf"),
  t("extract-images", "Extract images", "Save every embedded image", "convert-from", "client", "images", "extract-images-from-pdf"),
  t("image-to-pdf", "Image to PDF", "Turn JPG, PNG and other images into a PDF", "convert-to", "client", "file-image", "jpg-to-pdf"),
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

/** Header shortcuts: up to `max` usable tools, popular order first, then registry order. */
export function shortcutTools(max = 5, list: readonly Tool[] = tools): Tool[] {
  const usable = list.filter(isUsable);
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
