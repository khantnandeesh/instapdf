import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Split PDF by size on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Split PDF by size", line: "Free, in your browser. Nothing is uploaded." });
}
