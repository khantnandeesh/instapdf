import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "PDF to text on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "PDF to text", line: "Free, in your browser. Nothing is uploaded." });
}
