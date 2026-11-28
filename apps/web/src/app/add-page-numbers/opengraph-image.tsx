import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Add page numbers on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Add page numbers", line: "Free, in your browser. Nothing is uploaded." });
}
