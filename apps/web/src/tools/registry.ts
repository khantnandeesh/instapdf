/**
 * Single source of truth for every InstaPDF tool.
 * `ref` is the matching Sejda slug, used only by the parity evaluator.
 * `runtime`: "client" = processed in the browser, nothing uploaded; "server" = processing worker.
 */
import { pdfOutputName, zipName } from "../lib/pdf/naming";

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
  /** Present once the tool runs on the shared flow. */
  flow?: ToolFlowConfig;
};

const MB = 1024 * 1024;
const PDF_ONLY = { mime: ["application/pdf"], extensions: [".pdf"] };

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
};

const t = (
  slug: string,
  name: string,
  summary: string,
  category: ToolCategory,
  runtime: Tool["runtime"],
  ref = slug,
): Tool => ({ slug, name, summary, category, runtime, ref, ...(flows[slug] ?? { status: "planned" }) });

export const tools: Tool[] = [
  t("merge-pdf", "Merge", "Join PDFs and images into a single document", "organize", "client"),
  t("split-pdf", "Split", "Break a PDF into parts by page ranges", "organize", "client"),
  t("extract-pages", "Extract pages", "Keep only the pages you pick", "organize", "client", "extract-pdf-pages"),
  t("delete-pages", "Delete pages", "Remove unwanted pages", "organize", "client", "delete-pdf-pages"),
  t("rotate-pdf", "Rotate", "Turn pages and save the rotation", "organize", "client", "rotate-pdf-pages"),
  t("organize-pdf", "Organize", "Reorder, duplicate and remove pages visually", "organize", "client"),
  t("combine-reorder", "Combine & reorder", "Mix pages from several files in any order", "organize", "client", "visually-combine-reorder-pdf"),
  t("alternate-mix", "Alternate & mix", "Interleave pages from two or more files", "organize", "client", "alternate-mix-pdf"),
  t("split-by-bookmarks", "Split by bookmarks", "One file per chapter, using the outline", "organize", "client", "split-pdf-by-outline"),
  t("split-by-size", "Split by size", "Parts no bigger than a target size", "organize", "client", "split-pdf-by-size"),
  t("split-by-text", "Split by text", "Start a new file when page text changes", "organize", "client", "split-pdf-by-text"),
  t("split-in-half", "Split in half", "Cut two-page scans into single pages", "organize", "client", "split-pdf-down-the-middle"),
  t("crop-pdf", "Crop", "Trim margins or set a new page box", "edit", "client"),
  t("resize-pdf", "Resize", "Change page size or add margins", "edit", "client"),
  t("flip-pdf", "Flip", "Mirror pages horizontally or vertically", "edit", "client"),
  t("n-up", "N-up", "Print several pages per sheet", "edit", "client", "n-up-pdf"),
  t("pdf-editor", "Edit PDF", "Add and change text, images, shapes and links", "edit", "client"),
  t("fill-sign", "Fill & sign", "Fill in forms and add your signature", "edit", "client", "sign-pdf"),
  t("create-forms", "Create forms", "Make any PDF fillable", "edit", "client", "pdf-forms"),
  t("watermark-pdf", "Watermark", "Stamp text or an image on pages", "edit", "client"),
  t("page-numbers", "Page numbers", "Number your pages", "edit", "client", "page-numbers-pdf"),
  t("header-footer", "Header & footer", "Add labels to the top or bottom of pages", "edit", "client", "header-footer-pdf"),
  t("bates-numbering", "Bates numbering", "Stamp legal Bates numbers across many files", "edit", "client", "bates-numbering-pdf"),
  t("edit-metadata", "Edit metadata", "Change title, author, keywords and more", "edit", "client", "edit-pdf-metadata"),
  t("bookmarks", "Bookmarks", "Create or edit the document outline", "edit", "client", "pdf-bookmarks"),
  t("rename-pdf", "Rename by content", "Name files using text found inside them", "edit", "client"),
  t("remove-annotations", "Remove annotations", "Strip highlights, comments and markup", "edit", "client", "delete-pdf-annotations"),
  t("flatten-pdf", "Flatten", "Lock form fields and annotations into the page", "edit", "client"),
  t("compress-pdf", "Compress", "Make your PDF smaller", "optimize", "server"),
  t("grayscale-pdf", "Grayscale", "Convert colors to shades of gray", "optimize", "server"),
  t("repair-pdf", "Repair", "Recover content from a damaged file", "optimize", "server"),
  t("protect-pdf", "Protect", "Add a password and permissions", "security", "server", "encrypt-pdf"),
  t("unlock-pdf", "Unlock", "Remove passwords and restrictions", "security", "server"),
  t("pdf-to-word", "PDF to Word", "Editable .docx from your PDF", "convert-from", "server"),
  t("pdf-to-excel", "PDF to Excel", "Pull tables into .xlsx or CSV", "convert-from", "server"),
  t("pdf-to-ppt", "PDF to PowerPoint", "Slides from your PDF pages", "convert-from", "server"),
  t("pdf-to-image", "PDF to image", "Pages as JPG, PNG or TIFF", "convert-from", "client", "pdf-to-jpg"),
  t("pdf-to-text", "PDF to text", "Copy out all the text", "convert-from", "client", "extract-text-from-pdf"),
  t("extract-images", "Extract images", "Save every embedded image", "convert-from", "client", "extract-images-from-pdf"),
  t("image-to-pdf", "Image to PDF", "Turn JPG, PNG and other images into a PDF", "convert-to", "client", "jpg-to-pdf"),
  t("word-to-pdf", "Word to PDF", "Convert .docx documents", "convert-to", "server"),
  t("html-to-pdf", "Web page to PDF", "Capture URLs or HTML as PDF", "convert-to", "server"),
  t("ocr-pdf", "OCR", "Make scanned PDFs searchable", "scans", "server"),
  t("deskew-pdf", "Deskew", "Straighten tilted scans", "scans", "server"),
  t("workflows", "Workflows", "Chain tools and run them in one go", "automate", "client"),
];

export const toolBySlug = (slug: string) => tools.find((x) => x.slug === slug);

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
