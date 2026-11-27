import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Extract images from PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Extract images from a PDF", line: "Free, in your browser. Nothing is uploaded." });
}
