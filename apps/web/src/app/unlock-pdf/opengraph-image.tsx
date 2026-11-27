import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Unlock PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Remove a PDF password", line: "Free, in your browser. Nothing is uploaded." });
}
