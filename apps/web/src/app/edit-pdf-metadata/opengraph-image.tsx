import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Edit PDF metadata on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Edit PDF metadata", line: "Free, in your browser. Nothing is uploaded." });
}
