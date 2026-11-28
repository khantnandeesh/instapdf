import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Edit PDF bookmarks on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Edit PDF bookmarks", line: "Free, in your browser. Nothing is uploaded." });
}
