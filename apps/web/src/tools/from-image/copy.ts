/** Image to PDF copy (spec F12 §3). Our own wording; Merge's strings cover tiles, moves and removals. */
import { formatCount as n } from "@/lib/format-count";

export const fromImageCopy = {
  pickerButton: "Choose images",
  pickerHint: "or drop them here",
  limits: "JPG, PNG and more, up to 50 images, 100 MB each",
  limitsFull: "JPG, PNG, GIF, BMP, WebP or TIFF · up to 50 files, 100 MB each, 500 MB and 1,000 pages in total · you can also paste them with Ctrl+V",
  statusEmpty: "Add images to start",
  errorType: (name: string) => `${name} isn't an image we can read, so it was skipped. This tool accepts JPG, PNG, GIF, BMP, WebP and TIFF images.`,
  status: (pages: number) => (pages === 1 ? "1 page" : `${n(pages)} pages`),
  pagesLabel: "Images, in page order",
  filesLabel: "Image files",
  sort: "Sort",
  size: "Page size",
  sizes: { fit: "Fit to image", a4: "A4", a3: "A3", a5: "A5", letter: "Letter", legal: "Legal" },
  orientation: "Orientation",
  orientations: { auto: "Auto", portrait: "Portrait", landscape: "Landscape" },
  margin: "Margin",
  margins: { "0": "No margin", "36": "Small margin", "72": "Large margin" },
};
