import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Split PDF by text on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Split PDF by text", line: "Free, in your browser. Nothing is uploaded." });
}
