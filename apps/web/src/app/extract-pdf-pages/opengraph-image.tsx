import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Extract PDF pages on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Extract PDF pages", line: "Free, in your browser. Nothing is uploaded." });
}
