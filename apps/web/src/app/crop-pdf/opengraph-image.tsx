import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Crop PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Crop PDF", line: "Free, in your browser. Nothing is uploaded." });
}
