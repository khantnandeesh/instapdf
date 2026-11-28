import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Grayscale PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Grayscale PDF", line: "Free, in your browser. Nothing is uploaded." });
}
