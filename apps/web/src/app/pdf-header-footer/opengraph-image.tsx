import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Header and footer on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Header and footer", line: "Free, in your browser. Nothing is uploaded." });
}
