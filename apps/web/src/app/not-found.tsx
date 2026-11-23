import type { Metadata } from "next";
import { NotFoundPage } from "@/components/site/pages";

export const metadata: Metadata = { title: "Page not found · BerryPDF", robots: { index: false } };

export default function NotFound() {
  return <NotFoundPage />;
}
