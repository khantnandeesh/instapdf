import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Rename PDF by content on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Rename PDF by content", line: "Free, in your browser. Nothing is uploaded." });
}
