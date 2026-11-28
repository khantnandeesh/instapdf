import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "N-up PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "N-up PDF", line: "Free, in your browser. Nothing is uploaded." });
}
