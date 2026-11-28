import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Flatten PDF on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Flatten PDF", line: "Free, in your browser. Nothing is uploaded." });
}
