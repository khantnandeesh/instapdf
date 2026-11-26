import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Combine & reorder PDF pages on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Combine & reorder PDF pages", line: "Free, in your browser. Nothing is uploaded." });
}
