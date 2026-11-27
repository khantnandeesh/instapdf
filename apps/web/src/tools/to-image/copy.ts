/** PDF to image copy (spec F12 §2). Our own wording. */
import { formatCount as n } from "@/components/page-select/copy";

export const toImageCopy = {
  stepFormat: "Format",
  format: "Image format",
  stepSize: "Resolution",
  size: "Resolution",
  sizes: {
    75: { label: "Small", title: "75 dpi: for screens and email" },
    150: { label: "Medium", title: "150 dpi: sharp on screen" },
    220: { label: "Large", title: "220 dpi: for zooming in" },
    300: { label: "Print", title: "300 dpi: print quality" },
  },
  grey: "Black and white",
  singleTiff: "One TIFF file with all pages",
  tile: (page: number, total: number) => `Page ${n(page)} of ${n(total)}`,
  primary: (pages: number) => (pages === 1 ? "Convert 1 page" : `Convert ${n(pages)} pages`),
  status: (k: number, total: number) => (k === total ? `All ${n(total)} pages` : `${n(k)} of ${n(total)} pages`),
  live: (k: number, total: number) => (k === 0 ? `All ${n(total)} pages will be converted` : `${n(k)} of ${n(total)} pages picked`),
  gridHint: "Click pages to convert only those. With none picked, every page is converted.",
};
