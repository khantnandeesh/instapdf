import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Bates numbering on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Bates numbering", line: "Free, in your browser. Nothing is uploaded." });
}
