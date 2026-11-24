import type { Metadata } from "next";
import { NotFoundPage } from "@/components/site/pages";

export const metadata: Metadata = { title: { absolute: "Page not found | BerryPDF" }, robots: { index: false } };

export default function NotFound() {
  return <NotFoundPage />;
}
