import type { MetadataRoute } from "next";
import { siteCopy } from "@/components/site/copy";

/** Web app manifest: name, colours and icons for install prompts and search/app surfaces. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BerryPDF",
    short_name: "BerryPDF",
    description: siteCopy.homeDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#fffdfb",
    theme_color: "#d92b4b",
    icons: [
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
