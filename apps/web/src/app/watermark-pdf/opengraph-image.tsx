import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Watermark PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Watermark PDF", line: "Free, in your browser. Nothing is uploaded." });
}
