import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "Split PDF by bookmarks on BerryPDF";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Split PDF by bookmarks", line: "Free, in your browser. Nothing is uploaded." });
}
