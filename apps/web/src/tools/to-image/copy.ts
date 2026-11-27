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
  primary: (pages: number) => (pages === 1 ? "Convert 1 page" : `Convert ${n(pages)} pages`),
  gridHint: "Click pages to convert only those. With none picked, every page is converted.",
};
