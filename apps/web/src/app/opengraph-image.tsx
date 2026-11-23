import { ogContentType, ogImage, ogSize } from "@/lib/seo/og";

export const alt = "BerryPDF: free, private PDF tools";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({ title: "Free PDF tools", line: "Fast and private. Most tools never upload your files." });
}
